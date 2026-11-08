/**
 * Everytime Creamery — Product Catalog (Mock Data)
 * Phase 1: Interactive Staff POS Interface
 *
 * NOTE: Prices are represented in INTEGER PAISE (e.g., ₹120.00 = 12000 paise)
 * to prevent floating-point calculation inaccuracies.
 * All prices are demonstration placeholders and must be approved by the owner in Phase 6.
 */

import { GelatoCupSize } from '@/types';

export type ProductType = 'gelato_cup' | 'gelato_cone' | 'tub' | 'beverage';

export interface GelatoSizeOption {
  size: GelatoCupSize;
  label: string;
  maxFlavors: number;
  pricePaise: number;
  badge?: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: 'gelato' | 'tubs' | 'beverages';
  description: string;
  productType: ProductType;
  available: boolean;
  basePricePaise: number;
  requiresConfiguration: boolean;
  /** Fixed scoop count or size if product represents a fixed size */
  fixedSize?: GelatoCupSize;
  /** Configurable sizes (e.g. for cup variants) */
  sizeOptions?: GelatoSizeOption[];
  /** Maximum number of flavors allowed (for gelato/tubs) */
  maxFlavors?: number;
}

export const GELATO_SIZES: Record<GelatoCupSize, { label: string; scoopCount: number; defaultPricePaise: number }> = {
  piccolo: {
    label: 'Piccolo (1 Scoop)',
    scoopCount: 1,
    defaultPricePaise: 12000, // ₹120.00
  },
  medio: {
    label: 'Medio (2 Scoops)',
    scoopCount: 2,
    defaultPricePaise: 18000, // ₹180.00
  },
  grande: {
    label: 'Grande (3 Scoops)',
    scoopCount: 3,
    defaultPricePaise: 24000, // ₹240.00
  },
};

export const MOCK_PRODUCTS: Product[] = [
  // Gelato Cups & Cones
  {
    id: 'piccolo-cup',
    name: 'Piccolo Cup',
    categoryId: 'gelato',
    description: 'Single artisanal scoop in a signature compostable cup',
    productType: 'gelato_cup',
    available: true,
    basePricePaise: 12000, // ₹120.00
    requiresConfiguration: true,
    fixedSize: 'piccolo',
    maxFlavors: 1,
  },
  {
    id: 'medio-cup',
    name: 'Medio Cup',
    categoryId: 'gelato',
    description: 'Two artisanal scoops in our classic medium cup',
    productType: 'gelato_cup',
    available: true,
    basePricePaise: 18000, // ₹180.00
    requiresConfiguration: true,
    fixedSize: 'medio',
    maxFlavors: 2,
  },
  {
    id: 'grande-cup',
    name: 'Grande Cup',
    categoryId: 'gelato',
    description: 'Three artisanal scoops for the true gelato connoisseur',
    productType: 'gelato_cup',
    available: true,
    basePricePaise: 24000, // ₹240.00
    requiresConfiguration: true,
    fixedSize: 'grande',
    maxFlavors: 3,
  },
  {
    id: 'waffle-cone',
    name: 'Waffle Cone',
    categoryId: 'gelato',
    description: 'Freshly pressed vanilla waffle cone with 1 scoop of your choice',
    productType: 'gelato_cone',
    available: true,
    basePricePaise: 15000, // ₹150.00
    requiresConfiguration: true,
    fixedSize: 'piccolo',
    maxFlavors: 1,
  },

  // Takeaway Tubs (500ml)
  {
    id: 'tub-500ml',
    name: '500ml Party Tub',
    categoryId: 'tubs',
    description: 'Insulated takeaway thermal pack, serves 4–5 scoops. Keep chilled.',
    productType: 'tub',
    available: true,
    basePricePaise: 45000, // ₹450.00
    requiresConfiguration: true,
    maxFlavors: 2,
  },

  // Espresso & Affogato
  {
    id: 'espresso',
    name: 'Espresso Double Shot',
    categoryId: 'beverages',
    description: '100% Arabica roasted blend extracted at 9 bars',
    productType: 'beverage',
    available: true,
    basePricePaise: 9000, // ₹90.00
    requiresConfiguration: false,
  },
  {
    id: 'affogato',
    name: 'Affogato al Caffè',
    categoryId: 'beverages',
    description: 'Madagascar Vanilla gelato scoop drenched in freshly pulled double espresso',
    productType: 'beverage',
    available: true,
    basePricePaise: 16000, // ₹160.00
    requiresConfiguration: false,
  },
];

