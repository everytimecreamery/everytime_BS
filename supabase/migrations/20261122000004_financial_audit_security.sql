-- =============================================================================
-- EVERYTIME CREAMERY — PHASE 2 FINANCIAL AUDIT SECURITY (NO REFUND WORKFLOW)
-- Migration: 20261122000004_financial_audit_security.sql
--
-- Protections enforced at PostgreSQL layer:
--   1. Payment record immutability (amount_paise, order_id, id, created_at, upi_utr).
--   2. Physical payment deletion prohibition across all application-facing roles.
--   3. Foreign keys changed from ON DELETE CASCADE to ON DELETE RESTRICT for
--      payments and order_items so order deletion can never cascade-erase history.
--   4. Controlled owner-only payment method correction via correct_payment_method()
--      with mandatory reason, strict authenticated owner attribution (no fallback),
--      and append-only payment_corrections ledger.
--   5. Completed, closed, and paid orders protected against deletion and arbitrary
--      post-completion total/status modification.
--   6. Pre-completion unpaid draft workflow preserved; unpaid cancellation requires
--      mandatory reason and server-derived actor attribution.
--   7. public.refunds remains untouched and inactive (no refund functionality).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PRE-FLIGHT DATA & DEPENDENCY INTEGRITY CHECKS
-- -----------------------------------------------------------------------------

DO $$
DECLARE
    orphaned_payments INT;
    orphaned_items INT;
    invalid_order_statuses INT;
BEGIN
    SELECT COUNT(*) INTO orphaned_payments
    FROM public.payments p
    LEFT JOIN public.orders o ON o.id = p.order_id
    WHERE o.id IS NULL;

    IF orphaned_payments > 0 THEN
        RAISE EXCEPTION 'Migration aborted: Found % orphaned payment row(s) without a parent order.', orphaned_payments;
    END IF;

    SELECT COUNT(*) INTO orphaned_items
    FROM public.order_items oi
    LEFT JOIN public.orders o ON o.id = oi.order_id
    WHERE o.id IS NULL;

    IF orphaned_items > 0 THEN
        RAISE EXCEPTION 'Migration aborted: Found % orphaned order_items row(s) without a parent order.', orphaned_items;
    END IF;

    SELECT COUNT(*) INTO invalid_order_statuses
    FROM public.orders
    WHERE status NOT IN ('PROCESSING', 'COMPLETED', 'CANCELLED', 'VOID');

    IF invalid_order_statuses > 0 THEN
        RAISE EXCEPTION 'Migration aborted: Found % order row(s) with unsupported status values.', invalid_order_statuses;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. PREVENT CASCADING DELETION OF PAYMENTS & ORDER ITEMS (ON DELETE RESTRICT)
-- -----------------------------------------------------------------------------

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_id_fkey;
ALTER TABLE public.payments ADD CONSTRAINT payments_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_order_id_fkey;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT;

-- -----------------------------------------------------------------------------
-- 3. ORDERS LIFECYCLE, CANCELLATION AUDIT COLUMNS & PRESERVATION TRIGGERS
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'CANCELLED', 'VOID'));

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cancelled_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- Remove permissive delete policy name from migration 03; replace with explicit
-- owner-only delete policy gated by trigger (blocks completed/closed/paid orders).
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
DROP POLICY IF EXISTS "orders_prevent_delete" ON public.orders;
CREATE POLICY "orders_prevent_delete" ON public.orders
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'owner');

-- Allow staff in their assigned store to edit unpaid PROCESSING draft orders
-- and complete them (cannot modify COMPLETED orders or VOID/CANCEL orders).
DROP POLICY IF EXISTS "orders_staff_update_processing" ON public.orders;
CREATE POLICY "orders_staff_update_processing" ON public.orders
    FOR UPDATE TO authenticated
    USING (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
        AND (cashier_id = (SELECT auth.uid()) OR cashier_id IS NULL)
        AND status = 'PROCESSING'
    )
    WITH CHECK (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
        AND (cashier_id = (SELECT auth.uid()) OR cashier_id IS NULL)
        AND status IN ('PROCESSING', 'COMPLETED')
    );

