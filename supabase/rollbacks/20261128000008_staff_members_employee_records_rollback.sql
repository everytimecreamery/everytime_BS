-- =============================================================================
-- EVERYTIME CREAMERY — EMPLOYEE RECORDS MANAGEMENT ROLLBACK (MIGRATION 08)
-- Migration: 20261128000008_staff_members_employee_records_rollback.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
-- =============================================================================

DO $$
BEGIN
    IF pg_catalog.to_regclass('public.staff_members') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS trg_staff_members_normalize_and_timestamp ON public.staff_members;
        DROP POLICY IF EXISTS "staff_members_owner_select" ON public.staff_members;
        DROP POLICY IF EXISTS "staff_members_owner_insert" ON public.staff_members;
        DROP POLICY IF EXISTS "staff_members_owner_update" ON public.staff_members;
    END IF;
END $$;

DROP TABLE IF EXISTS public.staff_members;
DROP FUNCTION IF EXISTS public.normalize_staff_member_fields();
