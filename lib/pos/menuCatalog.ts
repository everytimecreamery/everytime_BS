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
import { POSCartItem, generatePOSCartLineId } from '@/lib/pos/cart';
import { calculateLineTotalPaise } from '@/lib/pos/calculations';
import { deriveInteractionType } from '@/lib/supabase/menu';

export const CACHED_MENU_CATALOG_KEY = 'cached_menu_catalog_v1';

export type CatalogSource = 'mock' | 'cache' | 'supabase';

export interface StaffCatalogData {
  categories: MenuCategory[];
  items: MenuItem[];
  updatedAt: number;
}

export interface ReconciledItemIssue {
  item: POSCartItem;
  reason: string;
}

export interface CatalogReconciliationResult {
  reconciledItems: POSCartItem[];
  unresolvedItems: ReconciledItemIssue[];
  changed: boolean;
}

/**
 * Verified 1:1 alias map ONLY for exact legacy mock IDs that correspond to
 * identical products in the seeded Supabase catalog. Unrelated flavors/items
 * are intentionally excluded so they are never silently substituted.
 */
const LEGACY_MOCK_TO_DB_ALIAS_MAP: Record<
  string,
  {
    dbItemId: string;
    requireVariants?: string[];
    variantMap?: Record<string, string>;
  }
> = {
  'sundae-hot-chocolate-fudge': {
    dbItemId: 'sundae-hot-choc-fudge',
  },
  'thickshake-cold-milo': {
    dbItemId: 'extra-cold-milo',
  },
  'gelato-classic-vanilla': {
    dbItemId: 'tub-classic-vanilla',
    requireVariants: ['250ml', '500ml'],
    variantMap: {
      '250ml': 'tub-classic-vanilla-250',
      '500ml': 'tub-classic-vanilla-500',
    },
  },
  'gelato-hazel-nutella': {
    dbItemId: 'tub-hazel-nutella',
    requireVariants: ['250ml', '500ml'],
    variantMap: {
      '250ml': 'tub-hazel-nutella-250',
      '500ml': 'tub-hazel-nutella-500',
    },
  },
  'gelato-oreo-cream': {
    dbItemId: 'tub-oreo-cream',
    requireVariants: ['250ml', '500ml'],
    variantMap: {
      '250ml': 'tub-oreo-cream-250',
      '500ml': 'tub-oreo-cream-500',
    },
  },
};

/**
 * Reconciles offline/draft cart items against an authoritative DB menu catalog:
 * - Resolves exact IDs or strictly verified 1:1 aliases.
 * - Never silently substitutes unrelated items.
 * - Never trusts offline prices: adopts authoritative DB item/variant/add-on prices.
 * - Revalidates item availability, archive status, variants, and add-ons.
 */
