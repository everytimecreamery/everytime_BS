import { describe, it, expect } from 'vitest';
import {
  createInitialPOSCart,
  addItemToPOSCart,
  updatePOSItemQuantity,
  removePOSItem,
  clearPOSCart,
  setPOSServiceType,
  setPOSDiscount,
  generatePOSCartLineId,
} from '@/lib/pos/cart';

describe('Staff POS Cart Operations Unit Tests (Phase 1)', () => {
  const initialCart = createInitialPOSCart();

  it('1. Adds a simple product to an empty cart', () => {
    const updated = addItemToPOSCart(initialCart, {
      productId: 'extra-water-bottle',
      productName: 'Water Bottle',
      unitPricePaise: 600, // ₹6
      quantity: 1,
    });

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0].productName).toBe('Water Bottle');
    expect(updated.items[0].quantity).toBe(1);
    expect(updated.items[0].unitPricePaise).toBe(600);
    expect(updated.items[0].lineTotalPaise).toBe(600);
    expect(updated.subtotalPaise).toBe(600);
    expect(updated.totalQuantity).toBe(1);
  });

  it('2. Increases quantity when adding identical product and variant', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantId: '250ml',
      variantLabel: '250ml',
      unitPricePaise: 16900, // ₹169
      quantity: 1,
    });

    const step2 = addItemToPOSCart(step1, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantId: '250ml',
      variantLabel: '250ml',
      unitPricePaise: 16900,
      quantity: 1,
    });

    expect(step2.items).toHaveLength(1);
    expect(step2.items[0].quantity).toBe(2);
    expect(step2.items[0].lineTotalPaise).toBe(33800); // 2x ₹169 = ₹338
    expect(step2.subtotalPaise).toBe(33800);
    expect(step2.totalQuantity).toBe(2);
  });

  it('3. Keeps different size variants of the same product as separate lines', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantId: '250ml',
      variantLabel: '250ml',
      unitPricePaise: 16900, // ₹169
      quantity: 1,
    });

    const step2 = addItemToPOSCart(step1, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantId: '500ml',
      variantLabel: '500ml',
      unitPricePaise: 32900, // ₹329
      quantity: 1,
    });

    expect(step2.items).toHaveLength(2);
    expect(step2.items[0].variantId).toBe('250ml');
    expect(step2.items[1].variantId).toBe('500ml');
    expect(step2.subtotalPaise).toBe(16900 + 32900); // ₹498.00 (49800 paise)
    expect(step2.totalQuantity).toBe(2);
  });

  it('4. Keeps different add-ons of the same waffle product as separate lines', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'waffle-nutella-bliss',
      productName: 'Nutella Bliss',
      addOnId: 'scoop-none',
      addOnLabel: 'No Scoop',
      unitPricePaise: 18900, // ₹189
      quantity: 1,
    });

    const step2 = addItemToPOSCart(step1, {
      productId: 'waffle-nutella-bliss',
      productName: 'Nutella Bliss',
      addOnId: 'scoop-vanilla',
      addOnLabel: 'Vanilla Scoop',
      unitPricePaise: 24900, // ₹189 + ₹60 = ₹249
      quantity: 1,
    });

    expect(step2.items).toHaveLength(2);
    expect(step2.items[0].unitPricePaise).toBe(18900);
    expect(step2.items[1].unitPricePaise).toBe(24900);
    expect(step2.subtotalPaise).toBe(18900 + 24900); // 43800 paise
  });

  it('5. Updates item quantity via updatePOSItemQuantity', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'gelato-classic-vanilla',
      productName: 'Classic Vanilla',
      variantId: '250ml',
      unitPricePaise: 16900,
      quantity: 1,
    });

    const lineId = step1.items[0].lineId;
    const step2 = updatePOSItemQuantity(step1, lineId, 3);

    expect(step2.items[0].quantity).toBe(3);
    expect(step2.items[0].lineTotalPaise).toBe(50700); // 3x ₹169 = ₹507
    expect(step2.subtotalPaise).toBe(50700);
  });

  it('6. Decreasing quantity to 0 removes the item automatically', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'extra-toppings',
      productName: 'Toppings',
      unitPricePaise: 1500,
      quantity: 1,
    });

    const lineId = step1.items[0].lineId;
    const step2 = updatePOSItemQuantity(step1, lineId, 0);

    expect(step2.items).toHaveLength(0);
    expect(step2.subtotalPaise).toBe(0);
    expect(step2.totalQuantity).toBe(0);
  });

  it('7. Removes a line item explicitly via removePOSItem', () => {
    const step1 = addItemToPOSCart(initialCart, {
      productId: 'sundae-hot-chocolate-fudge',
      productName: 'Hot Chocolate Fudge',
      unitPricePaise: 14900,
      quantity: 1,
    });

    const lineId = step1.items[0].lineId;
    const step2 = removePOSItem(step1, lineId);

    expect(step2.items).toHaveLength(0);
    expect(step2.subtotalPaise).toBe(0);
  });

  it('8. Clears the cart completely while preserving serviceType', () => {
    let cart = setPOSServiceType(initialCart, 'parcel');
    cart = addItemToPOSCart(cart, {
      productId: 'thickshake-kitkat',
      productName: 'Kitkat Thickshake',
      unitPricePaise: 19900,
      quantity: 2,
    });

    expect(cart.items).toHaveLength(1);
    expect(cart.serviceType).toBe('parcel');

    const cleared = clearPOSCart(cart);
    expect(cleared.items).toHaveLength(0);
    expect(cleared.subtotalPaise).toBe(0);
    expect(cleared.serviceType).toBe('parcel'); // preserved
  });

  it('9. Updates service type correctly', () => {
    const cart = setPOSServiceType(initialCart, 'parcel');
    expect(cart.serviceType).toBe('parcel');
    const dineInCart = setPOSServiceType(cart, 'dine_in');
    expect(dineInCart.serviceType).toBe('dine_in');
  });

  it('10. Applies discount and recalculates totals correctly', () => {
    let cart = addItemToPOSCart(initialCart, {
      productId: 'thickshake-kitkat',
      productName: 'Kitkat Thickshake',
      unitPricePaise: 20000, // ₹200
      quantity: 1,
    });

    // Apply 10% discount
    cart = setPOSDiscount(cart, { type: 'percent_10', percent: 10 });

    expect(cart.subtotalPaise).toBe(20000);
    expect(cart.discountPaise).toBe(2000); // ₹20
    expect(cart.discountedSubtotalPaise).toBe(18000); // ₹180
    // 5% tax preview on 18000 = 900 paise (₹9)
    expect(cart.taxPreviewPaise).toBe(900);
    expect(cart.totalPayablePaise).toBe(18900); // ₹189
  });

  it('11. Generates stable line ID deterministic across calls', () => {
    const idA = generatePOSCartLineId('waffle-nutella-bliss', undefined, 'scoop-vanilla');
    const idB = generatePOSCartLineId('waffle-nutella-bliss', undefined, 'scoop-vanilla');
    expect(idA).toBe(idB);

    const idDiff = generatePOSCartLineId('waffle-nutella-bliss', undefined, 'scoop-chocolate');
    expect(idA).not.toBe(idDiff);
  });
});

