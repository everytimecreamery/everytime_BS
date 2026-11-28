/**
 * Everytime Creamery — Master Menu Management Service
 * Full CRUD for Menu Items, Categories, and Variants in Owner Portal.
 *
 * Security Architecture:
 * - Browser reads use the SSR cookie-backed Supabase client under RLS.
 * - All menu mutations delegate to authenticated Server Actions (`@/app/actions/menu`)
 *   enforcing `requireOwner()` server-side while PostgreSQL RLS acts as an
 *   independent security boundary.
 */

import { supabase } from '@/lib/supabase/client';
import {
  saveMenuItemAction,
  toggleMenuItemAvailabilityAction,
  setMenuItemArchivedAction,
  saveCategoryAction,
  setCategoryArchivedAction,
} from '@/app/actions/menu';
import {
  type MenuVariantPayload,
  type MenuItemPayload,
  type CategoryPayload,
  APPROVED_LUCIDE_ICONS,
  type ApprovedLucideIcon,
  deriveInteractionType,
  slugify,
  validateMenuItemPayload,
} from '@/lib/supabase/menu-shared';

export type { MenuVariantPayload, MenuItemPayload, CategoryPayload, ApprovedLucideIcon };
export { APPROVED_LUCIDE_ICONS, deriveInteractionType, slugify, validateMenuItemPayload };

/**
 * Fetches all menu data including categories, items, and variants for the Owner Portal.
 */
export async function fetchAllOwnerMenuData(): Promise<{
  categories: any[];
  items: any[];
}> {
  try {
    const { data: catData, error: catError } = await supabase
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (catError) throw catError;

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
 * Creates or updates a menu item and its variants via authenticated Server Action.
 */
export async function saveMenuItem(
  payload: MenuItemPayload
): Promise<{ success: boolean; error?: string }> {
  const validationError = validateMenuItemPayload(payload);
  if (validationError) {
    return { success: false, error: validationError };
  }
  return saveMenuItemAction(payload);
}

/**
 * Toggles daily availability (is_available) via authenticated Server Action.
 */
export async function toggleMenuItemAvailability(
  id: string,
  currentAvailability: boolean
): Promise<{ success: boolean; error?: string }> {
  return toggleMenuItemAvailabilityAction(id, currentAvailability);
}

/**
 * Soft archives or restores a menu item via authenticated Server Action.
 */
export async function setMenuItemArchived(
  id: string,
  isArchived: boolean
): Promise<{ success: boolean; error?: string }> {
  return setMenuItemArchivedAction(id, isArchived);
}

/**
 * Hard deletion is prohibited to preserve historical order integrity.
 * Retained as a safe deprecation stub so callers receive an explicit audit message.
 */
export async function deleteMenuItemPermanently(
  _id: string
): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error:
      'Permanent deletion is prohibited to preserve past sales history. Please archive the item instead.',
  };
}

/**
 * Saves (creates or edits) a category via authenticated Server Action.
 */
export async function saveCategory(
  payload: CategoryPayload
): Promise<{ success: boolean; error?: string }> {
  const trimmedLabel = payload.label?.trim();
  if (!trimmedLabel) {
    return { success: false, error: 'Category label is required.' };
  }
  return saveCategoryAction(payload);
}

/**
 * Soft archives or restores a category via authenticated Server Action.
 */
export async function setCategoryArchived(
  categoryId: string,
  isArchived: boolean
): Promise<{ success: boolean; error?: string }> {
  if (categoryId === 'frequent') {
    return {
      success: false,
      error: "'Frequent' is a virtual category driven by product flags and cannot be archived.",
    };
  }
  if (categoryId === 'extra') {
    return {
      success: false,
      error: "'Extra' is a protected system category and cannot be archived.",
    };
  }
  return setCategoryArchivedAction(categoryId, isArchived);
}
