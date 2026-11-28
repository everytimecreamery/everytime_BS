-- =============================================================================
-- EVERYTIME CREAMERY — FINAL SECURITY HARDENING (MIGRATION 06)
-- Migration: 20261122000006_final_security_hardening.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Remediations:
--   1. Public Signup & Staff Provisioning:
--      - Replace auto-provisioning handle_new_user() trigger with invite-gated
--        provisioning backed by owner-controlled public.staff_invitations.
--      - Arbitrary public signups receive NO profile, NO role, and NO store access.
--      - Preserves concurrency-safe initial owner bootstrap via bootstrap_initial_owner().
--      - Restricts menu/catalog read policies to provisioned staff/owner roles.
--   2. Profile PIN Hash Confidentiality:
--      - Tighten profiles_select_policy so staff only see their own row (owners see all).
--      - Revoke SELECT/INSERT/UPDATE on public.profiles.pin_hash from anon/authenticated
--        at the PostgreSQL column privilege level.
--   3. Terminal Update Restrictions:
--      - Enforce BEFORE UPDATE trigger restricting staff terminal updates strictly to
--        last_synced_at within their assigned store; protect terminal_number,
--        device_name, store_id, id, and created_at.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. OWNER-CONTROLLED STAFF INVITATIONS & HARDENED SIGNUP TRIGGER
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(email)) > 3),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(full_name)) > 0),
    cashier_code TEXT,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role = 'staff'),
    invited_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (pg_catalog.now() + INTERVAL '7 days'),
    accepted_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitations_active_email
    ON public.staff_invitations (lower(pg_catalog.btrim(email)))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_staff_invitations_store_id
    ON public.staff_invitations (store_id);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_invitations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_invitations TO authenticated, service_role;

DROP POLICY IF EXISTS "staff_invitations_owner_all" ON public.staff_invitations;
CREATE POLICY "staff_invitations_owner_all" ON public.staff_invitations
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

-- Invite-gated handle_new_user():
-- Only creates a 'staff' profile when an active, unexpired, unrevoked owner
-- invitation exists for the normalized email. Arbitrary public signups receive
-- NO profile row and NO store access.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invite public.staff_invitations%ROWTYPE;
    v_normalized_email TEXT;
BEGIN
    v_normalized_email := lower(pg_catalog.btrim(COALESCE(new.email, '')));
    IF v_normalized_email = '' THEN
        RETURN new;
    END IF;

    SELECT * INTO v_invite
    FROM public.staff_invitations
    WHERE lower(pg_catalog.btrim(email)) = v_normalized_email
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > pg_catalog.now()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Uninvited public signup: deliberately do NOT provision a profile.
        RETURN new;
    END IF;

    INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
    VALUES (
        new.id,
        v_invite.store_id,
        'staff',
        pg_catalog.btrim(v_invite.full_name),
        COALESCE(nullif(pg_catalog.btrim(v_invite.cashier_code), ''), 'C01')
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.staff_invitations
    SET accepted_at = pg_catalog.now()
    WHERE id = v_invite.id;

    RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Tighten check_profile_insert() so unprofiled / staff sessions cannot self-provision profiles
CREATE OR REPLACE FUNCTION public.check_profile_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    user_id UUID;
    user_role TEXT;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    IF jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF jwt_role IS NULL AND user_id IS NULL THEN
        RETURN NEW;
    END IF;

    user_role := public.get_user_role();

    IF user_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: only owners or approved provisioning can create user profiles.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_profile_insert() FROM PUBLIC, anon, authenticated;

-- Ensure initial owner bootstrap remains deterministic and works when no profile was auto-created
CREATE OR REPLACE FUNCTION public.bootstrap_initial_owner(target_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    matched_user_id UUID;
    existing_owner_count INT;
    default_store_id UUID;
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('owner_bootstrap_lock'));

    SELECT COUNT(*) INTO existing_owner_count FROM public.profiles WHERE role = 'owner';
    IF existing_owner_count > 0 THEN
        RAISE EXCEPTION 'Bootstrap denied: System already has an active owner (% existing owner profile(s)). Subsequent promotions must be done by an existing owner.', existing_owner_count;
    END IF;

    SELECT id INTO matched_user_id
    FROM auth.users
    WHERE lower(pg_catalog.btrim(email)) = lower(pg_catalog.btrim(target_email));

    IF matched_user_id IS NULL THEN
        RAISE EXCEPTION 'Bootstrap failed: User with email "%" does not exist in auth.users. The user must sign up first before elevation.', target_email;
    END IF;

    SELECT id INTO default_store_id FROM public.stores ORDER BY created_at ASC LIMIT 1;

    UPDATE public.profiles
    SET role = 'owner',
        store_id = COALESCE(store_id, default_store_id),
        updated_at = pg_catalog.now()
    WHERE id = matched_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, role, full_name, cashier_code, store_id)
        VALUES (
            matched_user_id,
            'owner',
            pg_catalog.split_part(pg_catalog.btrim(target_email), '@', 1),
            'OWNER',
            default_store_id
        );
    END IF;

    RETURN 'Success: User ' || target_email || ' (' || matched_user_id::text || ') is now the bootstrap owner.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) TO service_role;

