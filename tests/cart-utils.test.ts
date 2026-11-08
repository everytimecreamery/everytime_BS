import { describe, it, expect } from 'vitest';
import {
  addItemToCart,
  updateItemQuantity,
  removeItemFromCart,
  clearCart,
  createInitialCartState,
  generateCartLineId,
} from '@/lib/cart/cart-utils';
import {
  calculateLineTotalPaise,
  calculateSubtotalPaise,
  formatPaise,
} from '@/lib/cart/pricing';
import { CartState } from '@/lib/cart/cart-types';

describe('Cart Utility Tests (Phase 1)', () => {
  const initialCart: CartState = createInitialCartState();

  it('1. Adds an item to an empty cart', () => {
    const updated = addItemToCart(initialCart, {
      productId: 'espresso',
      productName: 'Espresso Double Shot',
      unitPricePaise: 9000,
      quantity: 1,
    });

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].productName).toBe('Espresso Double Shot');
    expect(updated.items[0].quantity).toBe(1);
    expect(updated.items[0].unitPricePaise).toBe(9000);
    expect(updated.items[0].lineTotalPaise).toBe(9000);
    expect(updated.subtotalPaise).toBe(9000);
    expect(updated.totalItemQuantity).toBe(1);
  });

  it('2. Adds the same configuration twice by increasing quantity', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'medio-cup',
      productName: 'Medio Cup',
      unitPricePaise: 18000,
      quantity: 1,
      configuration: {
        size: 'medio',
        flavors: [
          { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
          { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
        ],
      },
    });

    // Add identical configuration again
    const step2 = addItemToCart(step1, {
      productId: 'medio-cup',
      productName: 'Medio Cup',
      unitPricePaise: 18000,
      quantity: 1,
      configuration: {
        size: 'medio',
        flavors: [
          { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
          { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
        ],
      },
    });

    expect(step2.items).toHaveLength(1);
    expect(step2.items[0].quantity).toBe(2);
    expect(step2.items[0].lineTotalPaise).toBe(36000);
    expect(step2.subtotalPaise).toBe(36000);
  });

  it('3. Keeps different flavor configurations as separate cart lines', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'medio-cup',
      productName: 'Medio Cup',
      unitPricePaise: 18000,
      quantity: 1,
      configuration: {
        size: 'medio',
        flavors: [
          { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
          { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
        ],
      },
    });

    const step2 = addItemToCart(step1, {
      productId: 'medio-cup',
      productName: 'Medio Cup',
      unitPricePaise: 18000,
      quantity: 1,
      configuration: {
        size: 'medio',
        flavors: [
          { id: 'alphonso-mango', name: 'Alphonso Mango Sorbet' },
          { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
        ],
      },
    });

    expect(step2.items).toHaveLength(2);
    expect(step2.items[0].quantity).toBe(1);
    expect(step2.items[1].quantity).toBe(1);
    expect(step2.subtotalPaise).toBe(36000);
  });

  it('4. Increases quantity correctly', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'affogato',
      productName: 'Affogato al Caffè',
      unitPricePaise: 16000,
      quantity: 1,
    });

    const lineId = step1.items[0].id;
    const step2 = updateItemQuantity(step1, lineId, 3);

    expect(step2.items[0].quantity).toBe(3);
    expect(step2.items[0].lineTotalPaise).toBe(48000);
    expect(step2.subtotalPaise).toBe(48000);
  });

  it('5. Decreases quantity correctly', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'affogato',
      productName: 'Affogato al Caffè',
      unitPricePaise: 16000,
      quantity: 3,
    });

    const lineId = step1.items[0].id;
    const step2 = updateItemQuantity(step1, lineId, 2);

    expect(step2.items[0].quantity).toBe(2);
    expect(step2.items[0].lineTotalPaise).toBe(32000);
    expect(step2.subtotalPaise).toBe(32000);
  });

  it('6. Removes an item from the cart', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'espresso',
      productName: 'Espresso Double Shot',
      unitPricePaise: 9000,
      quantity: 1,
    });

    const lineId = step1.items[0].id;
    const step2 = removeItemFromCart(step1, lineId);

    expect(step2.items).toHaveLength(0);
    expect(step2.subtotalPaise).toBe(0);
    expect(step2.totalItemQuantity).toBe(0);
  });

  it('7. Clears the cart completely', () => {
    let cart = addItemToCart(initialCart, {
      productId: 'espresso',
      productName: 'Espresso',
      unitPricePaise: 9000,
      quantity: 2,
    });
    cart = addItemToCart(cart, {
      productId: 'tub-500ml',
      productName: '500ml Party Tub',
      unitPricePaise: 45000,
      quantity: 1,
    });

    expect(cart.items).toHaveLength(2);

    const cleared = clearCart();
    expect(cleared.items).toHaveLength(0);
    expect(cleared.subtotalPaise).toBe(0);
    expect(cleared.totalItemQuantity).toBe(0);
  });

  it('8. Prevents quantities below one', () => {
    const step1 = addItemToCart(initialCart, {
      productId: 'espresso',
      productName: 'Espresso',
      unitPricePaise: 9000,
      quantity: 1,
    });

    const lineId = step1.items[0].id;
    const step2 = updateItemQuantity(step1, lineId, 0);
    expect(step2.items[0].quantity).toBe(1);

    const step3 = updateItemQuantity(step1, lineId, -5);
    expect(step3.items[0].quantity).toBe(1);
  });

  it('9. Calculates line totals properly in integer paise', () => {
    expect(calculateLineTotalPaise(12000, 3)).toBe(36000);
    expect(calculateLineTotalPaise(18000, 2)).toBe(36000);
    expect(calculateLineTotalPaise(9000, 0)).toBe(0);
    expect(calculateLineTotalPaise(0, 5)).toBe(0);
  });

  it('10. Calculates cart subtotal across diverse lines', () => {
    const items = [
      { unitPricePaise: 12000, quantity: 2 }, // 24000
      { unitPricePaise: 18000, quantity: 1 }, // 18000
      { unitPricePaise: 9000, quantity: 3 },  // 27000
    ];
    expect(calculateSubtotalPaise(items)).toBe(69000);
  });

  it('11. Formats paise as Indian Rupees with symbol and decimals', () => {
    expect(formatPaise(0)).toMatch(/₹\s?0\.00/);
    expect(formatPaise(9900)).toMatch(/₹\s?99\.00/);
    expect(formatPaise(10400)).toMatch(/₹\s?104\.00/);
    expect(formatPaise(12000)).toMatch(/₹\s?120\.00/);
    expect(formatPaise(45000)).toMatch(/₹\s?450\.00/);
  });

  it('12. Generates stable, deterministic line identity regardless of flavor selection order', () => {
    const id1 = generateCartLineId('medio-cup', {
      size: 'medio',
      flavors: [
        { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
        { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
      ],
    });

    const id2 = generateCartLineId('medio-cup', {
      size: 'medio',
      flavors: [
        { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
        { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
      ],
    });

    expect(id1).toBe(id2);
  });
});
