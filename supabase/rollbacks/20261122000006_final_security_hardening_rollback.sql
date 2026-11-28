-- =============================================================================
-- EVERYTIME CREAMERY — FINAL SECURITY HARDENING ROLLBACK (MIGRATION 06)
-- Migration: 20261122000006_final_security_hardening_rollback.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE ON LIVE DB)
--
-- Note: Preserves invite-gated handle_new_user() and pin_hash column protection
-- as non-regressable security invariants.
-- =============================================================================

DROP TRIGGER IF EXISTS trg_restrict_staff_terminal_update ON public.terminals;
DROP FUNCTION IF EXISTS public.check_terminal_update_fields();

-- Preserve pin_hash column privilege protection and owner-scoped profile access
REVOKE ALL ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, store_id, role, full_name, cashier_code, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT INSERT (id, store_id, role, full_name, cashier_code, created_at, updated_at)
    ON public.profiles TO authenticated;
GRANT UPDATE (store_id, role, full_name, cashier_code, updated_at)
    ON public.profiles TO authenticated;
GRANT DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
