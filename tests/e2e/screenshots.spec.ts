import { test, expect } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/moham/.gemini/antigravity/brain/eed0bbe4-a025-40f8-a173-042b6ce47d0b';

    test.describe('Phase 1.1 Staff POS Screenshots & Visual Verification', () => {
      test('capture all required Phase 1.1 visual states', async ({ page }) => {
        // 1. Tablet landscape resolution (1280x800)
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('/staff');
        await page.waitForLoadState('networkidle');

        // Screenshot 1: Main POS single-screen layout (tablet landscape)
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'pos-single-screen-layout.png'),
          fullPage: false,
        });

        // Screenshot 2: Tablet landscape layout
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'tablet-landscape-layout.png'),
          fullPage: false,
        });

        // Screenshot 3: Left category sidebar and center menu
        const categoriesSidebar = page.getByRole('region', { name: 'Categories Sidebar' });
        await categoriesSidebar.getByRole('button', { name: 'Gelato' }).click();
        await page.waitForTimeout(300);

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'sidebar-and-center-menu.png'),
          fullPage: false,
        });

        // Add items to Order #001: Classic Vanilla 85ml (Gelato category directly adds without size modal)
        const menuCatalog = page.getByRole('region', { name: 'Direct Menu Catalog' });
        await menuCatalog.getByRole('article', { name: 'Classic Vanilla' }).click();
        await expect(page.getByText('Choose your size')).not.toBeVisible();

        // Create Order #002: Customer 2 arrives
        const newOrderBtn = page.getByRole('button', { name: /New Order/i });
        await newOrderBtn.click();
        await page.waitForTimeout(200);

        // Add Nutella Bliss with Vanilla Scoop to Order #002
        await categoriesSidebar.getByRole('button', { name: 'Waffle' }).click();
        await menuCatalog.getByRole('article', { name: 'Nutella Bliss' }).click();
        const waffleModal = page.getByRole('dialog');
        await expect(waffleModal).toBeVisible();
        await waffleModal.getByRole('button', { name: /Vanilla Scoop/i }).click();
        await expect(page.getByText('Add a scoop?')).not.toBeVisible();

        // Screenshot 4: Multiple orders in Processing (#001 and #002 in Processing section)
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'multiple-orders-processing.png'),
          fullPage: false,
        });

        // Screenshot 5: Order switching without losing items (Switch to #001)
        const ordersQueue = page.getByRole('region', { name: 'Active Customer Orders Queue' });
        await ordersQueue.getByRole('button', { name: /Order #001/i }).click();
        await page.waitForTimeout(300);

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'order-switching-preserved.png'),
          fullPage: false,
        });

        // Proceed to Payment for Order #001
        const cart = page.getByLabel('Order Cart');
        await cart.getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }).click();

        // Screenshot 6: Payment selection for a specific order (Cash selection with change preview)
        const payDialog = page.getByRole('dialog');
        await expect(payDialog).toBeVisible();
        await payDialog.getByRole('button', { name: /^Cash$/i }).click();
        await page.waitForTimeout(300);

        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'payment-selection-order.png'),
          fullPage: false,
        });

        // Close dialog temporarily to view 2-section Queue (Processing & Completed with 1m auto-refresh)
        await payDialog.getByRole('button', { name: /Cancel/i }).click();
        await expect(page.getByText(/Payment Preview/i)).not.toBeVisible();

        // Screenshot 7: Two-phase Order Queue (Processing & Completed with auto-refresh indicator)
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'order-awaiting-payment.png'),
          fullPage: false,
        });

        // Reopen payment for Order #001 and explicitly complete payment
        await cart.getByRole('button', { name: /PROCEED TO PAYMENT/i }).click();
        const payDialogAgain = page.getByRole('dialog');
        await expect(payDialogAgain).toBeVisible();
        await payDialogAgain.getByRole('button', { name: /^Cash$/i }).click();
        await payDialogAgain.getByRole('button', { name: /Confirm Payment Received/i }).click();
        await expect(page.getByText(/Payment Preview/i)).not.toBeVisible();

        // View Order #001 receipt via Order History
        const historyBtn = page.getByRole('button', { name: /Order History/i });
        await historyBtn.click();
        const historyDialog = page.getByRole('dialog', { name: /Order History/i });
        await historyDialog.getByRole('button', { name: /View receipt for order #001/i }).click();

        // Screenshot 8: Completed order (Read-only view, green status, token displayed)
        await page.screenshot({
          path: path.join(ARTIFACT_DIR, 'completed-order-read-only.png'),
          fullPage: false,
        });
      });
    });
