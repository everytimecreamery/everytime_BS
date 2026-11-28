-- =============================================================================
-- EVERYTIME CREAMERY — PHASE 2 FINANCIAL AUDIT SECURITY ROLLBACK SCRIPT (SAFE)
-- Migration: 20261122000004_financial_audit_security_rollback.sql
--
-- ROLLBACK LIMITATIONS & INTENTIONALLY PRESERVED SECURITY INVARIANTS:
--   1. Does NOT restore permissive physical DELETE policies ("payments_owner_delete"
--      or "orders_owner_delete") and does NOT re-grant UPDATE/DELETE on public.payments
--      to application roles (anon, authenticated). Dangerous financial record
--      deletion behavior is permanently prevented.
--   2. Does NOT restore ON DELETE CASCADE on payments.order_id or order_items.order_id;
--      ON DELETE RESTRICT is preserved so order deletion cannot erase payment history.
--   3. Does NOT drop public.payment_corrections or delete recorded audit events;
--      existing correction history remains intact, read-only, and append-only.
--   4. Does NOT activate or modify public.refunds, and does NOT restore insecure
--      public catalog-write policies ("*_write_all") or weaken RBAC protections.
--   5. Removes the controlled correct_payment_method() RPC and staff PROCESSING
--      draft-update policy; cancellation audit columns on orders are retained if
--      populated with non-null values to avoid data loss.
-- =============================================================================

-- 1. Remove controlled payment-method correction RPC (leaves audit ledger intact)
REVOKE EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) FROM authenticated;
DROP FUNCTION IF EXISTS public.correct_payment_method(UUID, TEXT, TEXT);

-- 2. Remove staff pre-completion PROCESSING update policy added by migration 04
DROP POLICY IF EXISTS "orders_staff_update_processing" ON public.orders;

-- 3. Retain cancellation audit columns on orders if populated; if unused and dropped,
--    replace trg_protect_orders_financial_integrity() so no dangling column references remain.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'cancelled_reason'
    ) THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.orders
            WHERE cancelled_reason IS NOT NULL OR cancelled_by IS NOT NULL OR cancelled_at IS NOT NULL
        ) THEN
            CREATE OR REPLACE FUNCTION public.trg_protect_orders_financial_integrity()
            RETURNS trigger
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = ''
            AS $fn$
            DECLARE
                current_paid BIGINT;
            BEGIN
                IF TG_OP = 'INSERT' THEN
                    RETURN NEW;
                END IF;
                IF OLD.status = 'COMPLETED' THEN
                    IF OLD.status IS DISTINCT FROM NEW.status
                       OR OLD.subtotal_paise IS DISTINCT FROM NEW.subtotal_paise
                       OR OLD.discount_paise IS DISTINCT FROM NEW.discount_paise
                       OR OLD.tax_paise IS DISTINCT FROM NEW.tax_paise
                       OR OLD.cgst_paise IS DISTINCT FROM NEW.cgst_paise
                       OR OLD.sgst_paise IS DISTINCT FROM NEW.sgst_paise
                       OR OLD.total_paise IS DISTINCT FROM NEW.total_paise THEN
                        RAISE EXCEPTION 'Financial audit violation: Finalized order totals and status are immutable after completion.';
                    END IF;
                    RETURN NEW;
                END IF;
                IF OLD.status IN ('CANCELLED', 'VOID') THEN
                    RAISE EXCEPTION 'Financial audit violation: Cancelled or voided orders are immutable.';
                END IF;
                SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid FROM public.payments WHERE order_id = OLD.id;
                IF NEW.status IN ('CANCELLED', 'VOID') AND current_paid > 0 THEN
                    RAISE EXCEPTION 'Financial audit violation: Only unpaid orders can be cancelled or voided.';
                END IF;
                IF NEW.total_paise < current_paid THEN
                    RAISE EXCEPTION 'Financial audit violation: Order total cannot be less than recorded payments.';
                END IF;
                RETURN NEW;
            END;
            $fn$;

            ALTER TABLE public.orders
                DROP COLUMN IF EXISTS cancelled_reason,
                DROP COLUMN IF EXISTS cancelled_by,
                DROP COLUMN IF EXISTS cancelled_at;
        ELSE
            RAISE NOTICE 'Rollback notice: Retained orders.cancelled_* columns because existing cancellation audit records reference them.';
        END IF;
    END IF;
END $$;

-- 4. Explicitly re-assert critical non-destructive invariants (defense-in-depth)
DROP POLICY IF EXISTS "payments_owner_delete" ON public.payments;
DROP POLICY IF EXISTS "payments_owner_update" ON public.payments;
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
REVOKE UPDATE, DELETE, TRUNCATE ON public.payments FROM PUBLIC, anon, authenticated;

-- Ensure ON DELETE RESTRICT remains active on payments_order_id_fkey
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

-- Ensure payment_corrections remains read-only for authenticated owners
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.payment_corrections FROM PUBLIC, anon, authenticated;
