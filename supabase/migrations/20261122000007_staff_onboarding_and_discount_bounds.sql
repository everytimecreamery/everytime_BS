-- =============================================================================
-- EVERYTIME CREAMERY — OPERATIONAL COMPLETION (MIGRATION 07)
-- Migration: 20261122000007_staff_onboarding_and_discount_bounds.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Remediations:
--   1. Staff Onboarding & Account Deactivation:
--      - Add is_active, deactivated_at, deactivated_by to public.profiles so
--        owners can deactivate staff without violating ON DELETE RESTRICT on
--        historical orders, while immediately revoking access for any existing
--        authentication session (get_user_role / get_user_store_id / RLS / RPC).
--      - Add superseded_at to public.staff_invitations and update the partial
--        unique index so expired invitations can be cleanly re-invited without
--        losing expired status history.
--      - Support both direct auth.users signup provisioning (for non-invite-pending
--        rows) and Supabase Auth Admin inviteUserByEmail() deferred confirmation
--        (invited_at IS NOT NULL, email_confirmed_at NULL -> NOT NULL).
--      - Ensure one-time, concurrency-safe invitation acceptance via advisory lock
--        + FOR UPDATE row locking, preventing replay or duplicate provisioning.
--   2. Discount < 100% & Positive Total Enforcement:
--      - Update complete_pos_checkout() to reject >= 100% discounts and
--        non-positive authoritative order totals until complimentary orders are
--        officially confirmed by the business owner.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. STAFF PROFILE ACTIVATION STATE & IMMEDIATE SESSION LOCKOUT
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deactivated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON public.profiles(is_active);

-- Preserve pin_hash column confidentiality while exposing is_active/deactivation metadata
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, store_id, role, full_name, cashier_code, is_active, deactivated_at, deactivated_by, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT INSERT (id, store_id, role, full_name, cashier_code, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT UPDATE (store_id, role, full_name, cashier_code, is_active, deactivated_at, deactivated_by, updated_at)
    ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- Immediately revoke DB-level role & store access for deactivated profiles
-- even if the user holds an unexpired JWT access token.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT store_id FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND is_active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated, service_role;

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (
        (id = (SELECT auth.uid()) AND is_active = true)
        OR public.get_user_role() = 'owner'
    );

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()) AND is_active = true)
    WITH CHECK (id = (SELECT auth.uid()) AND is_active = true);

-- Tighten profile update guard so only active owners (or service_role) can change
-- is_active / deactivation fields, and owners cannot accidentally deactivate themselves.
CREATE OR REPLACE FUNCTION public.check_profile_role_update()
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
        IF OLD.id IS DISTINCT FROM user_id THEN
            RAISE EXCEPTION 'Unauthorized: staff can only modify their own profile.';
        END IF;
    END IF;

    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF user_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can modify user roles.';
        END IF;
    END IF;

    IF OLD.store_id IS DISTINCT FROM NEW.store_id THEN
        IF user_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can modify store assignments.';
        END IF;
    END IF;

    IF OLD.is_active IS DISTINCT FROM NEW.is_active
       OR OLD.deactivated_at IS DISTINCT FROM NEW.deactivated_at
       OR OLD.deactivated_by IS DISTINCT FROM NEW.deactivated_by THEN
        IF user_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can activate or deactivate staff accounts.';
        END IF;
        IF NEW.id = user_id AND NEW.is_active = false THEN
            RAISE EXCEPTION 'Validation error: Owners cannot deactivate their own active account.';
        END IF;
        IF OLD.role = 'owner' AND NEW.is_active = false THEN
            RAISE EXCEPTION 'Validation error: Owner accounts cannot be deactivated via staff deactivation.';
        END IF;
    END IF;

    IF OLD.role = 'owner' AND user_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: only owners can modify owner profiles.';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_profile_role_update() FROM PUBLIC, anon, authenticated;

