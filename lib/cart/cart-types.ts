/**
 * Everytime Creamery — Cart Types & Domain Models
 * Phase 1: Interactive Staff POS Interface
 */

import { GelatoCupSize } from '@/types';

export interface CartFlavorSelection {
  id: string;
  name: string;
}

export interface CartItemConfiguration {
  size?: GelatoCupSize;
  flavors: CartFlavorSelection[];
  notes?: string;
}

export interface CartLineItem {
  /** Stable line identity based on product and its unique configuration */
  id: string;
  productId: string;
  productName: string;
  unitPricePaise: number;
  quantity: number;
  configuration?: CartItemConfiguration;
  lineTotalPaise: number;
}

export interface CartState {
  items: CartLineItem[];
  subtotalPaise: number;
  estimatedTaxPaise: number;
  totalPaise: number;
  totalItemQuantity: number;
}

