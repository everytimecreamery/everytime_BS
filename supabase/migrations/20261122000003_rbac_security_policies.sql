-- =============================================================================
-- EVERYTIME CREAMERY — RBAC SECURITY HARDENING & STORE AUTHORIZATION (CORRECTED)
-- Migration: 20261122000003_rbac_security_policies.sql
-- Status: REVIEW DRAFT — PENDING USER APPROVAL (DO NOT EXECUTE UNTIL APPROVED)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. HARDEN SECURITY DEFINER HELPER FUNCTIONS WITH SAFE search_path & STORE ISOLATION
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

-- Hardened get_order_paid_paise with strict tenant/store isolation
-- Eliminates arbitrary order spying across stores via direct RPC
CREATE OR REPLACE FUNCTION public.get_order_paid_paise(target_order_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    order_store_id UUID;
    caller_role TEXT;
    caller_store_id UUID;
    jwt_role TEXT;
    user_id UUID;
    total_paid BIGINT;
BEGIN
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    -- Trusted administrative contexts (service_role, direct internal postgres connection)
    IF jwt_role = 'service_role' OR (jwt_role IS NULL AND user_id IS NULL) THEN
        SELECT COALESCE(SUM(amount_paise), 0) INTO total_paid
        FROM public.payments WHERE order_id = target_order_id;
        RETURN total_paid;
    END IF;

    caller_role := public.get_user_role();
    caller_store_id := public.get_user_store_id();

    SELECT store_id INTO order_store_id
    FROM public.orders
    WHERE id = target_order_id;

    -- Store isolation: owners can query any order; staff can ONLY query orders from their assigned store
    IF caller_role = 'owner' THEN
        SELECT COALESCE(SUM(amount_paise), 0) INTO total_paid
        FROM public.payments WHERE order_id = target_order_id;
        RETURN total_paid;
    ELSIF caller_role = 'staff' THEN
        IF order_store_id IS NULL OR order_store_id IS DISTINCT FROM caller_store_id THEN
            RAISE EXCEPTION 'Access denied: cannot query payments for an order outside your assigned store.';
        END IF;

        SELECT COALESCE(SUM(amount_paise), 0) INTO total_paid
        FROM public.payments WHERE order_id = target_order_id;
        RETURN total_paid;
    ELSE
        RAISE EXCEPTION 'Access denied: unauthorized payment lookup.';
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_order_paid_paise(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_order_paid_paise(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_order_paid_paise(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_order_paid_paise(UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. HARDEN USER REGISTRATION & FIRST-OWNER BOOTSTRAP MECHANISM
-- -----------------------------------------------------------------------------

-- All regular user signups default strictly to 'staff'
-- Eliminates concurrent signup race conditions and rogue first-registration exploits
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

-- Explicit, concurrency-safe, administrative first-owner bootstrap function
-- Can only be executed by service_role (server-side admin / SQL editor)
CREATE OR REPLACE FUNCTION public.bootstrap_initial_owner(target_email TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    matched_user_id UUID;
    existing_owner_count INT;
BEGIN
    -- 1. Acquire transaction advisory lock to serialize concurrent calls
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('owner_bootstrap_lock'));

    -- 2. Check if an owner already exists
    SELECT COUNT(*) INTO existing_owner_count FROM public.profiles WHERE role = 'owner';
    IF existing_owner_count > 0 THEN
        RAISE EXCEPTION 'Bootstrap denied: System already has an active owner (% existing owner profile(s)). Subsequent promotions must be done by an existing owner.', existing_owner_count;
    END IF;

    -- 3. Match user by email in auth.users
    SELECT id INTO matched_user_id
    FROM auth.users
    WHERE lower(trim(email)) = lower(trim(target_email));

    IF matched_user_id IS NULL THEN
        RAISE EXCEPTION 'Bootstrap failed: User with email "%" does not exist in auth.users. The user must sign up first before elevation.', target_email;
    END IF;

    -- 4. Elevate the matched user profile to 'owner'
    UPDATE public.profiles
    SET role = 'owner', updated_at = pg_catalog.now()
    WHERE id = matched_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.profiles (id, role, full_name, cashier_code, store_id)
        VALUES (
            matched_user_id,
            'owner',
            pg_catalog.split_part(target_email, '@', 1),
            'OWNER',
            (SELECT id FROM public.stores LIMIT 1)
        );
    END IF;

    RETURN 'Success: User ' || target_email || ' (' || matched_user_id::text || ') is now the bootstrap owner.';
END;
$$;

-- Restrict bootstrap function strictly to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_owner(TEXT) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. PROFILE MUTATION & ROLE ESCALATION GUARDS (TRIGGERS & POLICIES)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_service_role_all" ON public.profiles;
CREATE POLICY "profiles_service_role_all" ON public.profiles
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

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

    -- 1. Trusted backend service_role bypasses trigger checks
    IF jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- 2. Direct internal postgres sessions (migrations, psql, GoTrue) where no JWT exists
    IF jwt_role IS NULL AND user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 3. Authenticated client session checks
    user_role := public.get_user_role();

    -- Staff cannot modify another user's profile
    IF user_role IS DISTINCT FROM 'owner' THEN
        IF OLD.id IS DISTINCT FROM user_id THEN
            RAISE EXCEPTION 'Unauthorized: staff can only modify their own profile.';
        END IF;
    END IF;

    -- Block any unauthorized role elevation or downgrade
    IF OLD.role IS DISTINCT FROM NEW.role THEN
        IF user_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can modify user roles.';
        END IF;
    END IF;

    -- Block staff from reassigning their own or others' store_id
    IF OLD.store_id IS DISTINCT FROM NEW.store_id THEN
        IF user_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can modify store assignments.';
        END IF;
    END IF;

    -- Block staff from modifying any field on an owner profile
    IF OLD.role = 'owner' AND user_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: only owners can modify owner profiles.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_role_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_profile_role_update();

CREATE OR REPLACE FUNCTION public.check_profile_insert()
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

    -- 1. Trusted backend service_role bypasses trigger checks
    IF jwt_role = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- 2. Direct internal postgres sessions (migrations, GoTrue handle_new_user) where no JWT exists
    IF jwt_role IS NULL AND user_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- 3. Authenticated client sessions
    user_role := public.get_user_role();

    -- Ordinary users cannot insert profiles for other users
    IF user_id IS DISTINCT FROM NEW.id AND user_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: cannot create a profile for another user.';
    END IF;

    -- Non-owners cannot insert an owner profile
    IF NEW.role = 'owner' AND user_role IS DISTINCT FROM 'owner' THEN
        RAISE EXCEPTION 'Unauthorized: cannot create an owner profile.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_owner_insert ON public.profiles;
CREATE TRIGGER trg_prevent_owner_insert
    BEFORE INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_profile_insert();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_profile_role_update() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_profile_insert() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. REMOVE INSECURE PUBLIC WRITE POLICIES ON MASTER MENU DATA
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "categories_write_all" ON public.categories;
DROP POLICY IF EXISTS "menu_items_write_all" ON public.menu_items;
DROP POLICY IF EXISTS "menu_variants_write_all" ON public.menu_variants;

DROP POLICY IF EXISTS "categories_owner_all" ON public.categories;
CREATE POLICY "categories_owner_all" ON public.categories
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "menu_items_owner_all" ON public.menu_items;
CREATE POLICY "menu_items_owner_all" ON public.menu_items
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "menu_variants_owner_all" ON public.menu_variants;
CREATE POLICY "menu_variants_owner_all" ON public.menu_variants
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "categories_read_all" ON public.categories;
CREATE POLICY "categories_read_all" ON public.categories
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "menu_items_read_all" ON public.menu_items;
CREATE POLICY "menu_items_read_all" ON public.menu_items
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "menu_variants_read_all" ON public.menu_variants;
CREATE POLICY "menu_variants_read_all" ON public.menu_variants
    FOR SELECT TO authenticated
    USING (true);

-- -----------------------------------------------------------------------------
-- 5. TERMINALS AUTHORIZATION POLICIES
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS "terminals_select_policy" ON public.terminals;
CREATE POLICY "terminals_select_policy" ON public.terminals
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR (
            public.get_user_role() = 'staff'
            AND store_id = public.get_user_store_id()
        )
    );

DROP POLICY IF EXISTS "terminals_staff_update_sync" ON public.terminals;
CREATE POLICY "terminals_staff_update_sync" ON public.terminals
    FOR UPDATE TO authenticated
    USING (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
    )
    WITH CHECK (
        public.get_user_role() = 'staff'
        AND store_id = public.get_user_store_id()
    );

DROP POLICY IF EXISTS "terminals_owner_all" ON public.terminals;
CREATE POLICY "terminals_owner_all" ON public.terminals
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

-- -----------------------------------------------------------------------------
-- 6. ORDERS PRIVILEGE ENFORCEMENT & STORE-LEVEL ISOLATION
-- -----------------------------------------------------------------------------

ALTER TABLE public.orders ALTER COLUMN cashier_id DROP NOT NULL;

DROP POLICY IF EXISTS "orders_insert_staff" ON public.orders;
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
            AND (orders.cashier_id = (SELECT auth.uid()) OR orders.cashier_id IS NULL)
            AND EXISTS (
                SELECT 1 FROM public.terminals t
                WHERE t.id = orders.terminal_id
                  AND t.store_id = public.get_user_store_id()
            )
        )
    );

DROP POLICY IF EXISTS "orders_select_staff_and_owner" ON public.orders;
CREATE POLICY "orders_select_staff_and_owner" ON public.orders
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR (
            public.get_user_role() = 'staff'
            AND store_id = public.get_user_store_id()
        )
    );

DROP POLICY IF EXISTS "orders_owner_update" ON public.orders;
CREATE POLICY "orders_owner_update" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "orders_owner_delete" ON public.orders;
CREATE POLICY "orders_owner_delete" ON public.orders
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'owner');

