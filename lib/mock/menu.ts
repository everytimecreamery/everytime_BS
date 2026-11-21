/**
 * Everytime Creamery — Master Menu Mock Data & Definitions
 * Phase 1: Exact Menu Integration & Tablet-First Staff POS
 *
 * Source of truth for menu items, variants, add-ons, and pricing.
 * All prices are strictly stored as integer paise (1 INR = 100 paise).
 */

export type CategoryId =
  | 'frequent'
  | 'extra'
  | 'gelato'
  | 'sundaes'
  | 'waffle'
  | 'thickshakes'
  | 'tubs'
  | 'hot_chocolate';

export interface MenuCategory {
  id: CategoryId;
  label: string;
  iconName: string;
  description: string;
}

export interface MenuItemVariant {
  id: string;
  label: string;
  pricePaise: number;
}

export interface MenuItemAddOn {
  id: string;
  label: string;
  pricePaise: number;
}

export type MenuInteractionType =
  | 'direct'
  | 'gelato_sizes'
  | 'waffle_scoop'
  | 'hot_chocolate_options';

export interface MenuItem {
  id: string;
  name: string;
  categoryId: CategoryId;
  basePricePaise: number;
  interactionType: MenuInteractionType;
  isPremium?: boolean;
  isFrequent?: boolean;
  isAvailable?: boolean;
  isArchived?: boolean;
  portionGrams?: number;
  variants?: MenuItemVariant[];
  addOns?: MenuItemAddOn[];
  description?: string;
}

/**
 * 8 Categories in exact specified order:
 * 1. Frequent
 * 2. Extra
 * 3. Gelato
 * 4. Sundaes
 * 5. Waffle
 * 6. Thickshakes
 * 7. Takeaway Tubs
 * 8. Hot Chocolate
 */
export const MENU_CATEGORIES: MenuCategory[] = [
  {
    id: 'frequent',
    label: 'Frequent',
    iconName: 'Flame',
    description: 'Popular everyday items for fast one-tap ordering',
  },
  {
    id: 'extra',
    label: 'Extra',
    iconName: 'Layers',
    description: 'Toppings, cones, and beverages',
  },
  {
    id: 'gelato',
    label: 'Gelato',
    iconName: 'IceCream',
    description: 'Artisan handcrafted Italian gelato (85ml cup)',
  },
  {
    id: 'sundaes',
    label: 'Sundaes',
    iconName: 'Cherry',
    description: 'Signature loaded dessert sundaes',
  },
  {
    id: 'waffle',
    label: 'Waffle',
    iconName: 'UtensilsCrossed',
    description: 'Fresh warm waffles with optional scoop pairing',
  },
  {
    id: 'thickshakes',
    label: 'Thickshakes',
    iconName: 'CupSoda',
    description: 'Signature creamy thickshakes and exclusive sips',
  },
  {
    id: 'tubs',
    label: 'Takeaway Tubs',
    iconName: 'Package',
    description: 'Insulated takeaway packs (250ml and 500ml)',
  },
  {
    id: 'hot_chocolate',
    label: 'Hot Chocolate',
    iconName: 'Coffee',
    description: 'Rich artisanal hot chocolate',
  },
];

/** Waffle add-on scoop choices (+₹60 for Vanilla or Chocolate scoop) */
export const WAFFLE_SCOOP_OPTIONS: MenuItemAddOn[] = [
  {
    id: 'scoop-none',
    label: 'No Scoop',
    pricePaise: 0,
  },
  {
    id: 'scoop-vanilla',
    label: 'Vanilla Scoop',
    pricePaise: 6000, // ₹60
  },
  {
    id: 'scoop-chocolate',
    label: 'Chocolate Scoop',
    pricePaise: 6000, // ₹60
  },
];

/**
 * Gelato flavors master catalog (12 flavors).
 * Shared between 'gelato' and 'tubs' categories using the exact same item IDs.
 */
