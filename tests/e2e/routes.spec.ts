import { test, expect } from '@playwright/test';

test.describe('Portal Navigation & Layout Availability', () => {
  test('landing page loads and presents portal options', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Everytime Creamery/);
    await expect(page.locator('h1')).toContainText('Everytime Creamery');

    // Check Staff Portal Card
    const staffLink = page.getByRole('link', { name: /Launch Staff Portal/i });
    await expect(staffLink).toBeVisible();

    // Check Owner Portal Card
    const ownerLink = page.getByRole('link', { name: /Enter Owner Portal/i });
    await expect(ownerLink).toBeVisible();
  });

    test('staff portal renders single-screen three-panel layout without Dine-in/Parcel', async ({ page }) => {
      await page.goto('/staff');
      await expect(page).toHaveTitle(/Staff Portal/i);

      // Header elements
      await expect(page.getByText('Staff Counter Terminal')).toBeVisible();
      await expect(page.getByRole('button', { name: /\+ New Order/i })).toBeVisible();

      // Three-panel layout elements
      await expect(page.getByRole('region', { name: 'Categories Sidebar' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Direct Menu Catalog' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Order Cart Sidebar' })).toBeVisible();

      // Dine-in / Parcel is completely absent per Requirement 2
      await expect(page.getByRole('button', { name: /Dine-in/i })).not.toBeVisible();
      await expect(page.getByRole('button', { name: /Parcel/i })).not.toBeVisible();

      // Active customer orders queue
      await expect(page.getByRole('region', { name: 'Active Customer Orders Queue' })).toBeVisible();
    });

      test('main staff POS ordering journey (Phase 1.1: 24-step multi-order workflow)', async ({ page }) => {
        // 1. Open /staff
        await page.goto('/staff');
        await expect(page).toHaveTitle(/Staff Portal/i);

        // 2. Verify the single-screen three-panel layout
        const categoriesSidebar = page.getByRole('region', { name: 'Categories Sidebar' });
        const menuCatalog = page.getByRole('region', { name: 'Direct Menu Catalog' });
        const cartSidebar = page.getByRole('region', { name: 'Order Cart Sidebar' });
        const ordersQueue = page.getByRole('region', { name: 'Active Customer Orders Queue' });

        await expect(categoriesSidebar).toBeVisible();
        await expect(menuCatalog).toBeVisible();
        await expect(cartSidebar).toBeVisible();
        await expect(ordersQueue).toBeVisible();

        // 3. Verify that Dine-in / Parcel is absent
        await expect(page.getByRole('button', { name: /Dine-in/i })).not.toBeVisible();
        await expect(page.getByRole('button', { name: /Parcel/i })).not.toBeVisible();

        // 4. Create Order #001
        const newOrderBtn = page.getByRole('button', { name: /\+ New Order/i });
        await newOrderBtn.click();
        await expect(page.getByRole('status', { name: /Active Order #001/i })).toBeVisible();

        // 5. Add Classic Vanilla 85ml (Gelato category directly adds without size popup)
        const gelatoCategoryBtn = categoriesSidebar.getByRole('button', { name: 'Gelato' });
        await gelatoCategoryBtn.click();

        const classicVanillaCard = menuCatalog.getByRole('article', { name: 'Classic Vanilla' });
        await expect(classicVanillaCard).toBeVisible();
        await classicVanillaCard.click();

        // Verify NO size popup dialog in Gelato category
        await expect(page.getByText('Choose your size')).not.toBeVisible();

        // 6. Verify ₹169 and 85ml in Cart
        const cart = page.getByLabel('Order Cart');
        await expect(cart.getByText('Classic Vanilla')).toBeVisible();
        await expect(cart.getByText('85ml')).toBeVisible();
        await expect(cart.getByText('₹169').first()).toBeVisible();

        // 7. Create Order #002
        await newOrderBtn.click();
        await expect(page.getByRole('status', { name: /Active Order #002/i })).toBeVisible();
        await expect(cart.getByText('Your cart is empty')).toBeVisible();

        // 8. Add Nutella Bliss with Vanilla Scoop
        const waffleCategoryBtn = categoriesSidebar.getByRole('button', { name: 'Waffle' });
        await waffleCategoryBtn.click();

        const nutellaBlissCard = menuCatalog.getByRole('article', { name: 'Nutella Bliss' });
        await expect(nutellaBlissCard).toBeVisible();
        await nutellaBlissCard.click();

        const waffleDialog = page.getByRole('dialog');
        await expect(waffleDialog).toBeVisible();
        const vanillaScoopBtn = waffleDialog.getByRole('button', { name: /Vanilla Scoop/i });
        await vanillaScoopBtn.click();
        await expect(waffleDialog).not.toBeVisible();

        // 9. Verify ₹249
        await expect(cart.getByText('Nutella Bliss')).toBeVisible();
        await expect(cart.getByText('+ Vanilla Scoop')).toBeVisible();
        await expect(cart.getByText('₹249').first()).toBeVisible();

        // 10. Switch back to Order #001
        const order1Card = ordersQueue.getByRole('button', { name: /Order #001/i });
        await order1Card.click();
        await expect(page.getByRole('status', { name: /Active Order #001/i })).toBeVisible();

        // 11. Verify its ₹169 item is preserved
        await expect(cart.getByText('Classic Vanilla')).toBeVisible();
        await expect(cart.getByText('85ml')).toBeVisible();
        await expect(cart.getByText('₹169').first()).toBeVisible();
        await expect(cart.getByText('Nutella Bliss')).not.toBeVisible();

        // 12. Proceed to Payment for Order #001
        const moveToAwaitingBtn = cart.getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i });
        await moveToAwaitingBtn.click();

        // 13. Select Cash
        const payDialog = page.getByRole('dialog');
        await expect(payDialog).toBeVisible();
        await expect(payDialog.getByText(/Payment Preview — Order #001/i)).toBeVisible();

        const cashBtn = payDialog.getByRole('button', { name: /^Cash$/i });
        await cashBtn.click();

        // 14. Verify that selecting Cash alone does not complete the order (stays in Processing)
        await expect(payDialog).toBeVisible();
        await expect(ordersQueue.getByRole('button', { name: /Order #001 PROCESSING/i })).toBeVisible();

        // 15. Explicitly confirm payment received
        const confirmPaymentBtn = payDialog.getByRole('button', { name: /Confirm Payment Received/i });
        await confirmPaymentBtn.click();
        await expect(payDialog).not.toBeVisible();

        // 16. Verify Order #001 is finalized and removed from active queue (only Processing in queue)
        await expect(ordersQueue.getByRole('button', { name: /Order #001/i })).not.toBeVisible();
        await expect(ordersQueue.getByText('Completed')).not.toBeVisible();

        // 17. Verify Order #001 is permanently available in Order History
        const historyHeaderBtn = page.getByRole('button', { name: /Order History/i });
        await historyHeaderBtn.click();
        const historyModal = page.getByRole('dialog', { name: /Order History/i });
        await expect(historyModal).toBeVisible();
        await historyModal.getByRole('button', { name: /View receipt for order #001/i }).click();
        await expect(historyModal.getByText(/ORDER CONFIRMED & PAID/i)).toBeVisible();
        await expect(historyModal.getByText('CASH', { exact: true })).toBeVisible();
        await historyModal.getByRole('button', { name: /Close receipt view/i }).click();

        // 18. Order #002 remains intact in active Processing queue
        const order2Card = ordersQueue.getByRole('button', { name: /Order #002/i });
        await expect(order2Card).toContainText('1 item');
        await expect(order2Card).toContainText('₹261.45');

        // 18. Select Order #002
        await order2Card.click();
        await expect(page.getByRole('status', { name: /Active Order #002/i })).toBeVisible();
        await expect(cart.getByText('Nutella Bliss')).toBeVisible();
        await expect(cart.getByText('+ Vanilla Scoop')).toBeVisible();
        await expect(cart.getByText('₹249').first()).toBeVisible();

        // 19. Proceed to Payment for Order #002
        const moveToAwaitingBtn2 = cart.getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i });
        await moveToAwaitingBtn2.click();

        // 20. Select UPI
        const payDialog2 = page.getByRole('dialog');
        await expect(payDialog2).toBeVisible();
        await expect(payDialog2.getByText(/Payment Preview — Order #002/i)).toBeVisible();
        const upiBtn = payDialog2.getByRole('button', { name: /^UPI$/i });
        await upiBtn.click();

        // 21. Confirm payment received
        const confirmPaymentBtn2 = payDialog2.getByRole('button', { name: /Confirm Payment Received/i });
        await confirmPaymentBtn2.click();
        await expect(payDialog2).not.toBeVisible();

        // 22. Verify Order #002 is finalized and removed from active queue
        await expect(ordersQueue.getByRole('button', { name: /Order #002/i })).not.toBeVisible();
        await expect(ordersQueue.getByText('Completed')).not.toBeVisible();

        // 23. Active order automatically created and advances to Order #003
        await newOrderBtn.click();

        // 24. Verify it starts as a fresh Processing order
        await expect(page.getByRole('status', { name: /Active Order #003/i })).toBeVisible();
        await expect(page.getByRole('status', { name: /PROCESSING/i })).toBeVisible();
        await expect(cart.getByText('Your cart is empty')).toBeVisible();
      });

      test('owner portal renders sidebar and management sections', async ({ page }) => {
        await page.goto('/owner');
        await expect(page).toHaveTitle(/Owner Portal/i);

        // Sidebar navigation
        await expect(page.getByRole('button', { name: /Dashboard/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Sales/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Reports & Z-Report/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Menu Management/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Staff Management/i })).toBeVisible();
        await expect(page.getByRole('button', { name: /Settings/i })).toBeVisible();

        // Switching sections works
        await page.getByRole('button', { name: /Menu Management/i }).click();
        await expect(page.getByText('Menu, Flavor & Pricing Management')).toBeVisible();
      });

      test('permanent order history modal and receipt viewing workflow', async ({ page }) => {
        await page.goto('/staff');
        await expect(page).toHaveTitle(/Staff Portal/i);

        // Verify Order History button exists in header
        const historyHeaderBtn = page.getByRole('button', { name: /Order History/i });
        await expect(historyHeaderBtn).toBeVisible();

        // Add an item to create an order
        const categoriesSidebar = page.getByRole('region', { name: 'Categories Sidebar' });
        const menuCatalog = page.getByRole('region', { name: 'Direct Menu Catalog' });
        const cartSidebar = page.getByRole('region', { name: 'Order Cart Sidebar' });

        await categoriesSidebar.getByRole('button', { name: 'Gelato' }).click();
        await menuCatalog.getByRole('article', { name: 'Classic Vanilla' }).click();

        // Proceed to payment and complete with CASH
        await cartSidebar.getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }).click();
        const payDialog = page.getByRole('dialog');
        await payDialog.getByRole('button', { name: /^Cash$/i }).click();
        await payDialog.getByRole('button', { name: /Confirm Payment Received/i }).click();

        // Open Order History modal
        await historyHeaderBtn.click();
        const historyDialog = page.getByRole('dialog', { name: /Order History/i });
        await expect(historyDialog).toBeVisible();

        // Verify header summary shows total orders and total revenue
        await expect(historyDialog.getByText('Order History')).toBeVisible();
        await expect(historyDialog.getByText(/Total Revenue/i)).toBeVisible();

        // Search functionality
        const searchInput = historyDialog.getByLabel(/Search orders/i);
        await searchInput.fill('Vanilla');
        await expect(historyDialog.getByText('Classic Vanilla')).toBeVisible();

        // Click on order row to open historical read-only receipt
        await historyDialog.getByRole('button', { name: /View receipt for order/i }).first().click();
        await expect(historyDialog.getByText('ORDER CONFIRMED & PAID')).toBeVisible();
        await expect(historyDialog.getByText('Artisan Handcrafted Gelato & Desserts')).toBeVisible();
        await expect(historyDialog.getByText('Back to History')).toBeVisible();

        // Return back to history list
        await historyDialog.getByRole('button', { name: /Back to Order History/i }).click();
        await expect(historyDialog.getByText('Order History')).toBeVisible();

        // Close modal
        await historyDialog.getByRole('button', { name: /Close order history/i }).click();
        await expect(historyDialog).not.toBeVisible();
      });

      test('editing previous order from Order History with audit trail and persistence', async ({ page }) => {
        await page.goto('/staff');
        await expect(page).toHaveTitle(/Staff Portal/i);

        // 1. Create an order and pay
        const categoriesSidebar = page.getByRole('region', { name: 'Categories Sidebar' });
        const menuCatalog = page.getByRole('region', { name: 'Direct Menu Catalog' });
        const cartSidebar = page.getByRole('region', { name: 'Order Cart Sidebar' });

        await categoriesSidebar.getByRole('button', { name: 'Gelato' }).click();
        await menuCatalog.getByRole('article', { name: 'Classic Vanilla' }).click();

        await cartSidebar.getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }).click();
        const payDialog = page.getByRole('dialog');
        await payDialog.getByRole('button', { name: /^Cash$/i }).click();
        await payDialog.getByRole('button', { name: /Confirm Payment Received/i }).click();

        // 2. Open Order History
        const historyHeaderBtn = page.getByRole('button', { name: /Order History/i });
        await historyHeaderBtn.click();
        const historyDialog = page.getByRole('dialog', { name: /Order History/i });
        await expect(historyDialog).toBeVisible();

        // 3. Open receipt
        await historyDialog.getByRole('button', { name: /View receipt for order/i }).first().click();
        await expect(historyDialog.getByText('ORDER CONFIRMED & PAID')).toBeVisible();

        // 4. Click Edit Order
        const editOrderBtn = historyDialog.getByRole('button', { name: /Edit Order/i });
        await expect(editOrderBtn).toBeVisible();
        await editOrderBtn.click();

        // 5. Verify edit mode UI
        await expect(historyDialog.getByText(/Editing Order #001/i)).toBeVisible();
        await expect(historyDialog.getByRole('button', { name: /Save Changes/i })).toBeVisible();

        // 6. Increase quantity of Classic Vanilla
        const increaseBtn = historyDialog.getByRole('button', { name: /Increase quantity of Classic Vanilla/i });
        await increaseBtn.click();

        // 7. Save modifications
        await historyDialog.getByRole('button', { name: /Save Changes/i }).click();

        // 8. Verify returned to receipt view with updated details and audit trail
        await expect(historyDialog.getByText(/ORDER CONFIRMED & PAID/i)).toBeVisible();
        await expect(historyDialog.getByText(/Modification History/i)).toBeVisible();
        await expect(historyDialog.getByText(/Modification #1/i)).toBeVisible();
        await expect(historyDialog.getByText(/Payment Reconciliation/i)).toBeVisible();
        await expect(historyDialog.getByText(/Additional Amount Due/i)).toBeVisible();

        // 9. Close modal and reload page to verify persistence
        await historyDialog.getByRole('button', { name: /Close receipt view/i }).click();
        await page.reload();

        // 10. Re-open Order History after reload
        await historyHeaderBtn.click();
        await expect(historyDialog).toBeVisible();
        await historyDialog.getByRole('button', { name: /View receipt for order/i }).first().click();

        // 11. Modifications and audit trail persist
        await expect(historyDialog.getByText(/Modification History/i)).toBeVisible();
        await expect(historyDialog.getByText(/Modification #1/i)).toBeVisible();
        await expect(historyDialog.getByText(/Payment Reconciliation/i)).toBeVisible();
      });
    });
