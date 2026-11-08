import { describe, it, expect } from 'vitest';
import { BRAND_COLORS, APP_CONFIG, ROUTES, OWNER_NAV_ITEMS } from '@/lib/constants';

describe('System Constants & Brand Configuration', () => {
  it('strictly adheres to the approved 5 brand colors', () => {
    expect(BRAND_COLORS.cream).toBe('#F9F7DC');
    expect(BRAND_COLORS.white).toBe('#FFFFFF');
    expect(BRAND_COLORS.primaryRed).toBe('#C43C1E');
    expect(BRAND_COLORS.darkText).toBe('#222222');
    expect(BRAND_COLORS.mutedText).toBe('#777777');
  });

  it('defines application root routes', () => {
    expect(ROUTES.home).toBe('/');
    expect(ROUTES.staff).toBe('/staff');
    expect(ROUTES.owner).toBe('/owner');
  });

  it('provides all 6 required owner portal navigation modules', () => {
    const itemIds = OWNER_NAV_ITEMS.map((item) => item.id);
    expect(itemIds).toContain('dashboard');
    expect(itemIds).toContain('sales');
    expect(itemIds).toContain('reports');
    expect(itemIds).toContain('menu');
    expect(itemIds).toContain('staff-management');
    expect(itemIds).toContain('settings');
  });

  it('verifies application metadata', () => {
    expect(APP_CONFIG.name).toBe('Everytime Creamery');
    expect(APP_CONFIG.currentPhase).toMatch(/Phase (0|1)/);
  });
});