CREATE OR REPLACE FUNCTION public.trg_prevent_completed_order_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    has_payments BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM public.payments WHERE order_id = OLD.id
    ) INTO has_payments;

    IF OLD.status IN ('COMPLETED', 'CANCELLED', 'VOID') OR has_payments THEN
        RAISE EXCEPTION 'Financial audit violation: Cannot delete completed, closed, or paid orders (Order ID: %).', OLD.id;
    END IF;

    RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_prevent_completed_order_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_prevent_completed_order_delete() FROM anon;

DROP TRIGGER IF EXISTS trg_prevent_completed_order_delete ON public.orders;
CREATE TRIGGER trg_prevent_completed_order_delete
    BEFORE DELETE ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_prevent_completed_order_delete();

CREATE OR REPLACE FUNCTION public.trg_protect_orders_financial_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    user_id UUID;
    current_paid BIGINT;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('CANCELLED', 'VOID') THEN
            IF nullif(pg_catalog.btrim(COALESCE(NEW.cancelled_reason, '')), '') IS NULL THEN
                RAISE EXCEPTION 'Validation error: Cancellation or void reason is mandatory.';
            END IF;

            IF jwt_role IN ('authenticated', 'anon') THEN
                IF user_id IS NULL THEN
                    RAISE EXCEPTION 'Unauthorized: Order cancellation requires an authenticated actor.';
                END IF;
                NEW.cancelled_by := user_id;
            END IF;

            NEW.cancelled_at := pg_catalog.now();
        END IF;

        RETURN NEW;
    END IF;

    -- TG_OP = 'UPDATE'
    IF OLD.status = 'COMPLETED' THEN
        IF OLD.status IS DISTINCT FROM NEW.status THEN
            RAISE EXCEPTION 'Financial audit violation: Completed orders cannot change status to %.', NEW.status;
        END IF;

        IF OLD.id IS DISTINCT FROM NEW.id
           OR OLD.store_id IS DISTINCT FROM NEW.store_id
           OR OLD.terminal_id IS DISTINCT FROM NEW.terminal_id
           OR OLD.cashier_id IS DISTINCT FROM NEW.cashier_id
           OR OLD.shift_id IS DISTINCT FROM NEW.shift_id
           OR OLD.token_terminal IS DISTINCT FROM NEW.token_terminal
           OR OLD.token_seq IS DISTINCT FROM NEW.token_seq
           OR OLD.subtotal_paise IS DISTINCT FROM NEW.subtotal_paise
           OR OLD.discount_paise IS DISTINCT FROM NEW.discount_paise
           OR OLD.discount_type IS DISTINCT FROM NEW.discount_type
           OR OLD.discount_reason IS DISTINCT FROM NEW.discount_reason
           OR OLD.discount_approved_by IS DISTINCT FROM NEW.discount_approved_by
           OR OLD.tax_paise IS DISTINCT FROM NEW.tax_paise
           OR OLD.cgst_paise IS DISTINCT FROM NEW.cgst_paise
           OR OLD.sgst_paise IS DISTINCT FROM NEW.sgst_paise
           OR OLD.total_paise IS DISTINCT FROM NEW.total_paise
           OR OLD.client_completed_at IS DISTINCT FROM NEW.client_completed_at
           OR OLD.server_received_at IS DISTINCT FROM NEW.server_received_at
           OR OLD.business_date IS DISTINCT FROM NEW.business_date
           OR OLD.cancelled_reason IS DISTINCT FROM NEW.cancelled_reason
           OR OLD.cancelled_by IS DISTINCT FROM NEW.cancelled_by
           OR OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at THEN
            RAISE EXCEPTION 'Financial audit violation: Finalized order totals and core attributes are immutable after completion.';
        END IF;

        RETURN NEW;
    END IF;

    IF OLD.status IN ('CANCELLED', 'VOID') THEN
        RAISE EXCEPTION 'Financial audit violation: Cancelled or voided orders are immutable.';
    END IF;

    -- OLD.status = 'PROCESSING' (pre-completion draft order)
    SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid
    FROM public.payments
    WHERE order_id = OLD.id;

    IF NEW.status IN ('CANCELLED', 'VOID') THEN
        IF current_paid > 0 THEN
            RAISE EXCEPTION 'Financial audit violation: Only unpaid orders can be cancelled or voided.';
        END IF;

        IF nullif(pg_catalog.btrim(COALESCE(NEW.cancelled_reason, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Validation error: Cancellation or void reason is mandatory.';
        END IF;

        IF jwt_role IN ('authenticated', 'anon') THEN
            IF user_id IS NULL THEN
                RAISE EXCEPTION 'Unauthorized: Order cancellation requires an authenticated actor.';
            END IF;
            NEW.cancelled_by := user_id;
        END IF;

        NEW.cancelled_at := pg_catalog.now();
        RETURN NEW;
    END IF;

    IF NEW.total_paise < current_paid THEN
        RAISE EXCEPTION 'Financial audit violation: Order total (% paise) cannot be less than recorded payments (% paise).',
            NEW.total_paise, current_paid;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_protect_orders_financial_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_protect_orders_financial_integrity() FROM anon;

DROP TRIGGER IF EXISTS trg_protect_orders_financial_integrity ON public.orders;
CREATE TRIGGER trg_protect_orders_financial_integrity
    BEFORE INSERT OR UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_protect_orders_financial_integrity();

-- -----------------------------------------------------------------------------
-- 4. ORDER ITEMS IMMUTABILITY AFTER ORDER FINALIZATION / CANCELLATION
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role() = 'owner'
        OR (
            public.get_user_role() = 'staff'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = order_items.order_id
                  AND o.store_id = public.get_user_store_id()
                  AND (o.cashier_id = (SELECT auth.uid()) OR o.cashier_id IS NULL)
                  AND o.status NOT IN ('VOID', 'CANCELLED')
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
            )
        )
    );

CREATE OR REPLACE FUNCTION public.trg_protect_order_items_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_order_id UUID;
    target_status TEXT;
    has_payments BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_order_id := OLD.order_id;
    ELSE
        target_order_id := NEW.order_id;
    END IF;

    SELECT status INTO target_status
    FROM public.orders
    WHERE id = target_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order item rejected: Referenced order % does not exist.', target_order_id;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.payments WHERE order_id = target_order_id
    ) INTO has_payments;

    IF TG_OP = 'INSERT' THEN
        IF target_status IN ('CANCELLED', 'VOID') THEN
            RAISE EXCEPTION 'Financial audit violation: Cannot add line items to a cancelled or voided order.';
        END IF;
        IF has_payments THEN
            RAISE EXCEPTION 'Financial audit violation: Cannot add line items to an order that already has recorded payments.';
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP IN ('UPDATE', 'DELETE')
    IF target_status IN ('COMPLETED', 'CANCELLED', 'VOID') OR has_payments THEN
        RAISE EXCEPTION 'Financial audit violation: Line items of finalized or closed orders cannot be modified or deleted.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_protect_order_items_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_protect_order_items_integrity() FROM anon;

