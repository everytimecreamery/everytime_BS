/**
 * Shared types and pure validation/derivation helpers for Master Menu Management.
 * Safe to import from both Server Actions and Client Components.
 */

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
 * Validates menu item and variant payloads before server persistence.
 */
export function validateMenuItemPayload(payload: MenuItemPayload): string | null {
  const trimmedName = payload.name?.trim();
  if (!trimmedName) {
    return 'Product name is required.';
  }
  if (!payload.category_id) {
    return 'Category selection is required.';
  }
  if (
    !payload.base_price_paise ||
    payload.base_price_paise <= 0 ||
    !Number.isInteger(payload.base_price_paise)
  ) {
    return 'Base price must be a positive integer in paise (> ₹0).';
  }

  if (payload.category_id !== 'gelato' && Array.isArray(payload.variants)) {
    for (const v of payload.variants) {
      if (v.is_archived) continue;
      if (!v.label || !v.label.trim()) {
        return 'Each active variant must have a non-empty variant label.';
      }
      if (!v.price_paise || v.price_paise <= 0 || !Number.isInteger(v.price_paise)) {
        return `Variant "${v.label.trim()}" price must be a positive integer in paise (> ₹0).`;
      }
      if (
        v.volume_ml !== undefined &&
        v.volume_ml !== null &&
        (!Number.isInteger(v.volume_ml) || v.volume_ml <= 0)
      ) {
        return `Variant "${v.label.trim()}" volume must be a positive integer in ml.`;
      }
    }
  }

  return null;
}
