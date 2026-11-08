/**
 * Everytime Creamery — Artisan Gelato Flavors (Mock Data)
 * Phase 1: Interactive Staff POS Interface
 *
 * NOTE: These flavor names and availability flags are placeholder demonstration data.
 * Real flavor inventory and seasonal updates will be managed via the Owner Portal in Phase 6.
 */

export interface Flavor {
  id: string;
  name: string;
  category: 'cream' | 'sorbet' | 'nut';
  description: string;
  colorHex: string;
  available: boolean;
  isDairyFree?: boolean;
  containsNuts?: boolean;
}

export const MOCK_FLAVORS: Flavor[] = [
  {
    id: 'pistachio-bronte',
    name: 'Pistachio Bronte',
    category: 'nut',
    description: 'Slow-roasted Sicilian Bronte pistachios with sea salt flakes',
    colorHex: '#93A87B',
    available: true,
    containsNuts: true,
  },
  {
    id: 'dark-chocolate',
    name: 'Dark Chocolate 70%',
    category: 'cream',
    description: 'Single-origin Ecuadorian cocoa with intense chocolate richness',
    colorHex: '#3E2723',
    available: true,
  },
  {
    id: 'alphonso-mango',
    name: 'Alphonso Mango Sorbet',
    category: 'sorbet',
    description: 'Pure Ratnagiri Alphonso pulp, refreshing and water-based',
    colorHex: '#F4A261',
    available: true,
    isDairyFree: true,
  },
  {
    id: 'madagascar-vanilla',
    name: 'Madagascar Vanilla',
    category: 'cream',
    description: 'Whole Bourbon vanilla bean caviar infused in farm cream',
    colorHex: '#F3E8D2',
    available: true,
  },
  {
    id: 'stracciatella',
    name: 'Stracciatella Classic',
    category: 'cream',
    description: 'Fior di latte ribboned with crispy shards of dark chocolate',
    colorHex: '#EAE6DF',
    available: true,
  },
  {
    id: 'roasted-hazelnut',
    name: 'Roasted Hazelnut',
    category: 'nut',
    description: 'Piedmont IGP hazelnuts double-roasted for aromatic depth',
    colorHex: '#A27B5C',
    available: true,
    containsNuts: true,
  },
];