DROP TRIGGER IF EXISTS trg_protect_order_items_integrity ON public.order_items;
CREATE TRIGGER trg_protect_order_items_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_protect_order_items_integrity();

-- -----------------------------------------------------------------------------
-- 5. PAYMENTS IMMUTABILITY & DELETION PROHIBITION
-- -----------------------------------------------------------------------------

-- Remove permissive UPDATE and DELETE policies on payments
DROP POLICY IF EXISTS "payments_owner_update" ON public.payments;
DROP POLICY IF EXISTS "payments_owner_delete" ON public.payments;
DROP POLICY IF EXISTS "payments_prevent_delete" ON public.payments;

-- Revoke direct UPDATE, DELETE, and TRUNCATE privileges from application roles
REVOKE UPDATE, DELETE, TRUNCATE ON public.payments FROM PUBLIC, anon, authenticated;
REVOKE TRUNCATE ON public.orders, public.order_items, public.refunds FROM PUBLIC, anon, authenticated;

-- Tighten payments_insert RLS policy (no REFUNDED references)
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        public.get_user_role() = 'owner'
        OR (
            public.get_user_role() = 'staff'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = payments.order_id
                  AND o.store_id = public.get_user_store_id()
                  AND (o.cashier_id = (SELECT auth.uid()) OR o.cashier_id IS NULL)
                  AND o.status NOT IN ('VOID', 'CANCELLED')
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
                  AND public.get_order_paid_paise(payments.order_id) < o.total_paise
            )
        )
    );

