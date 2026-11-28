-- =============================================================================
-- EVERYTIME CREAMERY — RBAC SECURITY POLICIES ROLLBACK SCRIPT (SECURE)
-- Migration: 20261122000003_rbac_security_policies_rollback.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE UNTIL APPROVED)
-- Purpose: Safely rolls back operational policies from 20261122000003_rbac_security_policies.sql
--
-- =============================================================================
-- SECURITY INVARIANTS INTENTIONALLY PRESERVED BY THIS ROLLBACK:
-- 1. All new registrations default strictly to 'staff' via handle_new_user().
--    The vulnerable first-user-auto-owner race condition is NOT reintroduced.
-- 2. Core helper functions (get_user_role, get_user_store_id) retain explicit
--    'SET search_path = ''' to permanently guard against search path hijacking.
-- 3. Insecure public catalog-write policies ("*_write_all") from migration 02
--    are NEVER restored. Master menu tables remain strictly owner-only write.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ROLLBACK PAYMENTS FINANCIAL INTEGRITY & CONCURRENCY CONTROLS
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_enforce_payment_integrity ON public.payments;
DROP FUNCTION IF EXISTS public.check_payment_integrity();

DROP POLICY IF EXISTS "payments_owner_update" ON public.payments;
DROP POLICY IF EXISTS "payments_owner_delete" ON public.payments;
DROP POLICY IF EXISTS "payments_insert" ON public.payments;
DROP POLICY IF EXISTS "payments_select" ON public.payments;

-- Restore baseline 20261122000000 payments policies
CREATE POLICY "payments_insert" ON public.payments
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = payments.order_id
              AND (orders.cashier_id = auth.uid() OR public.get_user_role() = 'owner')
        )
    );

CREATE POLICY "payments_select" ON public.payments
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = payments.order_id
              AND (
                  public.get_user_role() = 'owner'
                  OR orders.cashier_id = auth.uid()
                  OR orders.store_id = public.get_user_store_id()
              )
        )
    );

DROP FUNCTION IF EXISTS public.get_order_paid_paise(UUID);

-- -----------------------------------------------------------------------------
-- 2. ROLLBACK ORDER_ITEMS POLICIES
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "order_items_owner_update" ON public.order_items;
DROP POLICY IF EXISTS "order_items_owner_delete" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select" ON public.order_items;

-- Restore baseline 20261122000000 order_items policies
CREATE POLICY "order_items_insert" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
              AND (orders.cashier_id = auth.uid() OR public.get_user_role() = 'owner')
        )
    );

CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.orders
            WHERE orders.id = order_items.order_id
              AND (
                  public.get_user_role() = 'owner'
                  OR orders.cashier_id = auth.uid()
                  OR orders.store_id = public.get_user_store_id()
              )
        )
    );

-- -----------------------------------------------------------------------------
-- 3. ROLLBACK ORDERS POLICIES & SCHEMA
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_staff_and_owner" ON public.orders;
DROP POLICY IF EXISTS "orders_select_staff_and_owner" ON public.orders;

-- Restore baseline 20261122000000 orders policies
CREATE POLICY "orders_insert_staff" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (cashier_id = auth.uid() OR public.get_user_role() = 'owner');

CREATE POLICY "orders_select_staff_and_owner" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR cashier_id = auth.uid()
        OR store_id = public.get_user_store_id()
    );

-- Revert cashier_id to NOT NULL only if no NULL rows exist in production
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.orders WHERE cashier_id IS NULL) THEN
        ALTER TABLE public.orders ALTER COLUMN cashier_id SET NOT NULL;
    ELSE
        RAISE NOTICE 'Rollback notice: public.orders.cashier_id retained as nullable because existing records contain NULL cashier_id values.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. ROLLBACK TERMINALS POLICIES
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "terminals_select_policy" ON public.terminals;
CREATE POLICY "terminals_select_policy" ON public.terminals
    FOR SELECT TO authenticated
    USING (store_id = public.get_user_store_id() OR public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "terminals_staff_update_sync" ON public.terminals;
CREATE POLICY "terminals_staff_update_sync" ON public.terminals
    FOR UPDATE TO authenticated
    USING (store_id = public.get_user_store_id())
    WITH CHECK (store_id = public.get_user_store_id());

-- -----------------------------------------------------------------------------
-- 5. PRESERVE SECURE CATALOG POLICIES (DO NOT RESTORE PUBLIC WRITE POLICIES)
-- -----------------------------------------------------------------------------

-- Drop permissive public write policies if any remain
DROP POLICY IF EXISTS "categories_write_all" ON public.categories;
DROP POLICY IF EXISTS "menu_items_write_all" ON public.menu_items;
DROP POLICY IF EXISTS "menu_variants_write_all" ON public.menu_variants;

-- Ensure owner-only mutation policies remain active
DROP POLICY IF EXISTS "categories_owner_all" ON public.categories;
CREATE POLICY "categories_owner_all" ON public.categories
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "menu_items_owner_all" ON public.menu_items;
CREATE POLICY "menu_items_owner_all" ON public.menu_items
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "menu_variants_owner_all" ON public.menu_variants;
CREATE POLICY "menu_variants_owner_all" ON public.menu_variants
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

-- Ensure authenticated read policies remain active
DROP POLICY IF EXISTS "categories_read_all" ON public.categories;
CREATE POLICY "categories_read_all" ON public.categories
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "menu_items_read_all" ON public.menu_items;
CREATE POLICY "menu_items_read_all" ON public.menu_items
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "menu_variants_read_all" ON public.menu_variants;
CREATE POLICY "menu_variants_read_all" ON public.menu_variants
    FOR SELECT TO authenticated USING (true);

-- -----------------------------------------------------------------------------
-- 6. ROLLBACK PROFILE GUARDS & PRESERVE SECURE DEFAULT-STAFF SIGNUP
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_service_role_all" ON public.profiles;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
DROP FUNCTION IF EXISTS public.check_profile_role_update();

DROP TRIGGER IF EXISTS trg_prevent_owner_insert ON public.profiles;
DROP FUNCTION IF EXISTS public.check_profile_insert();

DROP FUNCTION IF EXISTS public.bootstrap_initial_owner(TEXT);

-- SECURE PRESERVATION:
-- All regular user signups continue defaulting strictly to 'staff'.
-- First-user automatic owner assignment is intentionally NOT restored.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    default_store_id UUID;
BEGIN
    SELECT id INTO default_store_id FROM public.stores LIMIT 1;

    INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
    VALUES (
        new.id,
        default_store_id,
        'staff',
        COALESCE(new.raw_user_meta_data->>'full_name', pg_catalog.split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'cashier_code', 'C01')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. PRESERVE HARDENED HELPER FUNCTIONS WITH SAFE search_path
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT role FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role() TO service_role;

CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT store_id FROM public.profiles WHERE id = (SELECT auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_store_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_store_id() TO service_role;
