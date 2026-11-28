-- =============================================================================
-- EVERYTIME CREAMERY — EMPLOYEE RECORDS MANAGEMENT (MIGRATION 08)
-- Migration: 20261128000008_staff_members_employee_records.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Scope:
--   - Creates standalone public.staff_members table for owner-managed employee
--     records without requiring Supabase Auth accounts or modifying profiles.
--   - Enforces store foreign key, unique case-insensitive cashier_code,
--     input validation constraints, and normalization trigger.
--   - Enforces strict owner-only RLS policies and table grants.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.staff_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL CHECK (
        pg_catalog.char_length(pg_catalog.btrim(full_name)) > 0
        AND pg_catalog.char_length(pg_catalog.btrim(full_name)) <= 120
    ),
    email TEXT CHECK (
        email IS NULL
        OR (
            pg_catalog.char_length(pg_catalog.btrim(email)) <= 254
            AND pg_catalog.btrim(email) ~* '^[^\s@]+@[^\s@]+\.[^\s@]+$'
        )
    ),
    phone TEXT CHECK (
        phone IS NULL
        OR (
            pg_catalog.char_length(pg_catalog.btrim(phone)) >= 7
            AND pg_catalog.char_length(pg_catalog.btrim(phone)) <= 30
        )
    ),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    cashier_code TEXT NOT NULL CHECK (
        pg_catalog.btrim(cashier_code) ~ '^[A-Za-z0-9_-]{1,20}$'
    ),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_members_unique_cashier_code
    ON public.staff_members (upper(pg_catalog.btrim(cashier_code)));

CREATE INDEX IF NOT EXISTS idx_staff_members_store_id
    ON public.staff_members (store_id);

CREATE INDEX IF NOT EXISTS idx_staff_members_is_active
    ON public.staff_members (is_active);

-- Normalize fields and maintain updated_at automatically
CREATE OR REPLACE FUNCTION public.normalize_staff_member_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.full_name := pg_catalog.btrim(COALESCE(NEW.full_name, ''));
    NEW.cashier_code := upper(pg_catalog.btrim(COALESCE(NEW.cashier_code, '')));
    NEW.email := nullif(lower(pg_catalog.btrim(COALESCE(NEW.email, ''))), '');
    NEW.phone := nullif(pg_catalog.btrim(COALESCE(NEW.phone, '')), '');

    IF TG_OP = 'UPDATE' THEN
        NEW.created_at := OLD.created_at;
        NEW.updated_at := pg_catalog.now();
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.normalize_staff_member_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_staff_members_normalize_and_timestamp ON public.staff_members;
CREATE TRIGGER trg_staff_members_normalize_and_timestamp
    BEFORE INSERT OR UPDATE ON public.staff_members
    FOR EACH ROW
    EXECUTE PROCEDURE public.normalize_staff_member_fields();

-- Strict Owner-Only Row Level Security & Grants
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.staff_members FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.staff_members TO authenticated;
GRANT ALL ON public.staff_members TO service_role;

DROP POLICY IF EXISTS "staff_members_owner_select" ON public.staff_members;
CREATE POLICY "staff_members_owner_select" ON public.staff_members
    FOR SELECT TO authenticated
    USING (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "staff_members_owner_insert" ON public.staff_members;
CREATE POLICY "staff_members_owner_insert" ON public.staff_members
    FOR INSERT TO authenticated
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "staff_members_owner_update" ON public.staff_members;
CREATE POLICY "staff_members_owner_update" ON public.staff_members
    FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');