-- Harden check_payment_integrity: strictly forbid DELETE and enforce payment
-- immutability and concurrency-safe balance validation.
CREATE OR REPLACE FUNCTION public.check_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    target_order RECORD;
    current_paid BIGINT;
    caller_role TEXT;
    caller_store_id UUID;
    jwt_role TEXT;
    user_id UUID;
    check_order_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Financial audit violation: Physical deletion of payment records is strictly prohibited.';
    END IF;

    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());
    check_order_id := NEW.order_id;

    -- Acquire exclusive row-level lock on parent order to serialize concurrent payments
    SELECT id, store_id, cashier_id, status, total_paise, server_received_at
    INTO target_order
    FROM public.orders
    WHERE id = check_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment rejected: Referenced order % does not exist.', check_order_id;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF OLD.amount_paise IS DISTINCT FROM NEW.amount_paise THEN
            RAISE EXCEPTION 'Financial audit violation: Payment amount is immutable and cannot be modified.';
        END IF;
        IF OLD.order_id IS DISTINCT FROM NEW.order_id THEN
            RAISE EXCEPTION 'Financial audit violation: Payment order association is immutable.';
        END IF;
        IF OLD.id IS DISTINCT FROM NEW.id THEN
            RAISE EXCEPTION 'Financial audit violation: Payment primary key is immutable.';
        END IF;
        IF OLD.created_at IS DISTINCT FROM NEW.created_at THEN
            RAISE EXCEPTION 'Financial audit violation: Payment creation timestamp is immutable.';
        END IF;
        IF OLD.upi_utr IS DISTINCT FROM NEW.upi_utr THEN
            RAISE EXCEPTION 'Financial audit violation: Payment UTR reference is immutable.';
        END IF;
        IF OLD.method IS DISTINCT FROM NEW.method THEN
            IF pg_catalog.current_setting('app.payment_correction_rpc', true) IS DISTINCT FROM 'true' THEN
                RAISE EXCEPTION 'Financial audit violation: Direct payment method updates are prohibited. Use correct_payment_method().';
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- TG_OP = 'INSERT'
    IF target_order.status IN ('VOID', 'CANCELLED') THEN
        RAISE EXCEPTION 'Payment rejected: Cannot record payment for an order with status %.', target_order.status;
    END IF;

    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT (jwt_role IS NULL AND user_id IS NULL) THEN
        caller_role := public.get_user_role();
        caller_store_id := public.get_user_store_id();

        IF caller_role = 'staff' THEN
            IF target_order.store_id IS DISTINCT FROM caller_store_id THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for another store''s order.';
            END IF;

            IF target_order.cashier_id IS NOT NULL AND target_order.cashier_id IS DISTINCT FROM user_id THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for another cashier''s order.';
            END IF;

            IF target_order.server_received_at < (pg_catalog.now() - INTERVAL '24 hours') THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for an order older than 24 hours.';
            END IF;
        ELSIF caller_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: Only staff or owner profiles can record payments.';
        END IF;
    END IF;

    SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid
    FROM public.payments
    WHERE order_id = NEW.order_id;

    IF NEW.amount_paise <= 0 THEN
        RAISE EXCEPTION 'Payment rejected: Payment amount must be greater than zero.';
    END IF;

    IF (current_paid + NEW.amount_paise) > target_order.total_paise THEN
        RAISE EXCEPTION 'Payment rejected: Payment of % paise exceeds remaining order balance (% paise remaining of % total).',
            NEW.amount_paise, (target_order.total_paise - current_paid), target_order.total_paise;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_payment_integrity() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_payment_integrity() FROM anon;

DROP TRIGGER IF EXISTS trg_enforce_payment_integrity ON public.payments;
CREATE TRIGGER trg_enforce_payment_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_payment_integrity();

