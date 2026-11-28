-- =============================================================================
-- EVERYTIME CREAMERY — PHASE 2 SECURE POS CHECKOUT RPC & CASHIER ATTRIBUTION
-- Migration: 20261122000005_secure_pos_checkout.sql
--
-- Security Hardening:
--   1. Authoritative public.menu_addons table for server-side add-on pricing.
--   2. Atomic complete_pos_checkout() SECURITY DEFINER RPC:
--      - Derives cashier_id strictly from auth.uid() (rejects impersonation & anon).
--      - Resolves store_id from cashier profile and validates terminal ownership.
--      - Looks up menu_items, menu_variants, and menu_addons prices from Postgres.
--      - Rejects archived or unavailable items, invalid quantities, and tampered
--        client prices or totals.
--      - Computes subtotal, discount, 5% GST (CGST + SGST), and total server-side.
--      - Validates single and split payment tenders sum exactly to server total.
--      - Inserts orders, order_items, and payments atomically in one transaction.
--   3. Blocks direct client-side INSERT/UPDATE price tampering on orders,
--      order_items, and payments by staff; enforces non-null cashier_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. AUTHORITATIVE MENU ADD-ONS TABLE (SERVER-SIDE PRICING SOURCE OF TRUTH)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.menu_addons (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    price_paise BIGINT NOT NULL CHECK (price_paise >= 0),
    category_id TEXT REFERENCES public.categories(id) ON DELETE RESTRICT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT pg_catalog.now()
);

ALTER TABLE public.menu_addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "menu_addons_read_all" ON public.menu_addons;
CREATE POLICY "menu_addons_read_all" ON public.menu_addons
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "menu_addons_owner_all" ON public.menu_addons;
CREATE POLICY "menu_addons_owner_all" ON public.menu_addons
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

INSERT INTO public.menu_addons (id, label, price_paise, category_id, is_available, is_archived) VALUES
    ('scoop-none', 'No Scoop', 0, 'waffle', true, false),
    ('scoop-vanilla', 'Vanilla Scoop', 6000, 'waffle', true, false),
    ('scoop-chocolate', 'Chocolate Scoop', 6000, 'waffle', true, false)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    price_paise = EXCLUDED.price_paise,
    category_id = EXCLUDED.category_id,
    is_available = EXCLUDED.is_available,
    is_archived = EXCLUDED.is_archived,
    updated_at = pg_catalog.now();

-- -----------------------------------------------------------------------------
-- 2. ENFORCE NON-NULL CASHIER ATTRIBUTION & BLOCK DIRECT STAFF PRICE TAMPERING
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_protect_orders_financial_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    jwt_role TEXT;
    user_id UUID;
    caller_role TEXT;
    current_paid BIGINT;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    IF TG_OP = 'INSERT' THEN
        -- Enforce non-null cashier attribution on all newly created orders
        IF NEW.cashier_id IS NULL THEN
            RAISE EXCEPTION 'Validation error: cashier_id is required and cannot be null.';
        END IF;

        IF jwt_role = 'authenticated' AND user_id IS NOT NULL THEN
            caller_role := public.get_user_role();
            IF caller_role = 'staff' AND NEW.cashier_id IS DISTINCT FROM user_id THEN
                RAISE EXCEPTION 'Unauthorized: Staff cannot create orders on behalf of another cashier.';
            END IF;
        END IF;

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

    IF NEW.cashier_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: cashier_id is required and cannot be null.';
    END IF;

    RETURN NEW;
END;
$$;

-- Tighten RLS policies so staff cannot bypass complete_pos_checkout() via direct PostgREST inserts/updates
DROP POLICY IF EXISTS "orders_insert_staff_and_owner" ON public.orders;
CREATE POLICY "orders_insert_staff_and_owner" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
        pg_catalog.current_setting('app.checkout_rpc', true) = 'true'
        OR (
            public.get_user_role() = 'owner'
            AND orders.cashier_id IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM public.terminals t
                WHERE t.id = orders.terminal_id
                  AND t.store_id = orders.store_id
            )
        )
    );

DROP POLICY IF EXISTS "orders_staff_update_processing" ON public.orders;

DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        pg_catalog.current_setting('app.checkout_rpc', true) = 'true'
        OR public.get_user_role() = 'owner'
    );

DROP POLICY IF EXISTS "payments_insert" ON public.payments;
CREATE POLICY "payments_insert" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        pg_catalog.current_setting('app.checkout_rpc', true) = 'true'
        OR public.get_user_role() = 'owner'
    );

-- -----------------------------------------------------------------------------
-- 3. ATOMIC SERVER-SIDE CHECKOUT RPC: complete_pos_checkout()
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
    -- 1. Strict Cashier Authentication & Anti-Impersonation
    v_jwt_role := (SELECT auth.role());
    v_actor_id := (SELECT auth.uid());

    IF v_actor_id IS NULL OR v_jwt_role IS DISTINCT FROM 'authenticated' THEN
        RAISE EXCEPTION 'Unauthorized: POS checkout requires a valid authenticated cashier session.';
    END IF;

    IF p_cashier_id IS NOT NULL AND p_cashier_id IS DISTINCT FROM v_actor_id THEN
        RAISE EXCEPTION 'Unauthorized: Cashier impersonation denied.';
    END IF;

    SELECT id, store_id, role, full_name
    INTO v_profile
    FROM public.profiles
    WHERE id = v_actor_id;

    IF NOT FOUND OR v_profile.role NOT IN ('staff', 'owner') THEN
        RAISE EXCEPTION 'Unauthorized: Valid staff or owner profile is required for POS checkout.';
    END IF;

    IF v_profile.store_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Cashier profile is not assigned to a store.';
    END IF;

    v_store_id := v_profile.store_id;

    -- 2. Validate Order ID, Timestamp, Discount & Basic Payload Shape
    IF p_order_id IS NULL THEN
        RAISE EXCEPTION 'Validation error: Order ID is required.';
    END IF;

    IF p_client_completed_at IS NOT NULL AND p_client_completed_at > (pg_catalog.now() + INTERVAL '15 minutes') THEN
        RAISE EXCEPTION 'Validation error: Client completion timestamp cannot be in the future.';
    END IF;

    v_discount_percent := COALESCE(p_discount_percent, 0);
    IF NOT (v_discount_percent >= 0 AND v_discount_percent <= 100) THEN
        RAISE EXCEPTION 'Validation error: Discount percentage must be between 0 and 100.';
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
    -- Checking existing order before live catalog availability allows lost-response retries
    -- to succeed idempotently even if an item was later marked sold out or repriced.
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

        -- Resolve item / variant pricing strictly from DB
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

        -- Resolve add-on pricing strictly from DB
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
) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) FROM service_role;
GRANT EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) TO authenticated;
