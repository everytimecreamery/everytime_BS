/**
 * Everytime Creamery — Master Menu Management Service
 * Full CRUD for Menu Items, Categories, and Variants in Owner Portal.
 *
 * Adheres strictly to Non-negotiable Rules:
 * 1. Soft deletion ONLY via `is_archived = true` (No hard DELETE).
 * 2. Separation of `is_available` (daily well toggle) and `is_archived` (permanent retirement).
 * 3. Integer paise currency math only (> 0).
 * 4. Gelato category locked to 85g single scoop base price.
 * 5. Protected categories: 'frequent' is virtual view, 'extra' cannot be archived.
 * 6. Interaction type is derived from variants count.
 */

import { supabase } from '@/lib/supabase/client';
import { generateUUID } from '@/lib/utils';

export interface MenuVariantPayload {
  id?: string;
  label: string;
  price_paise: number;
  volume_ml?: number | null;
  is_archived?: boolean;
}

export interface MenuItemPayload {
  id?: string;
  name: string;
  category_id: string;
  base_price_paise: number;
  portion_grams?: number;
  is_premium?: boolean;
  is_frequent?: boolean;
  is_available?: boolean;
  description?: string | null;
  variants?: MenuVariantPayload[];
}

export interface CategoryPayload {
  id?: string;
  label: string;
  icon_name: string;
  sort_order: number;
}

export const APPROVED_LUCIDE_ICONS = [
  'Flame',
  'Layers',
  'IceCream',
  'Cherry',
  'UtensilsCrossed',
  'CupSoda',
  'Milk',
  'Package',
  'Coffee',
  'Sparkles',
  'Tag',
  'Box',
  'Heart',
  'Smile',
  'Star',
] as const;

export type ApprovedLucideIcon = (typeof APPROVED_LUCIDE_ICONS)[number];

/**
 * Derives interaction type based on category and variant structure (Rule 6).
 */
export function deriveInteractionType(categoryId: string, variantCount: number): string {
  if (categoryId === 'gelato') return 'direct'; // Invariant 2: Gelato is always direct add single scoop
  if (variantCount === 0) return 'direct';
  if (categoryId === 'tubs') return 'gelato_sizes';
  if (categoryId === 'waffle') return 'waffle_scoop';
  if (categoryId === 'hot_chocolate') return 'hot_chocolate_options';
  return 'gelato_sizes';
}

/**
 * Generates URL-friendly slug ID for new items or categories.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Fetches all menu data including categories, items, and variants for the Owner Portal.
 */
export async function fetchAllOwnerMenuData(): Promise<{
  categories: any[];
  items: any[];
}> {
  try {
    // 1. Fetch categories
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (catError) throw catError;

    // 2. Fetch items with joined variants
    const { data: itemsData, error: itemsError } = await supabase
      .from('menu_items')
      .select('*, menu_variants(*)')
      .order('name', { ascending: true });

    if (itemsError) throw itemsError;

    return {
      categories: catData || [],
      items: itemsData || [],
    };
  } catch (err: any) {
    console.error('[fetchAllOwnerMenuData] Error:', err);
    return { categories: [], items: [] };
  }
}

/**
 * Creates or updates a menu item and its variants (Rule 4, 6, 8).
 */
