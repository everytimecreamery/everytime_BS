-- =============================================================================
-- EVERYTIME CREAMERY — OPERATIONAL COMPLETION ROLLBACK (MIGRATION 07)
-- Migration: 20261122000007_staff_onboarding_and_discount_bounds_rollback.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Note: Preserves invite-gated handle_new_user(), pin_hash protection,
-- and active-profile security checks.
-- =============================================================================

DROP TRIGGER IF EXISTS on_auth_user_confirmed ON auth.users;
DROP FUNCTION IF EXISTS public.handle_user_confirmation();

-- Restore handle_new_user() from Migration 06 (invite-gated)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM public.provision_staff_from_invitation(new.id, new.email);
    RETURN new;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Restore superseded index cleanly while retaining columns safely
DROP INDEX IF EXISTS public.idx_staff_invitations_active_email;
CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_invitations_active_email
    ON public.staff_invitations (lower(pg_catalog.btrim(email)))
    WHERE accepted_at IS NULL AND revoked_at IS NULL;
