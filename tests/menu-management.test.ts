import { describe, it, expect } from 'vitest';
import {
  filterStaffCategoryItems,
  transformDbItemToMenuItem,
} from '@/lib/pos/menuCatalog';
import {
  deriveInteractionType,
  slugify,
  saveMenuItem,
  setCategoryArchived,
  APPROVED_LUCIDE_ICONS,
} from '@/lib/supabase/menu';
import { paiseToRupees, rupeesToPaise, formatPaise } from '@/lib/pos/calculations';
import { MenuItem } from '@/lib/mock/menu';

describe('Menu Management CRUD & Catalog Invariants', () => {
  describe('1. Staff Catalog Filtering (Rule 6, Rule 8)', () => {
    const mockItems: MenuItem[] = [
      {
        id: 'item-1',
        name: 'Dark Chocolate Gelato',
        categoryId: 'gelato',
        basePricePaise: 9900,
        interactionType: 'direct',
        isAvailable: true,
        isArchived: false,
        isFrequent: true,
      },
      {
        id: 'item-2',
        name: 'Sold Out Gelato',
        categoryId: 'gelato',
        basePricePaise: 9900,
        interactionType: 'direct',
        isAvailable: false, // SOLD OUT
        isArchived: false,
        isFrequent: true,
      },
      {
        id: 'item-3',
        name: 'Archived Gelato',
        categoryId: 'gelato',
        basePricePaise: 9900,
        interactionType: 'direct',
        isAvailable: true,
        isArchived: true, // RETIRED / ARCHIVED
        isFrequent: false,
      },
      {
        id: 'item-4',
        name: 'Belgian Waffle',
        categoryId: 'waffle',
        basePricePaise: 14900,
        interactionType: 'waffle_scoop',
        isAvailable: true,
        isArchived: false,
        isFrequent: false,
      },
    ];

    it('excludes unavailable (isAvailable === false) items from the staff grid', () => {
      const gelatoItems = filterStaffCategoryItems(mockItems, 'gelato');
      expect(gelatoItems.some((i) => i.id === 'item-2')).toBe(false);
      expect(gelatoItems.some((i) => i.id === 'item-1')).toBe(true);
    });

    it('excludes archived (isArchived === true) items from the staff grid', () => {
      const gelatoItems = filterStaffCategoryItems(mockItems, 'gelato');
      expect(gelatoItems.some((i) => i.id === 'item-3')).toBe(false);
    });

    it('handles virtual "frequent" category driven by isFrequent flag', () => {
      const frequentItems = filterStaffCategoryItems(mockItems, 'frequent');
      // Only active AND available items with isFrequent = true
      expect(frequentItems).toHaveLength(1);
      expect(frequentItems[0].id).toBe('item-1');
      // Sold out frequent item is excluded
      expect(frequentItems.some((i) => i.id === 'item-2')).toBe(false);
    });
  });

  describe('2. Price Conversion & Paise Integer Math (Rule 3)', () => {
    it('accurately converts rupees to integer paise without floats', () => {
      expect(rupeesToPaise(99)).toBe(9900);
      expect(rupeesToPaise(149)).toBe(14900);
      expect(rupeesToPaise(0.5)).toBe(50);
      expect(rupeesToPaise(12.34)).toBe(1234);
    });

    it('accurately converts paise to display rupees and formats with ₹', () => {
      expect(paiseToRupees(9900)).toBe(99);
      expect(formatPaise(9900)).toBe('₹99');
      expect(formatPaise(14950)).toBe('₹149.50');
    });

    it('rejects negative or zero base prices in saveMenuItem validation', async () => {
      const resZero = await saveMenuItem({
        name: 'Invalid Item',
        category_id: 'gelato',
        base_price_paise: 0,
      });
      expect(resZero.success).toBe(false);
      expect(resZero.error).toContain('positive integer in paise');

      const resNegative = await saveMenuItem({
        name: 'Invalid Item',
        category_id: 'gelato',
        base_price_paise: -500,
      });
      expect(resNegative.success).toBe(false);
      expect(resNegative.error).toContain('positive integer in paise');
    });

    it('rejects empty or whitespace product names', async () => {
      const resEmpty = await saveMenuItem({
        name: '   ',
        category_id: 'gelato',
        base_price_paise: 9900,
      });
      expect(resEmpty.success).toBe(false);
      expect(resEmpty.error).toContain('Product name is required');
    });
  });

  describe('3. Variant-Derived Add Mode & Invariant 2 (Rule 4, Rule 6)', () => {
    it('forces "direct" interaction type for category "gelato" regardless of variants (Invariant 2)', () => {
      const mode = deriveInteractionType('gelato', 0);
      expect(mode).toBe('direct');

      // Even if variants count was somehow passed, gelato must be direct single scoop
      const modeWithVariants = deriveInteractionType('gelato', 2);
      expect(modeWithVariants).toBe('direct');
    });

    it('derives "direct" for any category when variant count is 0', () => {
      expect(deriveInteractionType('sundaes', 0)).toBe('direct');
      expect(deriveInteractionType('extra', 0)).toBe('direct');
      expect(deriveInteractionType('thickshakes', 0)).toBe('direct');
    });

    it('derives options mode when variant count > 0', () => {
      expect(deriveInteractionType('tubs', 2)).toBe('gelato_sizes');
      expect(deriveInteractionType('waffle', 2)).toBe('waffle_scoop');
      expect(deriveInteractionType('hot_chocolate', 2)).toBe('hot_chocolate_options');
    });
  });

  describe('4. Reserved Categories & Soft Archive Protection (Rule 1, Rule 5)', () => {
    it('blocks archiving virtual "frequent" category', async () => {
      const res = await setCategoryArchived('frequent', true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('virtual category');
    });

    it('blocks archiving protected "extra" category', async () => {
      const res = await setCategoryArchived('extra', true);
      expect(res.success).toBe(false);
      expect(res.error).toContain('protected system category');
    });
  });

  describe('5. Database Row to MenuItem Domain Transformation', () => {
    it('maps database record columns and ignores archived variants', () => {
      const dbRow = {
        id: 'item-tub-vanilla',
        name: 'Vanilla Tub',
        category_id: 'tubs',
        base_price_paise: 16900,
        interaction_type: 'gelato_sizes',
        is_premium: false,
        is_frequent: true,
        is_available: true,
        is_archived: false,
        portion_grams: null,
        description: 'Fresh vanilla bean tub',
        menu_variants: [
          { id: 'v1', label: '250ml', price_paise: 16900, is_archived: false },
          { id: 'v2', label: '500ml', price_paise: 32900, is_archived: false },
          { id: 'v3', label: '1000ml Old', price_paise: 59900, is_archived: true }, // should be ignored
        ],
      };

      const menuItem = transformDbItemToMenuItem(dbRow);

      expect(menuItem.id).toBe('item-tub-vanilla');
      expect(menuItem.name).toBe('Vanilla Tub');
      expect(menuItem.categoryId).toBe('tubs');
      expect(menuItem.basePricePaise).toBe(16900);
      expect(menuItem.isFrequent).toBe(true);
      expect(menuItem.variants).toHaveLength(2);
      expect(menuItem.variants?.map((v) => v.id)).toEqual(['v1', 'v2']);
    });
  });

  describe('6. Approved Lucide Icons & Slugification', () => {
    it('contains all required Lucide icons for owner categories', () => {
      expect(APPROVED_LUCIDE_ICONS).toContain('IceCream');
      expect(APPROVED_LUCIDE_ICONS).toContain('Flame');
      expect(APPROVED_LUCIDE_ICONS).toContain('Layers');
      expect(APPROVED_LUCIDE_ICONS).toContain('Coffee');
    });

    it('slugifies category and product names correctly', () => {
      expect(slugify('Takeaway Tubs')).toBe('takeaway-tubs');
      expect(slugify('Hazelnut Praline (Nocciola)!')).toBe('hazelnut-praline-nocciola');
      expect(slugify('  Spicy Dark Chocolate & Chilli ')).toBe('spicy-dark-chocolate-chilli');
    });
  });
});
