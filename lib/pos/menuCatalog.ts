/**
 * Everytime Creamery — Staff POS Dynamic Menu Catalog Service
 * Read-through Supabase Catalog + Offline Cache (localStorage/IndexedDB) + Realtime Sync.
 *
 * Rules:
 * 1. Unavailable (is_available = false) and archived (is_archived = true) items are EXCLUDED from the staff grid.
 * 2. 'frequent' is a virtual category driven by is_frequent = true on menu items.
 * 3. Counter gelato portion is locked to 85g single base price.
 * 4. Offline sells from the last cached catalog.
 * 5. Historical orders are never altered by catalog changes.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  CategoryId,
  MenuItem,
  MenuCategory,
  MenuItemVariant,
  MenuItemAddOn,
  MenuInteractionType,
  MENU_CATEGORIES,
  ALL_MENU_ITEMS,
  WAFFLE_SCOOP_OPTIONS,
} from '@/lib/mock/menu';
import { deriveInteractionType } from '@/lib/supabase/menu';

export const CACHED_MENU_CATALOG_KEY = 'cached_menu_catalog_v1';

export interface StaffCatalogData {
  categories: MenuCategory[];
  items: MenuItem[];
  updatedAt: number;
}

/**
 * Transforms a Supabase menu_items record (with joined menu_variants) into domain MenuItem.
 */
export function transformDbItemToMenuItem(dbItem: any): MenuItem {
  const rawVariants = Array.isArray(dbItem.menu_variants) ? dbItem.menu_variants : [];
  const activeVariants: MenuItemVariant[] = rawVariants
    .filter((v: any) => !v.is_archived)
    .map((v: any) => ({
      id: v.id,
      label: v.label,
      pricePaise: v.price_paise,
    }));

  const interactionType: MenuInteractionType =
    dbItem.interaction_type ||
    (deriveInteractionType(dbItem.category_id, activeVariants.length) as MenuInteractionType);

  return {
    id: dbItem.id,
    name: dbItem.name,
    categoryId: dbItem.category_id as CategoryId,
    basePricePaise: dbItem.base_price_paise,
    interactionType,
    isPremium: Boolean(dbItem.is_premium),
    isFrequent: Boolean(dbItem.is_frequent),
    isAvailable: dbItem.is_available ?? true,
    isArchived: Boolean(dbItem.is_archived),
    portionGrams: dbItem.portion_grams || (dbItem.category_id === 'gelato' ? 85 : undefined),
    variants: activeVariants.length > 0 ? activeVariants : undefined,
    addOns: dbItem.category_id === 'waffle' ? WAFFLE_SCOOP_OPTIONS : undefined,
    description: dbItem.description || undefined,
  };
}

/**
 * Loads cached catalog from local storage.
 */
export function loadCachedCatalog(): StaffCatalogData | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHED_MENU_CATALOG_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items) && Array.isArray(parsed.categories)) {
      return parsed as StaffCatalogData;
    }
  } catch (err) {
    console.warn('[loadCachedCatalog] Parse error:', err);
  }
  return null;
}

/**
 * Saves catalog to local storage cache.
 */
export function saveCachedCatalog(categories: MenuCategory[], items: MenuItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    const data: StaffCatalogData = {
      categories,
      items,
      updatedAt: Date.now(),
    };
    localStorage.setItem(CACHED_MENU_CATALOG_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('[saveCachedCatalog] Storage error:', err);
  }
}

/**
 * Fetches the active menu catalog from Supabase.
 */
export async function fetchCatalogFromSupabase(): Promise<{
  categories: MenuCategory[];
  items: MenuItem[];
} | null> {
  try {
    // 1. Fetch categories
    const { data: dbCategories, error: catErr } = await supabase
      .from('categories')
      .select('*')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true });

    if (catErr) throw catErr;

    // 2. Fetch items with variants
    const { data: dbItems, error: itemsErr } = await supabase
      .from('menu_items')
      .select('*, menu_variants(*)')
      .eq('is_archived', false)
      .order('name', { ascending: true });

    if (itemsErr) throw itemsErr;

    const categories: MenuCategory[] = (dbCategories || []).map((c: any) => ({
      id: c.id as CategoryId,
      label: c.label,
      iconName: c.icon_name || 'IceCream',
      description: '',
    }));

    const items: MenuItem[] = (dbItems || []).map(transformDbItemToMenuItem);

    // Save to local cache
    saveCachedCatalog(categories, items);

    return { categories, items };
  } catch (err) {
    console.warn('[fetchCatalogFromSupabase] Network/DB error:', err);
    return null;
  }
}

/**
 * Filters catalog items for a specific category tab in the Staff POS:
 * - Excludes unavailable (isAvailable === false) items (Rule 6).
 * - Excludes archived items.
 * - Handles virtual 'frequent' category (Rule 5).
 * - Handles 'tubs' (takeaway tubs) category.
 */
export function filterStaffCategoryItems(
  allItems: MenuItem[],
  categoryId: CategoryId | string
): MenuItem[] {
  // Only include items that are NOT archived and currently marked available in daily stock
  const activeAndAvailable = allItems.filter(
    (item) => !item.isArchived && item.isAvailable !== false
  );

  // Virtual Category: 'frequent' (flag-driven)
  if (categoryId === 'frequent') {
    return activeAndAvailable.filter((item) => item.isFrequent);
  }

  // Takeaway Tubs category
  if (categoryId === 'tubs') {
    const tubItems = activeAndAvailable.filter((item) => item.categoryId === 'tubs');
    if (tubItems.length > 0) return tubItems;
    // Fallback if tubs are mapped to gelato items with tub variants
    return activeAndAvailable.filter(
      (item) => item.categoryId === 'gelato' && item.variants && item.variants.length > 0
    );
  }

  return activeAndAvailable.filter((item) => item.categoryId === categoryId);
}

/**
 * React Hook for Staff POS Terminal:
 * - Boots instantly from local cache or seed fallback.
 * - Fetches fresh Supabase records asynchronously.
 * - Subscribes to Supabase Realtime for instant owner catalog changes.
 * - Sells smoothly offline when disconnected.
 */
export function useStaffMenuCatalog() {
  const [categories, setCategories] = useState<MenuCategory[]>(() => {
    const cached = loadCachedCatalog();
    return cached?.categories ? cached.categories : MENU_CATEGORIES;
  });

  const [items, setItems] = useState<MenuItem[]>(() => {
    const cached = loadCachedCatalog();
    return cached?.items ? cached.items : ALL_MENU_ITEMS;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Sync catalog from Supabase
  const syncFromSupabase = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchCatalogFromSupabase();
    if (result) {
      if (result.categories) {
        setCategories(result.categories);
      }
      if (result.items) {
        setItems(result.items);
      }
    }
    setIsLoading(false);
  }, []);

  // Online / offline listeners & Initial load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsOnline(navigator.onLine);

    const handleOnline = () => {
      setIsOnline(true);
      syncFromSupabase();
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial background sync
    syncFromSupabase();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncFromSupabase]);

  // Realtime Supabase Subscription for immediate owner edits
  useEffect(() => {
    const channel = supabase
      .channel('staff-menu-catalog-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => {
          syncFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          syncFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_variants' },
        () => {
          syncFromSupabase();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [syncFromSupabase]);

  // Category filter helper
  const getItemsByCategory = useCallback(
    (categoryId: CategoryId | string): MenuItem[] => {
      return filterStaffCategoryItems(items, categoryId);
    },
    [items]
  );

  return {
    categories,
    items,
    getItemsByCategory,
    isLoading,
    isOnline,
    refreshCatalog: syncFromSupabase,
  };
}
