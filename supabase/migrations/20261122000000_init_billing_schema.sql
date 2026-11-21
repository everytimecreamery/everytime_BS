-- =============================================================================
-- EVERYTIME CREAMERY — CORE RELATIONAL POS & MANAGEMENT SCHEMA
-- Migration: 20261122000000_init_billing_schema.sql
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. STORES & TERMINALS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT 'Everytime Creamery',
    address TEXT,
    phone TEXT,
    gstin TEXT,
    currency TEXT NOT NULL DEFAULT 'INR',
    business_day_cutoff_hour INT NOT NULL DEFAULT 4,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.terminals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    terminal_number TEXT NOT NULL DEFAULT '01',
    device_name TEXT DEFAULT 'Counter Terminal #01',
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_store_terminal UNIQUE (store_id, terminal_number)
);

-- -----------------------------------------------------------------------------
-- 2. USER PROFILES & SHIFTS
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    role TEXT NOT NULL DEFAULT 'staff' CHECK (role IN ('staff', 'owner')),
    full_name TEXT NOT NULL,
    cashier_code TEXT,
    pin_hash TEXT, -- salted hash for offline/touch POS pin lock
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES public.terminals(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    opening_float_paise BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. MENU CATALOG & MASTER DATA
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    icon_name TEXT NOT NULL,
    sort_order INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.menu_items (
    id TEXT PRIMARY KEY,
    category_id TEXT NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    base_price_paise BIGINT NOT NULL,
    interaction_type TEXT NOT NULL DEFAULT 'direct',
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    description TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public.menu_variants (
    id TEXT PRIMARY KEY,
    menu_item_id TEXT NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    price_paise BIGINT NOT NULL,
    volume_ml INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. ORDERS & TRANSACTIONS (IDEMPOTENT CLIENT-GENERATED UUIDs)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY, -- CLIENT-GENERATED via crypto.randomUUID()
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
    terminal_id UUID NOT NULL REFERENCES public.terminals(id) ON DELETE RESTRICT,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    token_terminal TEXT NOT NULL,  -- e.g. 'T1'
    token_seq INT NOT NULL,        -- e.g. 1
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status = 'COMPLETED'),
    subtotal_paise BIGINT NOT NULL,
    discount_paise BIGINT NOT NULL DEFAULT 0,
    discount_type TEXT,            -- 'PERCENTAGE' or 'FLAT'
    discount_reason TEXT,
    discount_approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    tax_paise BIGINT NOT NULL DEFAULT 0,
    cgst_paise BIGINT NOT NULL DEFAULT 0,
    sgst_paise BIGINT NOT NULL DEFAULT 0,
    total_paise BIGINT NOT NULL,
    client_completed_at TIMESTAMPTZ NOT NULL,
    server_received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    business_date DATE NOT NULL,
    CONSTRAINT unique_terminal_business_date_seq UNIQUE (terminal_id, business_date, token_seq)
);

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY, -- CLIENT-GENERATED
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id TEXT,
    product_name TEXT NOT NULL,
    variant_label TEXT,
    addon_label TEXT,
    quantity INT NOT NULL CHECK (quantity > 0),
    unit_price_paise BIGINT NOT NULL,
    addon_price_paise BIGINT NOT NULL DEFAULT 0,
    total_price_paise BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY, -- CLIENT-GENERATED
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    method TEXT NOT NULL CHECK (method IN ('cash', 'upi', 'card')),
    amount_paise BIGINT NOT NULL CHECK (amount_paise > 0),
    upi_utr TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    reason TEXT NOT NULL,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    refund_paise BIGINT NOT NULL CHECK (refund_paise > 0),
    method TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.z_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    shift_date DATE NOT NULL,
    gross_sales_paise BIGINT NOT NULL DEFAULT 0,
    cash_collected_paise BIGINT NOT NULL DEFAULT 0,
    upi_collected_paise BIGINT NOT NULL DEFAULT 0,
    card_collected_paise BIGINT NOT NULL DEFAULT 0,
    cash_discrepancy_paise BIGINT NOT NULL DEFAULT 0,
    total_orders INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. INDEXES FOR HIGH-THROUGHPUT LOOKUPS & REPORTING
-- -----------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_business_date ON public.orders(business_date);
CREATE INDEX IF NOT EXISTS idx_orders_terminal_date ON public.orders(terminal_id, business_date);
CREATE INDEX IF NOT EXISTS idx_orders_shift ON public.orders(shift_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_shifts_cashier ON public.shifts(cashier_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON public.menu_items(category_id);

-- -----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------

ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.z_reports ENABLE ROW LEVEL SECURITY;

-- Helper function: current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper function: current user store
CREATE OR REPLACE FUNCTION public.get_user_store_id()
RETURNS UUID AS $$
    SELECT store_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- STORES: Anyone authenticated can read their store; owners can update
CREATE POLICY "stores_select_policy" ON public.stores
    FOR SELECT TO authenticated
    USING (id = public.get_user_store_id() OR public.get_user_role() = 'owner');

CREATE POLICY "stores_owner_all" ON public.stores
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner');

-- TERMINALS: Authenticated can read terminals; owners can manage
CREATE POLICY "terminals_select_policy" ON public.terminals
    FOR SELECT TO authenticated
    USING (store_id = public.get_user_store_id() OR public.get_user_role() = 'owner');

CREATE POLICY "terminals_owner_all" ON public.terminals
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner');

CREATE POLICY "terminals_staff_update_sync" ON public.terminals
    FOR UPDATE TO authenticated
    USING (store_id = public.get_user_store_id())
    WITH CHECK (store_id = public.get_user_store_id());

-- PROFILES: Users read their own profile or all profiles in same store; owners full access
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR store_id = public.get_user_store_id() OR public.get_user_role() = 'owner');

CREATE POLICY "profiles_owner_all" ON public.profiles
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner');

-- CATEGORIES, MENU_ITEMS, MENU_VARIANTS: Read by all authenticated users; edited by owners only
CREATE POLICY "categories_read_all" ON public.categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "categories_owner_all" ON public.categories
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

CREATE POLICY "menu_items_read_all" ON public.menu_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "menu_items_owner_all" ON public.menu_items
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

CREATE POLICY "menu_variants_read_all" ON public.menu_variants
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "menu_variants_owner_all" ON public.menu_variants
    FOR ALL TO authenticated USING (public.get_user_role() = 'owner');

-- ORDERS:
-- Staff can INSERT orders with their own cashier_id.
-- Staff can SELECT orders within their own shift or current business date.
-- Staff CANNOT UPDATE OR DELETE COMPLETED orders!
-- Owners have full read/write access.
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

-- ORDER_ITEMS:
-- Can be inserted if associated order cashier is current user or owner
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

-- PAYMENTS:
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

-- Z_REPORTS:
-- Strictly Owner only
CREATE POLICY "z_reports_owner_only" ON public.z_reports
    FOR ALL TO authenticated
    USING (public.get_user_role() = 'owner');

-- -----------------------------------------------------------------------------
-- 7. AUTH TRIGGER: AUTO-CREATE PROFILES ON SIGNUP
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    default_store_id UUID;
    is_first_user BOOLEAN;
BEGIN
    SELECT id INTO default_store_id FROM public.stores LIMIT 1;
    SELECT NOT EXISTS (SELECT 1 FROM public.profiles) INTO is_first_user;

    INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
    VALUES (
        new.id,
        default_store_id,
        CASE WHEN is_first_user THEN 'owner' ELSE 'staff' END,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'cashier_code', 'C01')
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- -----------------------------------------------------------------------------
-- 8. REALTIME SUBSCRIPTION FOR OWNER DASHBOARD
-- -----------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime' AND tablename = 'orders'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 9. INITIAL SEED DATA (DEFAULT STORE, TERMINAL & 8 MENU CATEGORIES)
-- -----------------------------------------------------------------------------

INSERT INTO public.stores (id, name, address, phone, gstin, currency, business_day_cutoff_hour)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Everytime Creamery',
    'Flagship Scoop Shop, Terminal Road',
    '+91 98765 43210',
    '29AAAAA0000A1Z5',
    'INR',
    4
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    '01',
    'Counter Terminal #01'
) ON CONFLICT DO NOTHING;

INSERT INTO public.categories (id, label, icon_name, sort_order) VALUES
('frequent', 'Frequent', 'Flame', 1),
('extra', 'Extra', 'Layers', 2),
('gelato', 'Gelato', 'IceCream', 3),
('sundaes', 'Sundaes', 'Cherry', 4),
('waffle', 'Waffle', 'UtensilsCrossed', 5),
('thickshakes', 'Thickshakes', 'Milk', 6),
('tubs', 'Takeaway Tubs', 'Package', 7),
('hot_chocolate', 'Hot Chocolate', 'Coffee', 8)
ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    icon_name = EXCLUDED.icon_name,
    sort_order = EXCLUDED.sort_order;
