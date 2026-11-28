'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireOwner } from '@/lib/auth/rbac';
import { generateUUID } from '@/lib/utils';
import {
  MenuItemPayload,
  CategoryPayload,
  APPROVED_LUCIDE_ICONS,
  ApprovedLucideIcon,
  deriveInteractionType,
  slugify,
  validateMenuItemPayload,
} from '@/lib/supabase/menu-shared';

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export async function saveMenuItemAction(
  payload: MenuItemPayload
): Promise<ActionResponse> {
  try {
    // 1. Strict Server Role Authorization
    const { user } = await requireOwner();

    const validationError = validateMenuItemPayload(payload);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const trimmedName = payload.name.trim();
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const portionGrams = payload.category_id === 'gelato' ? 85 : payload.portion_grams || 85;
    const rawVariants = payload.category_id === 'gelato' ? [] : payload.variants || [];
    const activeVariants = rawVariants.filter((v) => !v.is_archived);
    const interactionType = deriveInteractionType(payload.category_id, activeVariants.length);

    const itemId =
      payload.id ||
      `${slugify(payload.category_id)}-${slugify(trimmedName)}-${generateUUID().slice(0, 4)}`;

    // 2. Upsert menu_items
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
      updated_by: user.id,
    });

    if (itemErr) {
      return { success: false, error: itemErr.message };
    }

    // 3. Synchronize menu_variants: soft-archive removed variants, upsert kept/new variants
    const { data: existingVariants, error: fetchVarErr } = await (supabase as any)
      .from('menu_variants')
      .select('id')
      .eq('menu_item_id', itemId);

    if (fetchVarErr) {
      return { success: false, error: fetchVarErr.message };
    }

    const keptVariantIds = new Set(
      rawVariants.filter((v) => v.id && !v.is_archived).map((v) => v.id as string)
    );
    const toArchiveIds = (existingVariants || [])
      .map((ev: { id: string }) => ev.id)
      .filter((eid: string) => !keptVariantIds.has(eid));

    if (toArchiveIds.length > 0) {
      const { error: archVarErr } = await (supabase as any)
        .from('menu_variants')
        .update({ is_archived: true })
        .in('id', toArchiveIds);

      if (archVarErr) {
        return { success: false, error: archVarErr.message };
      }
    }

    if (rawVariants.length > 0) {
      const variantRows = rawVariants.map((v) => ({
        id:
          v.id ||
          `${itemId}-${slugify(v.label) || 'opt'}-${generateUUID().slice(0, 4)}`,
        menu_item_id: itemId,
        label: v.label.trim(),
        price_paise: v.price_paise,
        volume_ml: v.volume_ml ?? null,
        is_archived: Boolean(v.is_archived),
      }));

      const { error: varErr } = await (supabase as any)
        .from('menu_variants')
        .upsert(variantRows, { onConflict: 'id' });

      if (varErr) {
        return { success: false, error: varErr.message };
      }
    }

    return { success: true, data: { id: itemId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save menu item.' };
  }
}

export async function toggleMenuItemAvailabilityAction(
  id: string,
  currentAvailability: boolean
): Promise<ActionResponse> {
  try {
    const { user } = await requireOwner();

    if (!id || !id.trim()) {
      return { success: false, error: 'Menu item ID is required.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await (supabase as any)
      .from('menu_items')
      .update({
        is_available: !currentAvailability,
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to toggle availability.' };
  }
}

export async function setMenuItemArchivedAction(
  id: string,
  isArchived: boolean
): Promise<ActionResponse> {
  try {
    const { user } = await requireOwner();

    if (!id || !id.trim()) {
      return { success: false, error: 'Menu item ID is required.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await (supabase as any)
      .from('menu_items')
      .update({
        is_archived: Boolean(isArchived),
        updated_at: new Date().toISOString(),
        updated_by: user.id,
      })
      .eq('id', id);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update archive state.' };
  }
}

export async function deleteMenuItemAction(
  id: string
): Promise<ActionResponse> {
  return setMenuItemArchivedAction(id, true);
}

export async function saveCategoryAction(
  payload: CategoryPayload
): Promise<ActionResponse> {
  try {
    await requireOwner();

    const trimmedLabel = payload.label?.trim();
    if (!trimmedLabel) return { success: false, error: 'Category label is required.' };

    if (payload.id === 'frequent') {
      return {
        success: false,
        error: "'Frequent' is a virtual category driven by product flags and cannot be edited.",
      };
    }

    const iconName: ApprovedLucideIcon = APPROVED_LUCIDE_ICONS.includes(
      payload.icon_name as ApprovedLucideIcon
    )
      ? (payload.icon_name as ApprovedLucideIcon)
      : 'IceCream';

    const sortOrder = Number.isFinite(payload.sort_order) ? Math.trunc(payload.sort_order) : 0;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const catId = payload.id || slugify(trimmedLabel) || `cat-${generateUUID().slice(0, 8)}`;

    const { error } = await (supabase as any).from('categories').upsert({
      id: catId,
      label: trimmedLabel,
      icon_name: iconName,
      sort_order: sortOrder,
      is_active: true,
      is_archived: false,
    });

    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: catId } };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save category.' };
  }
}

export async function setCategoryArchivedAction(
  categoryId: string,
  isArchived: boolean
): Promise<ActionResponse> {
  try {
    await requireOwner();

    if (!categoryId || !categoryId.trim()) {
      return { success: false, error: 'Category ID is required.' };
    }

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

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    if (isArchived) {
      const { data: activeItems, error: checkErr } = await (supabase as any)
        .from('menu_items')
        .select('id, name')
        .eq('category_id', categoryId)
        .eq('is_archived', false);

      if (checkErr) return { success: false, error: checkErr.message };

      if (activeItems && activeItems.length > 0) {
        return {
          success: false,
          error: `Cannot archive category while ${activeItems.length} active menu item(s) belong to it. Please reassign or archive those items first.`,
        };
      }
    }

    const { error } = await (supabase as any)
      .from('categories')
      .update({ is_archived: Boolean(isArchived) })
      .eq('id', categoryId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update category archive state.' };
  }
}
