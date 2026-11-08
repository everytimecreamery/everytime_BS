/**
 * Everytime Creamery — Product Categories (Mock Data)
 * Phase 1: Interactive Staff POS Interface
 *
 * NOTE: Category definitions and item counts are demonstration fixtures.
 * Final categories will be managed via the Owner Portal in Phase 6.
 */

export interface ProductCategory {
  id: 'gelato' | 'tubs' | 'beverages';
  label: string;
  count: string;
  iconName: 'IceCream' | 'Package' | 'Coffee';
}

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  {
    id: 'gelato',
    label: 'Gelato Cups & Cones',
    count: '4 Items',
    iconName: 'IceCream',
  },
  {
    id: 'tubs',
    label: 'Takeaway Tubs (500ml)',
    count: '1 Item',
    iconName: 'Package',
  },
  {
    id: 'beverages',
    label: 'Espresso & Affogato',
    count: '2 Items',
    iconName: 'Coffee',
  },
];