-- -----------------------------------------------------------------------------
-- 6. APPEND-ONLY PAYMENT CORRECTIONS LEDGER & CONTROLLED OWNER RPC
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    previous_method TEXT NOT NULL CHECK (previous_method IN ('cash', 'upi', 'card')),
    new_method TEXT NOT NULL CHECK (new_method IN ('cash', 'upi', 'card')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    reason TEXT NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(reason)) > 0),
    corrected_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

CREATE INDEX IF NOT EXISTS idx_payment_corrections_payment_id ON public.payment_corrections(payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_corrections_order_id ON public.payment_corrections(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_corrections_corrected_by ON public.payment_corrections(corrected_by);
CREATE INDEX IF NOT EXISTS idx_payment_corrections_created_at ON public.payment_corrections(created_at);

ALTER TABLE public.payment_corrections ENABLE ROW LEVEL SECURITY;

-- Strictly prohibit direct client inserts, updates, deletes, or truncates
REVOKE ALL ON public.payment_corrections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.payment_corrections TO authenticated, service_role;

DROP POLICY IF EXISTS "payment_corrections_owner_select" ON public.payment_corrections;
CREATE POLICY "payment_corrections_owner_select" ON public.payment_corrections
    FOR SELECT TO authenticated
    USING (public.get_user_role() = 'owner');

-- Guard triggers ensure payment_corrections is strictly append-only and only written by RPC
CREATE OR REPLACE FUNCTION public.trg_guard_payment_correction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF pg_catalog.current_setting('app.payment_correction_rpc', true) IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'Financial audit violation: Direct insertion into payment_corrections is prohibited. Use correct_payment_method().';
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_guard_payment_correction_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_guard_payment_correction_insert() FROM anon;

DROP TRIGGER IF EXISTS trg_guard_payment_correction_insert ON public.payment_corrections;
CREATE TRIGGER trg_guard_payment_correction_insert
    BEFORE INSERT ON public.payment_corrections
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_guard_payment_correction_insert();

CREATE OR REPLACE FUNCTION public.trg_prevent_payment_correction_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    RAISE EXCEPTION 'Financial audit violation: Payment correction history is append-only and cannot be modified or deleted.';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_prevent_payment_correction_mutation() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_prevent_payment_correction_mutation() FROM anon;

DROP TRIGGER IF EXISTS trg_prevent_payment_correction_mutation ON public.payment_corrections;
CREATE TRIGGER trg_prevent_payment_correction_mutation
    BEFORE UPDATE OR DELETE ON public.payment_corrections
    FOR EACH ROW
    EXECUTE PROCEDURE public.trg_prevent_payment_correction_mutation();

-- Controlled Owner-Only RPC to correct a recorded payment's tender method
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

    -- Strict authenticated owner attribution: NEVER fall back to an arbitrary owner
    IF actor_id IS NULL OR jwt_role IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: Payment correction requires a valid authenticated owner session.';
    END IF;

    SELECT role INTO actor_role
    FROM public.profiles
    WHERE id = actor_id;

    IF actor_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: Only owners are authorized to correct payment methods.';
    END IF;

    -- Validate mandatory reason
    trimmed_reason := pg_catalog.btrim(COALESCE(p_reason, ''));
    IF pg_catalog.char_length(trimmed_reason) = 0 THEN
        RAISE EXCEPTION 'Validation error: A correction reason is mandatory.';
    END IF;

    -- Validate target method
    normalized_method := pg_catalog.lower(pg_catalog.btrim(COALESCE(p_new_method, '')));
    IF normalized_method NOT IN ('cash', 'upi', 'card') THEN
        RAISE EXCEPTION 'Validation error: Invalid payment method "%". Must be cash, upi, or card.', p_new_method;
    END IF;

    -- Resolve order_id and lock in deterministic order (orders -> payments) to prevent deadlocks
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

    -- Enable transaction-local RPC flag, update method, and append immutable audit event
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

REVOKE EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) FROM service_role;
GRANT EXECUTE ON FUNCTION public.correct_payment_method(UUID, TEXT, TEXT) TO authenticated;