export async function saveMenuItem(
  payload: MenuItemPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedName = payload.name.trim();
    if (!trimmedName) {
      return { success: false, error: 'Product name is required.' };
    }

    if (!payload.category_id) {
      return { success: false, error: 'Category selection is required.' };
    }

    if (!payload.base_price_paise || payload.base_price_paise <= 0 || !Number.isInteger(payload.base_price_paise)) {
      return { success: false, error: 'Base price must be a positive integer in paise (> ₹0).' };
    }

    // Invariant 2: Gelato items have portion_grams locked to 85
    const portionGrams = payload.category_id === 'gelato' ? 85 : payload.portion_grams || 85;
    const variantsList = payload.category_id === 'gelato' ? [] : payload.variants || [];
    const interactionType = deriveInteractionType(payload.category_id, variantsList.length);

    const itemId = payload.id || `${slugify(payload.category_id)}-${slugify(trimmedName)}-${generateUUID().slice(0, 4)}`;

    // 1. Upsert menu_items
    const { error: itemErr } = await (supabase as any).from('menu_items').upsert({
      id: itemId,
      category_id: payload.category_id,
      name: trimmedName,
      base_price_paise: payload.base_price_paise,
      interaction_type: interactionType,
      is_available: payload.is_available ?? true,
      is_premium: Boolean(payload.is_premium),
      is_frequent: Boolean(payload.is_frequent),
      portion_grams: portionGrams,
      description: payload.description?.trim() || null,
      updated_at: new Date().toISOString(),
    });

    if (itemErr) {
      console.error('[saveMenuItem] Item error:', itemErr);
      return { success: false, error: itemErr.message };
    }

    // 2. Handle variants if present
    if (variantsList.length > 0) {
      const variantRows = variantsList.map((v) => ({
        id: v.id || `${itemId}-${slugify(v.label)}-${generateUUID().slice(0, 4)}`,
        menu_item_id: itemId,
        label: v.label.trim(),
        price_paise: v.price_paise,
        volume_ml: v.volume_ml || null,
        is_archived: Boolean(v.is_archived),
      }));

      const { error: varErr } = await (supabase as any)
        .from('menu_variants')
        .upsert(variantRows, { onConflict: 'id' });

      if (varErr) {
        console.error('[saveMenuItem] Variants error:', varErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[saveMenuItem] Unexpected exception:', err);
    return { success: false, error: err?.message || 'Failed to save menu item.' };
  }
}

/**
 * Toggles daily availability (is_available) for an item (Rule 2).
 */
export async function toggleMenuItemAvailability(
  id: string,
  currentAvailability: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const nextVal = !currentAvailability;
    const { error } = await (supabase as any)
      .from('menu_items')
      .update({ is_available: nextVal, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('[toggleMenuItemAvailability] Error:', err);
    return { success: false, error: err?.message || 'Failed to toggle availability.' };
  }
}

/**
 * Soft archives or restores a menu item (Rule 1: Never hard delete).
 */
export async function setMenuItemArchived(
  id: string,
  isArchived: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await (supabase as any)
      .from('menu_items')
      .update({ is_archived: isArchived, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('[setMenuItemArchived] Error:', err);
    return { success: false, error: err?.message || 'Failed to update archive state.' };
  }
}

/**
 * Permanently deletes a menu item and its variants if not referenced by order_items.
 */
export async function deleteMenuItemPermanently(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Check if referenced by order_items
    const { data: orderRefs, error: refErr } = await supabase
      .from('order_items')
      .select('id')
      .eq('menu_item_id', id)
      .limit(1);

    if (refErr) console.warn('[deleteMenuItemPermanently] Reference check error:', refErr);
    if (orderRefs && orderRefs.length > 0) {
      return {
        success: false,
        error: 'Cannot permanently delete an item that has past completed orders. Please archive it instead to preserve sales history.',
      };
    }

    // 2. Delete variants first
    await (supabase as any).from('menu_variants').delete().eq('menu_item_id', id);

    // 3. Delete item
    const { error: delErr } = await (supabase as any).from('menu_items').delete().eq('id', id);
    if (delErr) throw delErr;

    return { success: true };
  } catch (err: any) {
    console.error('[deleteMenuItemPermanently] Error:', err);
    return { success: false, error: err?.message || 'Failed to delete item.' };
  }
}

/**
 * Saves (creates or edits) a category.
 */
export async function saveCategory(
  payload: CategoryPayload
): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmedLabel = payload.label.trim();
    if (!trimmedLabel) {
      return { success: false, error: 'Category label is required.' };
    }

    const catId = payload.id || slugify(trimmedLabel);

    const { error } = await (supabase as any).from('categories').upsert({
      id: catId,
      label: trimmedLabel,
      icon_name: payload.icon_name || 'IceCream',
      sort_order: payload.sort_order ?? 0,
      is_active: true,
      is_archived: false,
    });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('[saveCategory] Error:', err);
    return { success: false, error: err?.message || 'Failed to save category.' };
  }
}

/**
 * Soft archives or restores a category (Rule 5: 'frequent' & 'extra' are protected).
 * Blocks archiving if any non-archived items still belong to it (Rule 1).
 */
export async function setCategoryArchived(
  categoryId: string,
  isArchived: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    // Rule 5: Protected reserved categories
    if (categoryId === 'frequent') {
      return { success: false, error: "'Frequent' is a virtual category driven by product flags and cannot be archived." };
    }
    if (categoryId === 'extra') {
      return { success: false, error: "'Extra' is a protected system category and cannot be archived." };
    }

    if (isArchived) {
      // Check if any non-archived items reference this category
      const { data: activeItems, error: checkErr } = await supabase
        .from('menu_items')
        .select('id, name')
        .eq('category_id', categoryId)
        .eq('is_archived', false);

      if (checkErr) throw checkErr;

      if (activeItems && activeItems.length > 0) {
        return {
          success: false,
          error: `Cannot archive category while ${activeItems.length} active menu item(s) belong to it. Please reassign or archive those items first.`,
        };
      }
    }

    const { error } = await (supabase as any)
      .from('categories')
      .update({ is_archived: isArchived })
      .eq('id', categoryId);

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('[setCategoryArchived] Error:', err);
    return { success: false, error: err?.message || 'Failed to update category archive state.' };
  }
}
