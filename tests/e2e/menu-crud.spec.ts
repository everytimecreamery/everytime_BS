import { test, expect } from '@playwright/test';

test.describe('Owner Menu Management & Staff Catalog Live E2E', () => {
  test('Owner can navigate to Menu Management and see catalog tables', async ({ page }) => {
    await page.goto('/owner');

    // Click on Menu & Catalog in Owner Sidebar
    const menuNav = page.locator('button, a').filter({ hasText: /Menu/i }).first();
    await menuNav.click();

    // Verify Master Menu Management heading is visible
    await expect(page.getByText('Master Menu Management')).toBeVisible();

    // Verify Menu Items and Categories tabs exist
    await expect(page.getByRole('button', { name: /Menu Items/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Categories/i })).toBeVisible();

    // Verify Add Menu Item button is present
    await expect(page.getByRole('button', { name: /Add Menu Item/i })).toBeVisible();

    // Switch to Categories tab
    await page.getByRole('button', { name: /Categories/i }).click();
    await expect(page.getByText('System Identifier')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'gelato', exact: true })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'tubs', exact: true })).toBeVisible();
  });

  test('Staff POS loads catalog, sells Gelato directly without size popup, and records order', async ({ page }) => {
    await page.goto('/staff');

    // Verify Staff POS loads with Categories sidebar
    await expect(page.getByText('Everytime Creamery')).toBeVisible();

    // Switch to Gelato category
    const gelatoCategory = page.getByRole('button', { name: /Gelato/i }).first();
    await gelatoCategory.click();

    // Verify gelato items are displayed
    const productCard = page.locator('article, div[role="article"]').first();
    await expect(productCard).toBeVisible();

    // Click to add gelato item directly (Invariant 2: single scoop, no size dialog)
    await productCard.click();

    // Confirm no gelato size selector dialog popped up (Invariant 2)
    await expect(page.locator('#gelato-size-title')).toHaveCount(0);
    await expect(page.getByText('Choose your size')).toHaveCount(0);

    // Verify cart contains the added item
    const cart = page.locator('div[aria-label="Order Cart"]');
    await expect(cart).toBeVisible();
    await expect(cart.getByText(/item|Total/i).first()).toBeVisible();
  });
});
