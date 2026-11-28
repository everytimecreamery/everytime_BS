-- =============================================================================
-- EVERYTIME CREAMERY — PHASE 2 SECURE POS CHECKOUT ROLLBACK SCRIPT
-- Migration: 20261122000005_secure_pos_checkout_rollback.sql
-- =============================================================================

REVOKE EXECUTE ON FUNCTION public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
) FROM authenticated;

DROP FUNCTION IF EXISTS public.complete_pos_checkout(
    UUID, UUID, TEXT, INT, JSONB, NUMERIC, TEXT, TEXT, JSONB, TIMESTAMPTZ, DATE, UUID, BIGINT, BIGINT
);

DROP POLICY IF EXISTS "orders_insert_staff_and_owner" ON public.orders;
CREATE POLICY "orders_insert_staff_and_owner" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (
        (
            public.get_user_role() = 'owner'
            AND EXISTS (
                SELECT 1 FROM public.terminals t
                WHERE t.id = orders.terminal_id
                  AND t.store_id = orders.store_id
            )
        )
        OR
        (
            public.get_user_role() = 'staff'
            AND orders.store_id = public.get_user_store_id()
            AND orders.cashier_id = (SELECT auth.uid())
            AND EXISTS (
                SELECT 1 FROM public.terminals t
                WHERE t.id = orders.terminal_id
                  AND t.store_id = public.get_user_store_id()
            )
        )
    );

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
                  AND o.cashier_id = (SELECT auth.uid())
                  AND o.status NOT IN ('VOID', 'CANCELLED')
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
            )
        )
    );

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
                  AND o.cashier_id = (SELECT auth.uid())
                  AND o.status NOT IN ('VOID', 'CANCELLED')
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
                  AND public.get_order_paid_paise(payments.order_id) < o.total_paise
            )
        )
    );

DROP POLICY IF EXISTS "menu_addons_read_all" ON public.menu_addons;
DROP POLICY IF EXISTS "menu_addons_owner_all" ON public.menu_addons;
DROP TABLE IF EXISTS public.menu_addons;