-- Tighten catalog read policies so unprovisioned auth.users accounts have zero access
DROP POLICY IF EXISTS "categories_read_all" ON public.categories;
CREATE POLICY "categories_read_all" ON public.categories
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('staff', 'owner'));

DROP POLICY IF EXISTS "menu_items_read_all" ON public.menu_items;
CREATE POLICY "menu_items_read_all" ON public.menu_items
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('staff', 'owner'));

DROP POLICY IF EXISTS "menu_variants_read_all" ON public.menu_variants;
CREATE POLICY "menu_variants_read_all" ON public.menu_variants
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('staff', 'owner'));

DROP POLICY IF EXISTS "menu_addons_read_all" ON public.menu_addons;
CREATE POLICY "menu_addons_read_all" ON public.menu_addons
    FOR SELECT TO authenticated
    USING (public.get_user_role() IN ('staff', 'owner'));

-- -----------------------------------------------------------------------------
-- 2. PROTECT PROFILE PIN HASHES (COLUMN-LEVEL ACLs + TIGHTENED SELECT RLS)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        id = (SELECT auth.uid())
        OR public.get_user_role() = 'owner'
    );

DROP POLICY IF EXISTS "profiles_owner_all" ON public.profiles;
CREATE POLICY "profiles_owner_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

-- Column-level privileges: exclude pin_hash from ALL anon/authenticated access.
-- pin_hash can only be read/written by service_role or SECURITY DEFINER server logic.
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, store_id, role, full_name, cashier_code, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT INSERT (id, store_id, role, full_name, cashier_code, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT UPDATE (store_id, role, full_name, cashier_code, updated_at)
    ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- -----------------------------------------------------------------------------
-- 3. RESTRICT TERMINAL UPDATES FOR STAFF TO SYNC TIMESTAMP ONLY
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "terminals_staff_update_sync" ON public.terminals;
CREATE POLICY "terminals_staff_update_sync" ON public.terminals
    FOR UPDATE TO authenticated
    USING (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
    )
    WITH CHECK (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
    );

CREATE OR REPLACE FUNCTION public.check_terminal_update_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    user_id UUID;
    caller_role TEXT;
    caller_store_id UUID;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    IF jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    IF jwt_role IS NULL AND user_id IS NULL THEN
        RETURN NEW;
    END IF;

    caller_role := public.get_user_role();

    IF caller_role = 'owner' THEN
        RETURN NEW;
    END IF;

    IF caller_role = 'staff' THEN
        caller_store_id := public.get_user_store_id();
        IF OLD.store_id IS DISTINCT FROM caller_store_id THEN
            RAISE EXCEPTION 'Unauthorized: staff cannot update terminals outside their assigned store.';
        END IF;

        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.store_id IS DISTINCT FROM OLD.store_id
           OR NEW.terminal_number IS DISTINCT FROM OLD.terminal_number
           OR NEW.device_name IS DISTINCT FROM OLD.device_name
           OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'Unauthorized: staff can only update terminal synchronization timestamps (last_synced_at).';
        END IF;

        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Unauthorized: terminal updates require an active staff or owner profile.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_terminal_update_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_restrict_staff_terminal_update ON public.terminals;
CREATE TRIGGER trg_restrict_staff_terminal_update
    BEFORE UPDATE ON public.terminals
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_terminal_update_fields();
