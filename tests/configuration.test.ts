import { describe, it, expect } from 'vitest';
import { validateProductConfiguration } from '@/lib/cart/cart-utils';
import { MOCK_PRODUCTS } from '@/lib/mock-data/products';

describe('Product Configuration Validation (Phase 1)', () => {
  const piccoloProduct = MOCK_PRODUCTS.find((p) => p.id === 'piccolo-cup')!;
  const medioProduct = MOCK_PRODUCTS.find((p) => p.id === 'medio-cup')!;
  const grandeProduct = MOCK_PRODUCTS.find((p) => p.id === 'grande-cup')!;
  const espressoProduct = MOCK_PRODUCTS.find((p) => p.id === 'espresso')!;
  const affogatoProduct = MOCK_PRODUCTS.find((p) => p.id === 'affogato')!;

  it('1. Piccolo requires exactly one flavor', () => {
    const emptyConfig = { size: 'piccolo' as const, flavors: [] };
    const invalidRes = validateProductConfiguration(piccoloProduct, emptyConfig);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.requiredCount).toBe(1);

    const validConfig = {
      size: 'piccolo' as const,
      flavors: [{ id: 'pistachio-bronte', name: 'Pistachio Bronte' }],
    };
    const validRes = validateProductConfiguration(piccoloProduct, validConfig);
    expect(validRes.isValid).toBe(true);
  });

  it('2. Medio requires exactly two flavors', () => {
    const oneFlavorConfig = {
      size: 'medio' as const,
      flavors: [{ id: 'pistachio-bronte', name: 'Pistachio Bronte' }],
    };
    const invalidRes = validateProductConfiguration(medioProduct, oneFlavorConfig);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.requiredCount).toBe(2);

    const twoFlavorsConfig = {
      size: 'medio' as const,
      flavors: [
        { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
        { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
      ],
    };
    const validRes = validateProductConfiguration(medioProduct, twoFlavorsConfig);
    expect(validRes.isValid).toBe(true);
  });

  it('3. Grande requires exactly three flavors', () => {
    const twoFlavorsConfig = {
      size: 'grande' as const,
      flavors: [
        { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
        { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
      ],
    };
    const invalidRes = validateProductConfiguration(grandeProduct, twoFlavorsConfig);
    expect(invalidRes.isValid).toBe(false);
    expect(invalidRes.requiredCount).toBe(3);

    const threeFlavorsConfig = {
      size: 'grande' as const,
      flavors: [
        { id: 'pistachio-bronte', name: 'Pistachio Bronte' },
        { id: 'madagascar-vanilla', name: 'Madagascar Vanilla' },
        { id: 'alphonso-mango', name: 'Alphonso Mango Sorbet' },
      ],
    };
    const validRes = validateProductConfiguration(grandeProduct, threeFlavorsConfig);
    expect(validRes.isValid).toBe(true);
  });

  it('4. Missing flavors prevent submission', () => {
    const result = validateProductConfiguration(medioProduct, undefined);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('Please select exactly 2 flavors');
  });

  it('5. Valid configuration passes validation and can be added', () => {
    const valid = validateProductConfiguration(piccoloProduct, {
      size: 'piccolo',
      flavors: [{ id: 'alphonso-mango', name: 'Alphonso Mango Sorbet' }],
    });
    expect(valid.isValid).toBe(true);
    expect(valid.error).toBeUndefined();
  });

  it('6. Non-gelato products do not require gelato size or flavor selection', () => {
    const espressoRes = validateProductConfiguration(espressoProduct, undefined);
    expect(espressoRes.isValid).toBe(true);
    expect(espressoRes.requiredCount).toBe(0);

    const affogatoRes = validateProductConfiguration(affogatoProduct, undefined);
    expect(affogatoRes.isValid).toBe(true);
    expect(affogatoRes.requiredCount).toBe(0);
  });
});