export function reconcileCartItemsWithCatalog(
  items: POSCartItem[],
  authoritativeItems: MenuItem[]
): CatalogReconciliationResult {
  const reconciledItems: POSCartItem[] = [];
  const unresolvedItems: ReconciledItemIssue[] = [];
  let changed = false;

  const byId = new Map<string, MenuItem>();
  for (const m of authoritativeItems) {
    byId.set(m.id, m);
  }

  for (const item of items) {
    let dbItem = byId.get(item.productId);
    let mappedVariantId = item.variantId;

    if (!dbItem) {
      const alias = LEGACY_MOCK_TO_DB_ALIAS_MAP[item.productId];
      if (
        alias &&
        (!alias.requireVariants || (item.variantId && alias.requireVariants.includes(item.variantId)))
      ) {
        const target = byId.get(alias.dbItemId);
        if (target) {
          dbItem = target;
          if (item.variantId && alias.variantMap?.[item.variantId]) {
            mappedVariantId = alias.variantMap[item.variantId];
          }
        }
      }
    }

    if (!dbItem) {
      unresolvedItems.push({
        item,
        reason: `Menu item "${item.productName}" (${item.productId}) does not exist in the live catalog.`,
      });
      continue;
    }

    if (dbItem.isArchived) {
      unresolvedItems.push({
        item,
        reason: `Menu item "${dbItem.name}" is archived and cannot be sold.`,
      });
      continue;
    }

    if (dbItem.isAvailable === false) {
      unresolvedItems.push({
        item,
        reason: `Menu item "${dbItem.name}" is currently unavailable.`,
      });
      continue;
    }

    let unitPricePaise = dbItem.basePricePaise;
    let resolvedVariantId: string | undefined;
    let resolvedVariantLabel: string | undefined;

    if (dbItem.categoryId === 'gelato') {
      if (mappedVariantId && mappedVariantId !== '85ml' && mappedVariantId !== 'cup-85ml') {
        unresolvedItems.push({
          item,
          reason: `Invalid variant "${mappedVariantId}" for single-scoop gelato "${dbItem.name}".`,
        });
        continue;
      }
      resolvedVariantId = mappedVariantId;
      resolvedVariantLabel = mappedVariantId ? '85ml' : undefined;
      unitPricePaise = dbItem.basePricePaise;
    } else if (dbItem.variants && dbItem.variants.length > 0) {
      const matchedVariant = dbItem.variants.find(
        (v) =>
          v.id === mappedVariantId ||
          v.label === mappedVariantId ||
          (item.variantLabel && v.label === item.variantLabel)
      );
      if (!matchedVariant) {
        unresolvedItems.push({
          item,
          reason: `Selected variant "${item.variantLabel || item.variantId || 'default'}" is no longer available for "${dbItem.name}".`,
        });
        continue;
      }
      resolvedVariantId = matchedVariant.id;
      resolvedVariantLabel = matchedVariant.label;
      unitPricePaise = matchedVariant.pricePaise;
    } else if (mappedVariantId) {
      unresolvedItems.push({
        item,
        reason: `Variant "${mappedVariantId}" is not valid for "${dbItem.name}".`,
      });
      continue;
    }

    let addonPricePaise = 0;
    let resolvedAddOnId = item.addOnId;
    let resolvedAddOnLabel = item.addOnLabel;

    if (item.addOnId && item.addOnId !== 'scoop-none') {
      const allowedAddOns =
        dbItem.addOns || (dbItem.categoryId === 'waffle' ? WAFFLE_SCOOP_OPTIONS : []);
      const matchedAddon = allowedAddOns.find(
        (a) => a.id === item.addOnId || (item.addOnLabel && a.label === item.addOnLabel)
      );
      if (!matchedAddon) {
        unresolvedItems.push({
          item,
          reason: `Add-on "${item.addOnLabel || item.addOnId}" is not valid for "${dbItem.name}".`,
        });
        continue;
      }
      resolvedAddOnId = matchedAddon.id;
      resolvedAddOnLabel = matchedAddon.pricePaise === 0 ? undefined : matchedAddon.label;
      addonPricePaise = matchedAddon.pricePaise;
    } else if (item.addOnId === 'scoop-none') {
      resolvedAddOnId = 'scoop-none';
      resolvedAddOnLabel = undefined;
    }

    const authoritativeUnitPaise = unitPricePaise + addonPricePaise;
    const authoritativeLineId = generatePOSCartLineId(
      dbItem.id,
      resolvedVariantId,
      resolvedAddOnId
    );

    if (
      authoritativeLineId !== item.lineId ||
      dbItem.id !== item.productId ||
      dbItem.name !== item.productName ||
      resolvedVariantId !== item.variantId ||
      authoritativeUnitPaise !== item.unitPricePaise
    ) {
      changed = true;
    }

    const existingIdx = reconciledItems.findIndex((r) => r.lineId === authoritativeLineId);
    if (existingIdx >= 0) {
      const existing = reconciledItems[existingIdx];
      const mergedQty = existing.quantity + item.quantity;
      reconciledItems[existingIdx] = {
        ...existing,
        quantity: mergedQty,
        lineTotalPaise: calculateLineTotalPaise(authoritativeUnitPaise, mergedQty),
      };
      changed = true;
    } else {
      reconciledItems.push({
        lineId: authoritativeLineId,
        productId: dbItem.id,
        productName: dbItem.name,
        variantId: resolvedVariantId,
        variantLabel: resolvedVariantLabel,
        addOnId: resolvedAddOnId,
        addOnLabel: resolvedAddOnLabel,
        unitPricePaise: authoritativeUnitPaise,
        quantity: item.quantity,
        lineTotalPaise: calculateLineTotalPaise(authoritativeUnitPaise, item.quantity),
      });
    }
  }

  return { reconciledItems, unresolvedItems, changed };
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

  const [catalogSource, setCatalogSource] = useState<CatalogSource>(() =>
    loadCachedCatalog()?.items ? 'cache' : 'mock'
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  // Sync catalog from Supabase
  const syncFromSupabase = useCallback(async () => {
    setIsLoading(true);
    const result = await fetchCatalogFromSupabase();
    if (result) {
      if (result.categories && result.categories.length > 0) {
        setCategories(result.categories);
      }
      if (result.items && result.items.length > 0) {
        setItems(result.items);
        setCatalogSource('supabase');
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
    catalogSource,
    getItemsByCategory,
    isLoading,
    isOnline,
    refreshCatalog: syncFromSupabase,
  };
}