-- -----------------------------------------------------------------------------
-- 7. ORDER_ITEMS PRIVILEGE ENFORCEMENT & PARENT ORDER VERIFICATION
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
                  AND o.status NOT IN ('VOID', 'REFUNDED', 'CANCELLED')
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
            )
        )
    );

DROP POLICY IF EXISTS "order_items_select" ON public.order_items;
CREATE POLICY "order_items_select" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = order_items.order_id
              AND o.store_id = public.get_user_store_id()
        )
    );

DROP POLICY IF EXISTS "order_items_owner_update" ON public.order_items;
CREATE POLICY "order_items_owner_update" ON public.order_items
    FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "order_items_owner_delete" ON public.order_items;
CREATE POLICY "order_items_owner_delete" ON public.order_items
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'owner');

-- -----------------------------------------------------------------------------
-- 8. PAYMENTS FINANCIAL INTEGRITY & CONCURRENCY-SAFE ROW LOCKING
-- -----------------------------------------------------------------------------

-- Transaction-safe payment integrity trigger
-- Serializes concurrent operations on parent order via SELECT ... FOR UPDATE
-- Prevents re-parenting across orders, unauthorized updates/deletions, and overpayment
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
    jwt_role := (SELECT auth.role());
    user_id := (SELECT auth.uid());

    -- Determine order ID based on operation
    IF TG_OP = 'DELETE' THEN
        check_order_id := OLD.order_id;
    ELSE
        check_order_id := NEW.order_id;
    END IF;

    -- 1. CRITICAL: Acquire row-level lock on parent order to strictly serialize all payment mutations
    SELECT id, store_id, cashier_id, status, total_paise, server_received_at
    INTO target_order
    FROM public.orders
    WHERE id = check_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment rejected: Referenced order % does not exist.', check_order_id;
    END IF;

    -- 2. Authorization and mutation privilege enforcement
    IF jwt_role IS DISTINCT FROM 'service_role' AND NOT (jwt_role IS NULL AND user_id IS NULL) THEN
        caller_role := public.get_user_role();
        caller_store_id := public.get_user_store_id();

        -- Staff is strictly forbidden from modifying or deleting existing payments
        IF TG_OP IN ('UPDATE', 'DELETE') AND caller_role IS DISTINCT FROM 'owner' THEN
            RAISE EXCEPTION 'Unauthorized: only owners can modify or delete payment records.';
        END IF;

        -- Staff INSERT checks: store alignment, active status, time window
        IF TG_OP = 'INSERT' AND caller_role = 'staff' THEN
            IF target_order.store_id IS DISTINCT FROM caller_store_id THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for another store''s order.';
            END IF;

            IF target_order.cashier_id IS NOT NULL AND target_order.cashier_id IS DISTINCT FROM user_id THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for another cashier''s order.';
            END IF;

            IF target_order.status IN ('VOID', 'REFUNDED', 'CANCELLED') THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for an order with status %.', target_order.status;
            END IF;

            IF target_order.server_received_at < (pg_catalog.now() - INTERVAL '24 hours') THEN
                RAISE EXCEPTION 'Payment rejected: Cannot record payment for an order older than 24 hours.';
            END IF;
        END IF;
    END IF;

    -- 3. Immutability of order association: payments cannot be re-parented to a different order
    IF TG_OP = 'UPDATE' THEN
        IF OLD.order_id IS DISTINCT FROM NEW.order_id THEN
            RAISE EXCEPTION 'Payment rejected: Cannot reassign payment to a different order.';
        END IF;
    END IF;

    -- If DELETE, authorization and row locking succeeded; return OLD to allow deletion
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- 4. Calculate currently recorded paid total for this order
    IF TG_OP = 'UPDATE' THEN
        SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid
        FROM public.payments
        WHERE order_id = NEW.order_id AND id <> OLD.id;
    ELSE
        SELECT COALESCE(SUM(amount_paise), 0) INTO current_paid
        FROM public.payments
        WHERE order_id = NEW.order_id;
    END IF;

    -- 5. Mathematical financial integrity: payment amount must be positive and cannot cause total paid to exceed order total
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

