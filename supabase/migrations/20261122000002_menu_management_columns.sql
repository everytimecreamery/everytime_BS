-- =============================================================================
-- EVERYTIME CREAMERY — FULL MENU MANAGEMENT COLUMNS & POLICIES
-- Migration: 20261122000002_menu_management_columns.sql
-- =============================================================================

-- 1. Add archiving, frequent flag, and portion grams
ALTER TABLE public.categories 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.menu_items 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS is_frequent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS portion_grams INT NOT NULL DEFAULT 85;

ALTER TABLE public.menu_variants 
ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT false;

-- 2. Add realtime publications
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'categories'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.categories;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'menu_items'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_items;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'menu_variants'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.menu_variants;
    END IF;
END $$;

-- 3. RLS policies for owner write access
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'categories' AND policyname = 'categories_write_all') THEN
        CREATE POLICY "categories_write_all" ON public.categories FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_items' AND policyname = 'menu_items_write_all') THEN
        CREATE POLICY "menu_items_write_all" ON public.menu_items FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'menu_variants' AND policyname = 'menu_variants_write_all') THEN
        CREATE POLICY "menu_variants_write_all" ON public.menu_variants FOR ALL TO public USING (true) WITH CHECK (true);
    END IF;
END $$;
