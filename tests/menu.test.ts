import { describe, it, expect } from 'vitest';
import {
  MENU_CATEGORIES,
  ALL_MENU_ITEMS,
  GELATO_ITEMS,
  EXTRA_ITEMS,
  SUNDAE_ITEMS,
  WAFFLE_ITEMS,
  THICKSHAKE_ITEMS,
  HOT_CHOCOLATE_ITEMS,
  FREQUENT_ITEM_IDS,
  getMenuItemsByCategory,
  getMenuItemById,
  WAFFLE_SCOOP_OPTIONS,
} from '@/lib/mock/menu';

describe('Phase 1 Menu Catalog Tests', () => {
  it('1. All eight categories exist in exact order', () => {
    expect(MENU_CATEGORIES).toHaveLength(8);
    const categoryIds = MENU_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toEqual([
      'frequent',
      'extra',
      'gelato',
      'sundaes',
      'waffle',
      'thickshakes',
      'tubs',
      'hot_chocolate',
    ]);

    const labels = MENU_CATEGORIES.map((c) => c.label);
    expect(labels).toEqual([
      'Frequent',
      'Extra',
      'Gelato',
      'Sundaes',
      'Waffle',
      'Thickshakes',
      'Takeaway Tubs',
      'Hot Chocolate',
    ]);
  });

  it('2. Extra category contains exact products and prices', () => {
    expect(EXTRA_ITEMS).toHaveLength(3);
    const toppings = EXTRA_ITEMS.find((i) => i.id === 'extra-toppings')!;
    const cone = EXTRA_ITEMS.find((i) => i.id === 'extra-wafer-cone')!;
    const water = EXTRA_ITEMS.find((i) => i.id === 'extra-water-bottle')!;

    expect(toppings.name).toBe('Toppings');
    expect(toppings.basePricePaise).toBe(1500); // ₹15

    expect(cone.name).toBe('Wafer Cone');
    expect(cone.basePricePaise).toBe(1500); // ₹15

    expect(water.name).toBe('Water Bottle');
    expect(water.basePricePaise).toBe(600); // ₹6
  });

  it('3. Gelato contains all 12 flavors with exact 250ml and 500ml prices', () => {
    expect(GELATO_ITEMS).toHaveLength(12);

    const expectedPrices: Record<string, { p250: number; p500: number; isPremium?: boolean }> = {
      'Classic Vanilla': { p250: 16900, p500: 32900 },
      'Tender Coconut': { p250: 16900, p500: 29900 },
      'Mango Sorbet': { p250: 16900, p500: 32900 },
      'Iranian Dates': { p250: 17900, p500: 34900 },
      "Oreo N' Cream": { p250: 17900, p500: 34900 },
      'Black Rice': { p250: 18900, p500: 36900 },
      'Strawberry Cheese Cream': { p250: 19900, p500: 38900 },
      'Milo Magic': { p250: 18900, p500: 36900 },
      'Chocolate Bliss': { p250: 19900, p500: 38900 },
      "Cookies N' Caramel": { p250: 19900, p500: 38900 },
      'Hazel Nutella': { p250: 21900, p500: 42900, isPremium: true },
      'Salted Butter Caramel': { p250: 21900, p500: 42900, isPremium: true },
    };

    for (const [name, data] of Object.entries(expectedPrices)) {
      const item = GELATO_ITEMS.find((g) => g.name === name);
      expect(item, `Gelato flavor ${name} must exist`).toBeDefined();
      expect(item?.variants).toHaveLength(2);

      const v250 = item?.variants?.find((v) => v.id === '250ml');
      const v500 = item?.variants?.find((v) => v.id === '500ml');

      expect(v250?.pricePaise).toBe(data.p250);
      expect(v500?.pricePaise).toBe(data.p500);

      if (data.isPremium) {
        expect(item?.isPremium).toBe(true);
      } else {
        expect(item?.isPremium).toBeFalsy();
      }
    }
  });

  it('4. Sundaes category contains all 6 items with exact prices', () => {
    expect(SUNDAE_ITEMS).toHaveLength(6);
    const expected = {
      'Hot Chocolate Fudge': 14900,
      'Oreo Cookie Monster': 14900,
      'Dry Fruit Sundae': 16900,
      'Loaded Biscoff': 18900,
      'Hazelnut Brownie': 18900,
      'Death By Chocolate': 15900,
    };

    for (const [name, price] of Object.entries(expected)) {
      const item = SUNDAE_ITEMS.find((s) => s.name === name);
      expect(item).toBeDefined();
      expect(item?.basePricePaise).toBe(price);
    }
  });

  it('5. Waffles category has all 6 items and scoop add-ons (+₹60)', () => {
    expect(WAFFLE_ITEMS).toHaveLength(6);
    const expectedWaffles = {
      'Milk Chocolate Drizzle': 14900,
      'White Chocolate Melt': 14900,
      'Triple Chocolate Overload': 15900,
      'Almond Brownie Crunch': 16900,
      'Kitkat Crush': 18900,
      'Nutella Bliss': 18900,
    };

    for (const [name, price] of Object.entries(expectedWaffles)) {
      const item = WAFFLE_ITEMS.find((w) => w.name === name);
      expect(item).toBeDefined();
      expect(item?.basePricePaise).toBe(price);
      expect(item?.interactionType).toBe('waffle_scoop');
    }

    // Verify scoop add-on options
    expect(WAFFLE_SCOOP_OPTIONS).toHaveLength(3);
    expect(WAFFLE_SCOOP_OPTIONS.find((s) => s.id === 'scoop-none')?.pricePaise).toBe(0);
    expect(WAFFLE_SCOOP_OPTIONS.find((s) => s.id === 'scoop-vanilla')?.pricePaise).toBe(6000); // ₹60
    expect(WAFFLE_SCOOP_OPTIONS.find((s) => s.id === 'scoop-chocolate')?.pricePaise).toBe(6000); // ₹60
  });

  it('6. Thickshakes category has all 7 items (including Cold Milo)', () => {
    expect(THICKSHAKE_ITEMS).toHaveLength(7);
    const expected = {
      'Dates and Honey': 14900,
      Mango: 14900,
      Oreo: 16900,
      Biscoff: 16900,
      Kitkat: 19900,
      'Hazelnut Brownie': 19900,
      'Cold Milo': 14900,
    };

    for (const [name, price] of Object.entries(expected)) {
      const item = THICKSHAKE_ITEMS.find((t) => t.name === name);
      expect(item).toBeDefined();
      expect(item?.basePricePaise).toBe(price);
    }
  });

  it('7. Takeaway Tubs category reuses exact same gelato items without duplication', () => {
    const tubItems = getMenuItemsByCategory('tubs');
    expect(tubItems).toHaveLength(12);
    expect(tubItems).toEqual(GELATO_ITEMS);
    expect(tubItems[0].id).toBe(GELATO_ITEMS[0].id);
  });

  it('8. Hot Chocolate preserves both supplied price options without invented labels', () => {
    expect(HOT_CHOCOLATE_ITEMS).toHaveLength(1);
    const hotChoc = HOT_CHOCOLATE_ITEMS[0];
    expect(hotChoc.variants).toHaveLength(2);
    expect(hotChoc.variants?.[0].label).toBe('Option 1');
    expect(hotChoc.variants?.[0].pricePaise).toBe(7900); // ₹79
    expect(hotChoc.variants?.[1].label).toBe('Option 2');
    expect(hotChoc.variants?.[1].pricePaise).toBe(14900); // ₹149
  });

  it('9. Frequent category references existing product IDs instead of creating duplicate records', () => {
    const frequentItems = getMenuItemsByCategory('frequent');
    expect(frequentItems).toHaveLength(FREQUENT_ITEM_IDS.length);

    for (const item of frequentItems) {
      expect(FREQUENT_ITEM_IDS).toContain(item.id);
      const original = getMenuItemById(item.id);
      expect(original).toBeDefined();
      expect(item).toBe(original);
    }
  });

  it('10. No duplicate product IDs across the entire catalog', () => {
    const ids = ALL_MENU_ITEMS.map((item) => item.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