DROP TRIGGER IF EXISTS trg_enforce_payment_integrity ON public.payments;
CREATE TRIGGER trg_enforce_payment_integrity
    BEFORE INSERT OR UPDATE OR DELETE ON public.payments
    FOR EACH ROW
    EXECUTE PROCEDURE public.check_payment_integrity();

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
                  -- 1. Parent order belongs to authenticated staff member's assigned store
                  AND o.store_id = public.get_user_store_id()
                  -- 2. Belongs to caller or terminal-scoped POS session
                  AND (o.cashier_id = (SELECT auth.uid()) OR o.cashier_id IS NULL)
                  -- 3. Parent order must be eligible (not voided, refunded, or cancelled)
                  AND o.status NOT IN ('VOID', 'REFUNDED', 'CANCELLED')
                  -- 4. Must be created within active window
                  AND o.server_received_at >= (pg_catalog.now() - INTERVAL '24 hours')
                  -- 5. Defense-in-depth: Existing payments must not already fully cover or exceed total
                  AND public.get_order_paid_paise(payments.order_id) < o.total_paise
            )
        )
    );

DROP POLICY IF EXISTS "payments_select" ON public.payments;
CREATE POLICY "payments_select" ON public.payments
    FOR SELECT TO authenticated
    USING (
        public.get_user_role() = 'owner'
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = payments.order_id
              AND o.store_id = public.get_user_store_id()
        )
    );

DROP POLICY IF EXISTS "payments_owner_update" ON public.payments;
CREATE POLICY "payments_owner_update" ON public.payments
    FOR UPDATE TO authenticated
    USING (public.get_user_role() = 'owner')
    WITH CHECK (public.get_user_role() = 'owner');

DROP POLICY IF EXISTS "payments_owner_delete" ON public.payments;
CREATE POLICY "payments_owner_delete" ON public.payments
    FOR DELETE TO authenticated
    USING (public.get_user_role() = 'owner');