export const GELATO_ITEMS: MenuItem[] = [
  {
    id: 'gelato-classic-vanilla',
    name: 'Classic Vanilla',
    categoryId: 'gelato',
    basePricePaise: 16900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 16900 },
      { id: '500ml', label: '500ml', pricePaise: 32900 },
    ],
  },
  {
    id: 'gelato-tender-coconut',
    name: 'Tender Coconut',
    categoryId: 'gelato',
    basePricePaise: 16900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 16900 },
      { id: '500ml', label: '500ml', pricePaise: 29900 },
    ],
  },
  {
    id: 'gelato-mango-sorbet',
    name: 'Mango Sorbet',
    categoryId: 'gelato',
    basePricePaise: 16900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 16900 },
      { id: '500ml', label: '500ml', pricePaise: 32900 },
    ],
  },
  {
    id: 'gelato-iranian-dates',
    name: 'Iranian Dates',
    categoryId: 'gelato',
    basePricePaise: 17900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 17900 },
      { id: '500ml', label: '500ml', pricePaise: 34900 },
    ],
  },
  {
    id: 'gelato-oreo-cream',
    name: "Oreo N' Cream",
    categoryId: 'gelato',
    basePricePaise: 17900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 17900 },
      { id: '500ml', label: '500ml', pricePaise: 34900 },
    ],
  },
  {
    id: 'gelato-black-rice',
    name: 'Black Rice',
    categoryId: 'gelato',
    basePricePaise: 18900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 18900 },
      { id: '500ml', label: '500ml', pricePaise: 36900 },
    ],
  },
  {
    id: 'gelato-strawberry-cheese-cream',
    name: 'Strawberry Cheese Cream',
    categoryId: 'gelato',
    basePricePaise: 19900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 19900 },
      { id: '500ml', label: '500ml', pricePaise: 38900 },
    ],
  },
  {
    id: 'gelato-milo-magic',
    name: 'Milo Magic',
    categoryId: 'gelato',
    basePricePaise: 18900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 18900 },
      { id: '500ml', label: '500ml', pricePaise: 36900 },
    ],
  },
  {
    id: 'gelato-chocolate-bliss',
    name: 'Chocolate Bliss',
    categoryId: 'gelato',
    basePricePaise: 19900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 19900 },
      { id: '500ml', label: '500ml', pricePaise: 38900 },
    ],
  },
  {
    id: 'gelato-cookies-caramel',
    name: "Cookies N' Caramel",
    categoryId: 'gelato',
    basePricePaise: 19900,
    interactionType: 'gelato_sizes',
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 19900 },
      { id: '500ml', label: '500ml', pricePaise: 38900 },
    ],
  },
  {
    id: 'gelato-hazel-nutella',
    name: 'Hazel Nutella',
    categoryId: 'gelato',
    basePricePaise: 21900,
    interactionType: 'gelato_sizes',
    isPremium: true,
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 21900 },
      { id: '500ml', label: '500ml', pricePaise: 42900 },
    ],
  },
  {
    id: 'gelato-salted-butter-caramel',
    name: 'Salted Butter Caramel',
    categoryId: 'gelato',
    basePricePaise: 21900,
    interactionType: 'gelato_sizes',
    isPremium: true,
    variants: [
      { id: '250ml', label: '250ml', pricePaise: 21900 },
      { id: '500ml', label: '500ml', pricePaise: 42900 },
    ],
  },
];

/** Extra Category Items */
export const EXTRA_ITEMS: MenuItem[] = [
  {
    id: 'extra-toppings',
    name: 'Toppings',
    categoryId: 'extra',
    basePricePaise: 1500, // ₹15
    interactionType: 'direct',
  },
  {
    id: 'extra-wafer-cone',
    name: 'Wafer Cone',
    categoryId: 'extra',
    basePricePaise: 1500, // ₹15
    interactionType: 'direct',
  },
  {
    id: 'extra-water-bottle',
    name: 'Water Bottle',
    categoryId: 'extra',
    basePricePaise: 600, // ₹6
    interactionType: 'direct',
  },
];

/** Sundaes Category Items */
export const SUNDAE_ITEMS: MenuItem[] = [
  {
    id: 'sundae-hot-chocolate-fudge',
    name: 'Hot Chocolate Fudge',
    categoryId: 'sundaes',
    basePricePaise: 14900, // ₹149
    interactionType: 'direct',
  },
  {
    id: 'sundae-oreo-cookie-monster',
    name: 'Oreo Cookie Monster',
    categoryId: 'sundaes',
    basePricePaise: 14900, // ₹149
    interactionType: 'direct',
  },
  {
    id: 'sundae-dry-fruit',
    name: 'Dry Fruit Sundae',
    categoryId: 'sundaes',
    basePricePaise: 16900, // ₹169
    interactionType: 'direct',
  },
  {
    id: 'sundae-loaded-biscoff',
    name: 'Loaded Biscoff',
    categoryId: 'sundaes',
    basePricePaise: 18900, // ₹189
    interactionType: 'direct',
  },
  {
    id: 'sundae-hazelnut-brownie',
    name: 'Hazelnut Brownie',
    categoryId: 'sundaes',
    basePricePaise: 18900, // ₹189
    interactionType: 'direct',
  },
  {
    id: 'sundae-death-by-chocolate',
    name: 'Death By Chocolate',
    categoryId: 'sundaes',
    basePricePaise: 15900, // ₹159
    interactionType: 'direct',
  },
];