-- Ensure initial owner bootstrap preserves active status on elevation
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
        is_active = true,
        deactivated_at = NULL,
        deactivated_by = NULL,
        updated_at = pg_catalog.now()
    WHERE id = matched_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, role, full_name, cashier_code, store_id, is_active)
        VALUES (
            matched_user_id,
            'owner',
            pg_catalog.split_part(pg_catalog.btrim(target_email), '@', 1),
            'OWNER',
            default_store_id,
            true
        );
    END IF;

    RETURN 'Success: User ' || target_email || ' (' || matched_user_id::text || ') is now the bootstrap owner.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. ONE-TIME INVITATION PROVISIONING & DEFERRED EMAIL-CONFIRMATION SUPPORT
-- -----------------------------------------------------------------------------

ALTER TABLE public.staff_invitations
    ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS accepted_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS public.idx_staff_invitations_active_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitations_active_email
    ON public.staff_invitations (lower(pg_catalog.btrim(email)))
    WHERE accepted_at IS NULL AND revoked_at IS NULL AND superseded_at IS NULL;

-- Concurrency-safe, one-time staff provisioning helper called strictly from
-- auth.users triggers.
CREATE OR REPLACE FUNCTION public.provision_staff_from_invitation(
    p_user_id UUID,
    p_email TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invite public.staff_invitations%ROWTYPE;
    v_normalized_email TEXT;
BEGIN
    v_normalized_email := lower(pg_catalog.btrim(COALESCE(p_email, '')));
    IF p_user_id IS NULL OR v_normalized_email = '' THEN
        RETURN;
    END IF;

    -- Serialize concurrent provisioning attempts for the same email
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('staff_invite_' || v_normalized_email));

    -- Never re-provision or reactivate an already-existing (including deactivated) profile
    IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id) THEN
        RETURN;
    END IF;

    SELECT * INTO v_invite
    FROM public.staff_invitations
    WHERE lower(pg_catalog.btrim(email)) = v_normalized_email
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND superseded_at IS NULL
      AND expires_at > pg_catalog.now()
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
        -- Uninvited, expired, revoked, or already-accepted email: provision NOTHING.
        RETURN;
    END IF;

    INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code, is_active)
    VALUES (
        p_user_id,
        v_invite.store_id,
        'staff',
        pg_catalog.btrim(v_invite.full_name),
        COALESCE(nullif(pg_catalog.btrim(v_invite.cashier_code), ''), 'C01'),
        true
    )
    ON CONFLICT (id) DO NOTHING;

    UPDATE public.staff_invitations
    SET accepted_at = pg_catalog.now(),
        accepted_user_id = p_user_id
    WHERE id = v_invite.id
      AND accepted_at IS NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.provision_staff_from_invitation(UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- Trigger on auth.users INSERT:
--   - If GoTrue inviteUserByEmail created an unconfirmed user (invited_at IS NOT NULL
--     AND email_confirmed_at IS NULL), defer provisioning until email confirmation.
--   - Otherwise (direct pre-confirmed / simulated signup), provision immediately
--     if and only if a matching active invitation exists.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_json JSONB;
    v_invited_at TEXT;
    v_email_confirmed_at TEXT;
BEGIN
    v_user_json := pg_catalog.to_jsonb(new);
    v_invited_at := nullif(pg_catalog.btrim(COALESCE(v_user_json->>'invited_at', '')), '');
    v_email_confirmed_at := nullif(pg_catalog.btrim(COALESCE(v_user_json->>'email_confirmed_at', '')), '');

    IF v_invited_at IS NOT NULL AND v_email_confirmed_at IS NULL THEN
        -- Invite email dispatched; wait until user accepts link & confirms email.
        RETURN new;
    END IF;

    PERFORM public.provision_staff_from_invitation(new.id, new.email);
    RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Trigger on auth.users UPDATE:
--   - Provisions invited staff profile once email_confirmed_at transitions from NULL
--     to a non-null timestamp when the user accepts the invite email link.
CREATE OR REPLACE FUNCTION public.handle_user_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_old_confirmed TEXT;
    v_new_confirmed TEXT;
BEGIN
    v_old_confirmed := nullif(pg_catalog.btrim(COALESCE(pg_catalog.to_jsonb(old)->>'email_confirmed_at', '')), '');
    v_new_confirmed := nullif(pg_catalog.btrim(COALESCE(pg_catalog.to_jsonb(new)->>'email_confirmed_at', '')), '');

    IF v_old_confirmed IS NULL AND v_new_confirmed IS NOT NULL THEN
        PERFORM public.provision_staff_from_invitation(new.id, new.email);
    END IF;

    RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_user_confirmation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
CREATE TRIGGER on_auth_user_confirmed
    AFTER UPDATE ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_user_confirmation();

-- Also ensure deactivated owners cannot run correct_payment_method()
CREATE OR REPLACE FUNCTION public.correct_payment_method(
    p_payment_id UUID,
    p_new_method TEXT,
    p_reason TEXT
)
RETURNS public.payment_corrections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    actor_id UUID;
    actor_role TEXT;
    trimmed_reason TEXT;
    normalized_method TEXT;
    v_order_id UUID;
    target_order public.orders%ROWTYPE;
    target_payment public.payments%ROWTYPE;
    created_event public.payment_corrections%ROWTYPE;
BEGIN
    jwt_role := (SELECT auth.role());
    actor_id := (SELECT auth.uid());

    IF actor_id IS NULL OR jwt_role IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: Payment correction requires a valid authenticated owner session.';
    END IF;

    SELECT role INTO actor_role
    FROM public.profiles
    WHERE id = actor_id
      AND is_active = true;

    IF actor_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only active owners are authorized to correct payment methods.';
    END IF;

    trimmed_reason := pg_catalog.btrim(COALESCE(p_reason, ''));
    IF pg_catalog.char_length(trimmed_reason) = 0 THEN
        RAISE EXCEPTION 'Validation error: A correction reason is mandatory.';
    END IF;

    normalized_method := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_new_method, '')));
    IF normalized_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Validation error: Invalid payment method "%". Must be cash, upi, or card.', p_new_method;
    END IF;

    SELECT order_id INTO v_order_id
    FROM public.payments
    WHERE id = p_payment_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;

    SELECT * INTO target_order
    FROM public.orders
    WHERE id = v_order_id
    FOR UPDATE;

    IF target_order.status IN ('CANCELLED', 'VOID') THEN
        RAISE EXCEPTION 'Financial audit violation: Cannot correct payment method for a % order.', target_order.status;
    END IF;

    SELECT * INTO target_payment
    FROM public.payments
    WHERE id = p_payment_id
    FOR UPDATE;

    IF target_payment.method = normalized_method THEN
        RAISE EXCEPTION 'Validation error: Payment method is already %.', normalized_method;
    END IF;

    PERFORM pg_catalog.set_config('app.payment_correction_rpc', 'true', true);

    UPDATE public.payments
    SET method = normalized_method
    WHERE id = p_payment_id;

    INSERT INTO public.payment_corrections (
        payment_id,
        order_id,
        previous_method,
        new_method,
        amount_paise,
        reason,
        corrected_by,
        created_at
    ) VALUES (
        target_payment.id,
        target_payment.order_id,
        target_payment.method,
        normalized_method,
        target_payment.amount_paise,
        trimmed_reason,
        actor_id,
        pg_catalog.now()
    )
    RETURNING * INTO created_event;

    PERFORM pg_catalog.set_config('app.payment_correction_rpc', 'false', true);

    RETURN created_event;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. CHECKOUT RPC HARDENING: ACTIVE PROFILE CHECK & < 100% DISCOUNT ENFORCEMENT
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_pos_checkout(
    p_order_id UUID,
    p_terminal_id UUID DEFAULT NULL,
    p_token_terminal TEXT DEFAULT 'T1',
    p_token_seq INT DEFAULT NULL,
    p_items JSONB DEFAULT '[]'::jsonb,
    p_discount_percent NUMERIC DEFAULT 0,
    p_discount_type TEXT DEFAULT NULL,
    p_discount_reason TEXT DEFAULT NULL,
    p_payments JSONB DEFAULT '[]'::jsonb,
    p_client_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_business_date DATE DEFAULT NULL,
    p_cashier_id UUID DEFAULT NULL,
    p_expected_subtotal_paise BIGINT DEFAULT NULL,
    p_expected_total_paise BIGINT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_jwt_role TEXT;
    v_actor_id UUID;
    v_profile RECORD;
    v_store_id UUID;
    v_terminal RECORD;
    v_existing_order public.orders%ROWTYPE;
    v_token_terminal TEXT;
    v_token_seq INT;
    v_completed_at TIMESTAMPTZ;
    v_business_date DATE;
    v_discount_percent NUMERIC;
    v_discount_type TEXT;

    v_item JSONB;
    v_menu_item_id TEXT;
    v_variant_id TEXT;
    v_addon_id TEXT;
    v_qty_raw TEXT;
    v_quantity INT;
    v_expected_unit_raw TEXT;
    v_expected_unit_price BIGINT;

    v_db_item public.menu_items%ROWTYPE;
    v_cat_active BOOLEAN;
    v_cat_archived BOOLEAN;
    v_db_variant public.menu_variants%ROWTYPE;
    v_db_addon public.menu_addons%ROWTYPE;
    v_has_active_variants BOOLEAN;

    v_unit_price_paise BIGINT;
    v_addon_price_paise BIGINT;
    v_effective_unit_paise BIGINT;
    v_variant_label TEXT;
    v_addon_label TEXT;
    v_line_total_paise BIGINT;

    v_resolved_items JSONB := '[]'::jsonb;
    v_subtotal_paise BIGINT := 0;
    v_discount_paise BIGINT := 0;
    v_discounted_subtotal BIGINT := 0;
    v_tax_paise BIGINT := 0;
    v_cgst_paise BIGINT := 0;
    v_sgst_paise BIGINT := 0;
    v_total_paise BIGINT := 0;

    v_pay JSONB;
    v_pay_method TEXT;
    v_pay_amount_raw TEXT;
    v_pay_amount BIGINT;
    v_pay_utr TEXT;
    v_payment_sum BIGINT := 0;
BEGIN
    -- 1. Strict Active Cashier Authentication & Anti-Impersonation
    v_jwt_role := (SELECT auth.role());
    v_actor_id := (SELECT auth.uid());

    IF v_actor_id IS NULL OR v_jwt_role IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: POS checkout requires a valid authenticated cashier session.';
    END IF;

    IF p_cashier_id IS NOT NULL AND p_cashier_id IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Unauthorized: Cashier impersonation denied.';
    END IF;

    SELECT id, store_id, role, full_name, is_active
    INTO v_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR NOT v_profile.is_active OR v_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Active staff or owner profile is required for POS checkout.';
    END IF;

    IF v_profile.store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Cashier profile is not assigned to a store.';
    END IF;

    v_store_id := v_profile.store_id;

    -- 2. Validate Order ID, Timestamp, Discount (< 100%) & Basic Payload Shape
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Order ID is required.';
    END IF;

    IF p_client_completed_at IS NOT NULL AND p_client_completed_at > (pg_catalog.now() + INTERVAL '15 minutes') THEN
        RAISE EXCEPTION 'Validation error: Client completion timestamp cannot be in the future.';
    END IF;

    v_discount_percent := COALESCE(p_discount_percent, 0);
    IF NOT (v_discount_percent >= 0 AND v_discount_percent < 100) THEN
        RAISE EXCEPTION 'Validation error: Discount percentage must be >= 0 and less than 100 (100%% complimentary orders are not supported).';
    END IF;

    v_discount_type := CASE
        WHEN v_discount_percent > 0 THEN COALESCE(nullif(pg_catalog.btrim(p_discount_type), ''), 'PERCENTAGE')
        ELSE NULL
    END;

    IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) <> 'array' OR pg_catalog.jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Validation error: Checkout requires at least one order item.';
    END IF;

    IF pg_catalog.jsonb_array_length(p_items) > 200 THEN
        RAISE EXCEPTION 'Validation error: Order cannot exceed 200 line items.';
    END IF;

    IF p_payments IS NULL OR pg_catalog.jsonb_typeof(p_payments) <> 'array' OR pg_catalog.jsonb_array_length(p_payments) = 0 THEN
        RAISE EXCEPTION 'Payment validation failed: At least one payment tender is required.';
    END IF;

    IF pg_catalog.jsonb_array_length(p_payments) > 20 THEN
        RAISE EXCEPTION 'Payment validation failed: Too many split payment tenders.';
    END IF;

    -- Parse and validate payment tenders up front (bounds-safe before BIGINT cast)
    FOR v_pay IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payments)
    LOOP
        IF pg_catalog.jsonb_typeof(v_pay) <> 'object' THEN
            RAISE EXCEPTION 'Payment validation failed: Each payment tender must be a JSON object.';
        END IF;

        v_pay_method := pg_catalog.lower(pg_catalog.btrim(COALESCE(v_pay->>'method', '')));
        IF v_pay_method NOT IN ('cash', 'upi', 'card') THEN
            RAISE EXCEPTION 'Payment validation failed: Invalid payment method "%".', v_pay->>'method';
        END IF;

        v_pay_amount_raw := pg_catalog.btrim(COALESCE(v_pay->>'amount_paise', ''));
        IF v_pay_amount_raw !~ '^[0-9]+$' OR pg_catalog.char_length(v_pay_amount_raw) > 12 THEN
            RAISE EXCEPTION 'Payment validation failed: Payment amount must be a valid positive integer in paise.';
        END IF;

        v_pay_amount := v_pay_amount_raw::BIGINT;
        IF v_pay_amount <= 0 THEN
            RAISE EXCEPTION 'Payment validation failed: Payment amount must be greater than zero.';
        END IF;

        v_payment_sum := v_payment_sum + v_pay_amount;
    END LOOP;

    -- 3. Serialize Concurrent Requests for the Same Order ID & Check Idempotency Early
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('pos_checkout_order_' || p_order_id::text));

    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF FOUND THEN
        IF v_existing_order.store_id IS DISTINCT FROM v_store_id
           OR v_existing_order.cashier_id IS DISTINCT FROM v_actor_id THEN
            RAISE EXCEPTION 'Unauthorized: Order ID % belongs to another store or cashier.', p_order_id;
        END IF;

        IF v_existing_order.status = 'COMPLETED' THEN
            IF p_expected_subtotal_paise IS NOT NULL AND p_expected_subtotal_paise IS DISTINCT FROM v_existing_order.subtotal_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order subtotal does not match submitted payload.';
            END IF;

            IF p_expected_total_paise IS NOT NULL AND p_expected_total_paise IS DISTINCT FROM v_existing_order.total_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order total does not match submitted payload.';
            END IF;

            IF v_payment_sum IS DISTINCT FROM v_existing_order.total_paise THEN
                RAISE EXCEPTION 'Total manipulation rejected: Existing completed order total does not match submitted payload.';
            END IF;

            RETURN pg_catalog.jsonb_build_object(
                'order_id', v_existing_order.id,
                'cashier_id', v_existing_order.cashier_id,
                'store_id', v_existing_order.store_id,
                'terminal_id', v_existing_order.terminal_id,
                'token_terminal', v_existing_order.token_terminal,
                'token_seq', v_existing_order.token_seq,
                'status', v_existing_order.status,
                'subtotal_paise', v_existing_order.subtotal_paise,
                'discount_paise', v_existing_order.discount_paise,
                'tax_paise', v_existing_order.tax_paise,
                'cgst_paise', v_existing_order.cgst_paise,
                'sgst_paise', v_existing_order.sgst_paise,
                'total_paise', v_existing_order.total_paise,
                'idempotent', true
            );
        END IF;

        RAISE EXCEPTION 'Financial audit violation: Order ID % already exists with status %.', p_order_id, v_existing_order.status;
    END IF;

    -- 4. Validate Terminal Ownership & Lock Terminal for Sequential Token Assignment
    IF p_terminal_id IS NULL THEN
        SELECT id, store_id INTO v_terminal
        FROM public.terminals
        WHERE store_id = v_store_id
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: No terminal registered for store %.', v_store_id;
        END IF;
    ELSE
        SELECT id, store_id INTO v_terminal
        FROM public.terminals
        WHERE id = p_terminal_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Terminal % does not exist.', p_terminal_id;
        END IF;

        IF v_terminal.store_id IS DISTINCT FROM v_store_id THEN
            RAISE EXCEPTION 'Unauthorized: Terminal % does not belong to cashier''s assigned store.', p_terminal_id;
        END IF;
    END IF;

    -- 5. Validate Items & Compute Authoritative Database Prices
    FOR v_item IN SELECT * FROM pg_catalog.jsonb_array_elements(p_items)
    LOOP
        IF pg_catalog.jsonb_typeof(v_item) <> 'object' THEN
            RAISE EXCEPTION 'Validation error: Each item must be a JSON object.';
        END IF;

        v_menu_item_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'menu_item_id', '')), '');
        v_variant_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'variant_id', '')), '');
        v_addon_id := nullif(pg_catalog.btrim(COALESCE(v_item->>'addon_id', '')), '');
        v_qty_raw := pg_catalog.btrim(COALESCE(v_item->>'quantity', ''));

        IF v_menu_item_id IS NULL THEN
            RAISE EXCEPTION 'Validation error: Each item must include menu_item_id.';
        END IF;

        IF v_qty_raw !~ '^[0-9]+$' OR pg_catalog.char_length(v_qty_raw) > 6 THEN
            RAISE EXCEPTION 'Validation error: Item quantity must be a positive integer within allowed bounds.';
        END IF;

        v_quantity := v_qty_raw::INT;
        IF v_quantity <= 0 OR v_quantity > 10000 THEN
            RAISE EXCEPTION 'Validation error: Item quantity must be between 1 and 10000.';
        END IF;

        v_expected_unit_raw := nullif(pg_catalog.btrim(COALESCE(v_item->>'expected_unit_price_paise', '')), '');
        IF v_expected_unit_raw IS NOT NULL THEN
            IF v_expected_unit_raw !~ '^-?[0-9]+$' OR pg_catalog.char_length(v_expected_unit_raw) > 12 THEN
                RAISE EXCEPTION 'Validation error: Invalid expected unit price format.';
            END IF;
            v_expected_unit_price := v_expected_unit_raw::BIGINT;
        ELSE
            v_expected_unit_price := NULL;
        END IF;

        SELECT * INTO v_db_item
        FROM public.menu_items
        WHERE id = v_menu_item_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" does not exist.', v_menu_item_id;
        END IF;

        IF v_db_item.is_archived THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" is archived and cannot be sold.', v_db_item.name;
        END IF;

        IF NOT v_db_item.is_available THEN
            RAISE EXCEPTION 'Validation error: Menu item "%" is currently unavailable.', v_db_item.name;
        END IF;

        SELECT is_active, is_archived INTO v_cat_active, v_cat_archived
        FROM public.categories
        WHERE id = v_db_item.category_id;

        IF NOT FOUND OR v_cat_archived OR NOT v_cat_active THEN
            RAISE EXCEPTION 'Validation error: Category "%" for item "%" is inactive or archived.', v_db_item.category_id, v_db_item.name;
        END IF;

        IF v_db_item.category_id = 'gelato' THEN
            IF v_variant_id IS NOT NULL AND v_variant_id NOT IN ('85ml', 'cup-85ml') THEN
                RAISE EXCEPTION 'Validation error: Invalid variant "%" for single-scoop gelato "%".', v_variant_id, v_db_item.name;
            END IF;
            v_unit_price_paise := v_db_item.base_price_paise;
            v_variant_label := CASE WHEN v_variant_id IS NOT NULL THEN '85ml' ELSE NULL END;
        ELSIF v_variant_id IS NOT NULL THEN
            SELECT * INTO v_db_variant
            FROM public.menu_variants
            WHERE menu_item_id = v_db_item.id
              AND is_archived = false
              AND (id = v_variant_id OR label = v_variant_id)
            ORDER BY (id = v_variant_id) DESC
            LIMIT 1;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Validation error: Variant "%" not found or archived for item "%".', v_variant_id, v_db_item.name;
            END IF;

            v_unit_price_paise := v_db_variant.price_paise;
            v_variant_label := v_db_variant.label;
        ELSE
            SELECT EXISTS (
                SELECT 1 FROM public.menu_variants
                WHERE menu_item_id = v_db_item.id AND is_archived = false
            ) INTO v_has_active_variants;

            IF v_has_active_variants THEN
                RAISE EXCEPTION 'Validation error: Variant selection is required for "%".', v_db_item.name;
            END IF;

            v_unit_price_paise := v_db_item.base_price_paise;
            v_variant_label := NULL;
        END IF;

        IF v_unit_price_paise IS NULL OR v_unit_price_paise <= 0 THEN
            RAISE EXCEPTION 'Validation error: Invalid catalog price for item "%".', v_db_item.name;
        END IF;

        IF v_addon_id IS NULL OR v_addon_id = 'scoop-none' THEN
            v_addon_price_paise := 0;
            v_addon_label := NULL;
        ELSE
            SELECT * INTO v_db_addon
            FROM public.menu_addons
            WHERE id = v_addon_id
              AND is_archived = false
              AND is_available = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Validation error: Add-on "%" is invalid or unavailable.', v_addon_id;
            END IF;

            IF v_db_addon.category_id IS NOT NULL AND v_db_addon.category_id IS DISTINCT FROM v_db_item.category_id THEN
                RAISE EXCEPTION 'Validation error: Add-on "%" is not valid for item category "%".', v_addon_id, v_db_item.category_id;
            END IF;

            v_addon_price_paise := v_db_addon.price_paise;
            v_addon_label := v_db_addon.label;
        END IF;

        v_effective_unit_paise := v_unit_price_paise + v_addon_price_paise;

        IF v_expected_unit_price IS NOT NULL AND v_expected_unit_price IS DISTINCT FROM v_effective_unit_paise THEN
            RAISE EXCEPTION 'Price manipulation rejected: Client price % paise does not match catalog price % paise for "%".',
                v_expected_unit_price, v_effective_unit_paise, v_db_item.name;
        END IF;

        v_line_total_paise := v_effective_unit_paise * v_quantity;
        v_subtotal_paise := v_subtotal_paise + v_line_total_paise;

        v_resolved_items := v_resolved_items || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
                'menu_item_id', v_db_item.id,
                'product_name', v_db_item.name,
                'variant_label', v_variant_label,
                'addon_label', v_addon_label,
                'quantity', v_quantity,
                'unit_price_paise', v_unit_price_paise,
                'addon_price_paise', v_addon_price_paise,
                'total_price_paise', v_line_total_paise
            )
        );
    END LOOP;

    -- 6. Authoritative Financial Calculations (Integer Paise, 5% GST)
    v_discount_paise := LEAST(
        v_subtotal_paise,
        GREATEST(0, pg_catalog.round((v_subtotal_paise::numeric * v_discount_percent::numeric) / 100.0)::bigint)
    );
    v_discounted_subtotal := GREATEST(0, v_subtotal_paise - v_discount_paise);
    v_tax_paise := pg_catalog.round((v_discounted_subtotal::numeric * 5.0) / 100.0)::bigint;
    v_cgst_paise := pg_catalog.round(v_tax_paise::numeric / 2.0)::bigint;
    v_sgst_paise := v_tax_paise - v_cgst_paise;
    v_total_paise := v_discounted_subtotal + v_tax_paise;

    IF v_total_paise <= 0 THEN
        RAISE EXCEPTION 'Validation error: Authoritative order total must be greater than zero (complimentary orders are not supported).';
    END IF;

    IF p_expected_subtotal_paise IS NOT NULL AND p_expected_subtotal_paise IS DISTINCT FROM v_subtotal_paise THEN
        RAISE EXCEPTION 'Total manipulation rejected: Client subtotal % paise does not match server subtotal % paise.',
            p_expected_subtotal_paise, v_subtotal_paise;
    END IF;

    IF p_expected_total_paise IS NOT NULL AND p_expected_total_paise IS DISTINCT FROM v_total_paise THEN
        RAISE EXCEPTION 'Total manipulation rejected: Client total % paise does not match server total % paise.',
            p_expected_total_paise, v_total_paise;
    END IF;

    -- 7. Validate Split/Single Payment Tender Sum Against Authoritative Server Total
    IF v_payment_sum IS DISTINCT FROM v_total_paise THEN
        RAISE EXCEPTION 'Payment validation failed: Tendered payment total % paise does not match authoritative order total % paise.',
            v_payment_sum, v_total_paise;
    END IF;

    -- 8. Resolve Token Metadata & Business Date
    v_completed_at := COALESCE(p_client_completed_at, pg_catalog.now());
    v_business_date := COALESCE(p_business_date, (v_completed_at AT TIME ZONE 'UTC')::DATE);
    v_token_terminal := COALESCE(nullif(pg_catalog.btrim(p_token_terminal), ''), 'T1');

    IF p_token_seq IS NOT NULL AND p_token_seq > 0 THEN
        IF EXISTS (
            SELECT 1 FROM public.orders
            WHERE terminal_id = v_terminal.id
              AND business_date = v_business_date
              AND token_seq = p_token_seq
        ) THEN
            SELECT COALESCE(MAX(token_seq), 0) + 1 INTO v_token_seq
            FROM public.orders
            WHERE terminal_id = v_terminal.id
              AND business_date = v_business_date;
        ELSE
            v_token_seq := p_token_seq;
        END IF;
    ELSE
        SELECT COALESCE(MAX(token_seq), 0) + 1 INTO v_token_seq
        FROM public.orders
        WHERE terminal_id = v_terminal.id
          AND business_date = v_business_date;
    END IF;

    -- 9. Atomic Insert: Orders -> Order Items -> Payments
    PERFORM pg_catalog.set_config('app.checkout_rpc', 'true', true);

    INSERT INTO public.orders (
        id,
        store_id,
        terminal_id,
        cashier_id,
        token_terminal,
        token_seq,
        status,
        subtotal_paise,
        discount_paise,
        discount_type,
        discount_reason,
        discount_approved_by,
        tax_paise,
        cgst_paise,
        sgst_paise,
        total_paise,
        client_completed_at,
        business_date
    ) VALUES (
        p_order_id,
        v_store_id,
        v_terminal.id,
        v_actor_id,
        v_token_terminal,
        v_token_seq,
        'COMPLETED',
        v_subtotal_paise,
        v_discount_paise,
        v_discount_type,
        nullif(pg_catalog.btrim(COALESCE(p_discount_reason, '')), ''),
        NULL,
        v_tax_paise,
        v_cgst_paise,
        v_sgst_paise,
        v_total_paise,
        v_completed_at,
        v_business_date
    );

    INSERT INTO public.order_items (
        id,
        order_id,
        menu_item_id,
        product_name,
        variant_label,
        addon_label,
        quantity,
        unit_price_paise,
        addon_price_paise,
        total_price_paise
    )
    SELECT
        gen_random_uuid(),
        p_order_id,
        ri->>'menu_item_id',
        ri->>'product_name',
        nullif(ri->>'variant_label', ''),
        nullif(ri->>'addon_label', ''),
        (ri->>'quantity')::INT,
        (ri->>'unit_price_paise')::BIGINT,
        (ri->>'addon_price_paise')::BIGINT,
        (ri->>'total_price_paise')::BIGINT
    FROM pg_catalog.jsonb_array_elements(v_resolved_items) AS ri;

    FOR v_pay IN SELECT * FROM pg_catalog.jsonb_array_elements(p_payments)
    LOOP
        v_pay_method := pg_catalog.lower(pg_catalog.btrim(v_pay->>'method'));
        v_pay_amount := (v_pay->>'amount_paise')::BIGINT;
        v_pay_utr := nullif(pg_catalog.btrim(COALESCE(v_pay->>'upi_utr', '')), '');

        INSERT INTO public.payments (
            id,
            order_id,
            method,
            amount_paise,
            upi_utr,
            created_at
        ) VALUES (
            gen_random_uuid(),
            p_order_id,
            v_pay_method,
            v_pay_amount,
            v_pay_utr,
            v_completed_at
        );
    END LOOP;

    PERFORM pg_catalog.set_config('app.checkout_rpc', 'false', true);

    RETURN pg_catalog.jsonb_build_object(
        'order_id', p_order_id,
        'cashier_id', v_actor_id,
        'store_id', v_store_id,
        'terminal_id', v_terminal.id,
        'token_terminal', v_token_terminal,
        'token_seq', v_token_seq,
        'status', 'COMPLETED',
        'subtotal_paise', v_subtotal_paise,
        'discount_paise', v_discount_paise,
        'tax_paise', v_tax_paise,
        'cgst_paise', v_cgst_paise,
        'sgst_paise', v_sgst_paise,
        'total_paise', v_total_paise,
        'idempotent', false
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) TO authenticated;