/** Waffles Category Items */
export const WAFFLE_ITEMS: MenuItem[] = [
  {
    id: 'waffle-milk-chocolate',
    name: 'Milk Chocolate Drizzle',
    categoryId: 'waffle',
    basePricePaise: 14900, // ₹149
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
  {
    id: 'waffle-white-chocolate',
    name: 'White Chocolate Melt',
    categoryId: 'waffle',
    basePricePaise: 14900, // ₹149
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
  {
    id: 'waffle-triple-chocolate',
    name: 'Triple Chocolate Overload',
    categoryId: 'waffle',
    basePricePaise: 15900, // ₹159
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
  {
    id: 'waffle-almond-brownie',
    name: 'Almond Brownie Crunch',
    categoryId: 'waffle',
    basePricePaise: 16900, // ₹169
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
  {
    id: 'waffle-kitkat-crush',
    name: 'Kitkat Crush',
    categoryId: 'waffle',
    basePricePaise: 18900, // ₹189
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
  {
    id: 'waffle-nutella-bliss',
    name: 'Nutella Bliss',
    categoryId: 'waffle',
    basePricePaise: 18900, // ₹189
    interactionType: 'waffle_scoop',
    addOns: WAFFLE_SCOOP_OPTIONS,
  },
];

/** Thickshakes Category Items (including Cold Milo from Signature Sips) */
export const THICKSHAKE_ITEMS: MenuItem[] = [
  {
    id: 'thickshake-dates-honey',
    name: 'Dates and Honey',
    categoryId: 'thickshakes',
    basePricePaise: 14900, // ₹149
    interactionType: 'direct',
  },
  {
    id: 'thickshake-mango',
    name: 'Mango',
    categoryId: 'thickshakes',
    basePricePaise: 14900, // ₹149
    interactionType: 'direct',
  },
  {
    id: 'thickshake-oreo',
    name: 'Oreo',
    categoryId: 'thickshakes',
    basePricePaise: 16900, // ₹169
    interactionType: 'direct',
  },
  {
    id: 'thickshake-biscoff',
    name: 'Biscoff',
    categoryId: 'thickshakes',
    basePricePaise: 16900, // ₹169
    interactionType: 'direct',
  },
  {
    id: 'thickshake-kitkat',
    name: 'Kitkat',
    categoryId: 'thickshakes',
    basePricePaise: 19900, // ₹199
    interactionType: 'direct',
  },
  {
    id: 'thickshake-hazelnut-brownie',
    name: 'Hazelnut Brownie',
    categoryId: 'thickshakes',
    basePricePaise: 19900, // ₹199
    interactionType: 'direct',
  },
  {
    id: 'thickshake-cold-milo',
    name: 'Cold Milo',
    categoryId: 'thickshakes',
    basePricePaise: 14900, // ₹149
    interactionType: 'direct',
  },
];

/**
 * Hot Chocolate Category Item:
 * NOTE: The business owner must confirm the exact meaning of Option 1 (₹79)
 * and Option 2 (₹149) (e.g., sizes, single/double shot, preparation style).
 * For now, they are cleanly presented as Option 1 and Option 2 without invented size names.
 */
export const HOT_CHOCOLATE_ITEMS: MenuItem[] = [
  {
    id: 'hot-chocolate-item',
    name: 'Hot Chocolate',
    categoryId: 'hot_chocolate',
    basePricePaise: 7900, // ₹79 base
    interactionType: 'hot_chocolate_options',
    variants: [
      { id: 'option-1', label: 'Option 1', pricePaise: 7900 }, // ₹79
      { id: 'option-2', label: 'Option 2', pricePaise: 14900 }, // ₹149
    ],
  },
];

/**
 * All core catalog items combined (no duplicates).
 */
export const ALL_MENU_ITEMS: MenuItem[] = [
  ...EXTRA_ITEMS,
  ...GELATO_ITEMS,
  ...SUNDAE_ITEMS,
  ...WAFFLE_ITEMS,
  ...THICKSHAKE_ITEMS,
  ...HOT_CHOCOLATE_ITEMS,
];

/**
 * Frequent category: Curated list referencing original menu item IDs.
 * Does NOT duplicate items; looks up from ALL_MENU_ITEMS.
 */
export const FREQUENT_ITEM_IDS: string[] = [
  'gelato-classic-vanilla',
  'gelato-hazel-nutella',
  'gelato-oreo-cream',
  'waffle-nutella-bliss',
  'sundae-hot-chocolate-fudge',
  'thickshake-kitkat',
  'thickshake-cold-milo',
  'extra-wafer-cone',
];

/**
 * Helper to get items for a given category.
 * - 'tubs' returns the exact same gelato items as 'gelato'.
 * - 'frequent' returns the curated items referenced by FREQUENT_ITEM_IDS.
 */
export function getMenuItemsByCategory(categoryId: CategoryId): MenuItem[] {
  if (categoryId === 'frequent') {
    return FREQUENT_ITEM_IDS.map((id) => {
      const item = ALL_MENU_ITEMS.find((m) => m.id === id);
      if (!item) {
        throw new Error(`Frequent item reference not found for ID: ${id}`);
      }
      return item;
    });
  }

  if (categoryId === 'tubs') {
    // Reuses the same gelato items
    return GELATO_ITEMS;
  }

  return ALL_MENU_ITEMS.filter((item) => item.categoryId === categoryId);
}

/**
 * Quick lookup helper by item ID.
 */
export function getMenuItemById(id: string): MenuItem | undefined {
  return ALL_MENU_ITEMS.find((item) => item.id === id);
}

