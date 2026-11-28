import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StaffPOS } from '@/components/staff/StaffPOS';
import { resetSessionTokenCounter } from '@/lib/pos/order';

  describe('Staff POS Component Interaction Tests (Phase 1 & 1.1)', () => {
    beforeEach(() => {
      resetSessionTokenCounter(1);
    });

    it('1. Category switching changes the displayed products and updates selected category state', () => {
      render(<StaffPOS />);

      // Default category is Frequent
      const frequentBtn = screen.getByRole('button', { name: /Frequent/i });
      expect(frequentBtn).toHaveAttribute('aria-pressed', 'true');

      // Switch to Gelato category
      const gelatoBtn = screen.getByRole('button', { name: /Gelato/i });
      fireEvent.click(gelatoBtn);

      expect(gelatoBtn).toHaveAttribute('aria-pressed', 'true');
      expect(frequentBtn).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByText('Classic Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Hazel Nutella')).toBeInTheDocument();

      // Switch to Sundaes
      const sundaesBtn = screen.getByRole('button', { name: /Sundaes/i });
      fireEvent.click(sundaesBtn);
      expect(screen.getByText('Hot Chocolate Fudge')).toBeInTheDocument();
      expect(screen.queryByText('Classic Vanilla')).not.toBeInTheDocument();

      // Switch to Extra
      const extraBtn = screen.getByRole('button', { name: /Extra/i });
      fireEvent.click(extraBtn);
      expect(screen.getByText('Toppings')).toBeInTheDocument();
      expect(screen.getByText('Wafer Cone')).toBeInTheDocument();
      expect(screen.getByText('Water Bottle')).toBeInTheDocument();
    });

    it('2. Product search filters items by name and clear search restores items', () => {
      render(<StaffPOS />);

      // Switch to Gelato
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));
      expect(screen.getByText('Classic Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Mango Sorbet')).toBeInTheDocument();

      // Type "mango" into search
      const searchInput = screen.getByRole('textbox', { name: /Search menu products/i });
      fireEvent.change(searchInput, { target: { value: 'mango' } });

      expect(screen.getByText('Mango Sorbet')).toBeInTheDocument();
      expect(screen.queryByText('Classic Vanilla')).not.toBeInTheDocument();

      // Clear search
      const clearBtn = screen.getByRole('button', { name: /Clear search/i });
      fireEvent.click(clearBtn);

      expect(screen.getByText('Classic Vanilla')).toBeInTheDocument();
      expect(screen.getByText('Mango Sorbet')).toBeInTheDocument();
    });

    it('3. Selecting a direct add product adds it directly to the cart', () => {
      render(<StaffPOS />);

      // Switch to Sundaes
      fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));

      const sundaeCard = screen.getByRole('article', { name: /Hot Chocolate Fudge/i });
      fireEvent.click(sundaeCard);

      // Should immediately appear in the cart
      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Hot Chocolate Fudge')).toBeInTheDocument();
      expect(within(cart).getAllByText('₹149').length).toBeGreaterThanOrEqual(1);
    });

    it('4. Gelato items are strictly single 85ml cups and add directly without size dialog popup', () => {
      render(<StaffPOS />);

      // Switch to Gelato
      fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));

      // Click Classic Vanilla
      const vanillaCard = screen.getByRole('article', { name: /Classic Vanilla/i });
      fireEvent.click(vanillaCard);

      // Verify NO size dialog opened (strictly single 85ml size for Gelato)
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

      // Verify item added directly to cart with 85ml variant
      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Classic Vanilla')).toBeInTheDocument();
      expect(within(cart).getByText('85ml')).toBeInTheDocument();
      expect(within(cart).getAllByText('₹169').length).toBeGreaterThanOrEqual(1);
    });

    it('4b. Takeaway Tubs items open size selector dialog for 250ml and 500ml options', () => {
      render(<StaffPOS />);

      // Switch to Takeaway Tubs
      fireEvent.click(screen.getByRole('button', { name: /Takeaway Tubs/i }));

      // Click Classic Vanilla tub
      const vanillaTubCard = screen.getByRole('article', { name: /Classic Vanilla/i });
      fireEvent.click(vanillaTubCard);

      // Verify size dialog opened with 250ml/500ml options
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Classic Vanilla')).toBeInTheDocument();
      expect(within(dialog).getByText('Choose your size')).toBeInTheDocument();

      // Choose 250ml (₹169)
      const btn250 = within(dialog).getByRole('button', { name: /250ml/i });
      fireEvent.click(btn250);

      // Dialog closed and item in cart with 250ml variant
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Classic Vanilla')).toBeInTheDocument();
      expect(within(cart).getByText('250ml')).toBeInTheDocument();
      expect(within(cart).getAllByText('₹169').length).toBeGreaterThanOrEqual(1);
    });

    it('5. Waffle scoop selector opens, allows adding vanilla scoop (+₹60), and calculates ₹249', () => {
      render(<StaffPOS />);

      // Switch to Waffle
      fireEvent.click(screen.getByRole('button', { name: /Waffle/i }));

      // Click Nutella Bliss (base ₹189)
      const waffleCard = screen.getByRole('article', { name: /Nutella Bliss/i });
      fireEvent.click(waffleCard);

      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Nutella Bliss')).toBeInTheDocument();
      expect(within(dialog).getByText('Add a scoop?')).toBeInTheDocument();

      // Select Vanilla Scoop
      const vanillaScoopBtn = within(dialog).getByRole('button', { name: /Vanilla Scoop/i });
      fireEvent.click(vanillaScoopBtn);

      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Nutella Bliss')).toBeInTheDocument();
      expect(within(cart).getByText('+ Vanilla Scoop')).toBeInTheDocument();
      expect(within(cart).getAllByText('₹249').length).toBeGreaterThanOrEqual(1);
    });

    it('6. Quantity stepper controls (plus/minus) adjust item quantity and remove at zero', () => {
      render(<StaffPOS />);

      // Switch to Extra and add Wafer Cone
      fireEvent.click(screen.getByRole('button', { name: /Extra/i }));
      const coneCard = screen.getByRole('article', { name: /Wafer Cone/i });
      fireEvent.click(coneCard);

      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Wafer Cone')).toBeInTheDocument();

      // Increase quantity to 2
      const plusBtn = within(cart).getByRole('button', { name: /Increase quantity of Wafer Cone/i });
      fireEvent.click(plusBtn);
      expect(within(cart).getByRole('listitem', { name: /2x Wafer Cone/i })).toBeInTheDocument();

      // Decrease quantity to 1
      const minusBtn = within(cart).getByRole('button', { name: /Decrease quantity of Wafer Cone/i });
      fireEvent.click(minusBtn);
      expect(within(cart).getByRole('listitem', { name: /1x Wafer Cone/i })).toBeInTheDocument();

      // Decrease quantity at 1 removes the item
      fireEvent.click(minusBtn);
      expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();
    });

    it('7. Direct remove item button removes item from cart', () => {
      render(<StaffPOS />);

      fireEvent.click(screen.getByRole('button', { name: /Extra/i }));
      fireEvent.click(screen.getByRole('article', { name: /Water Bottle/i }));

      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Water Bottle')).toBeInTheDocument();

      const removeBtn = within(cart).getByRole('button', { name: /Remove Water Bottle from cart/i });
      fireEvent.click(removeBtn);

      expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();
    });

    it('8. Clear Cart confirmation requires confirmation before clearing', () => {
      render(<StaffPOS />);

      fireEvent.click(screen.getByRole('button', { name: /Extra/i }));
      fireEvent.click(screen.getByRole('article', { name: /Toppings/i }));

      const cart = screen.getByLabelText('Order Cart');
      expect(within(cart).getByText('Toppings')).toBeInTheDocument();

      // Click CLEAR CART button in summary
      const clearCartBtn = within(cart).getByRole('button', { name: 'CLEAR CART' });
      fireEvent.click(clearCartBtn);

      // Confirmation dialog appears
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText('Clear Order Cart?')).toBeInTheDocument();

      // Cancel preserves cart
      fireEvent.click(within(dialog).getByRole('button', { name: /Cancel/i }));
      expect(within(cart).getByText('Toppings')).toBeInTheDocument();

      // Open again and confirm
      fireEvent.click(clearCartBtn);
      const dialog2 = screen.getByRole('dialog');
      fireEvent.click(within(dialog2).getByRole('button', { name: 'Clear Cart' }));

      expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();
    });

      it('9. Verifies Dine-in and Parcel selector is completely removed from Staff POS (Phase 1.1)', () => {
        render(<StaffPOS />);

        // Dine-in and Parcel buttons must be absent
        expect(screen.queryByRole('button', { name: /Dine-in/i })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Parcel/i })).not.toBeInTheDocument();
        expect(screen.queryByText(/Service: Dine-in/i)).not.toBeInTheDocument();
        expect(screen.queryByText(/Service: Parcel/i)).not.toBeInTheDocument();
      });

      it('10. Discount selection applies 10% discount and updates totals', () => {
        render(<StaffPOS />);

        // Add Kitkat Thickshake (₹199)
        fireEvent.click(screen.getByRole('button', { name: /Thickshakes/i }));
        fireEvent.click(screen.getByRole('article', { name: /Kitkat/i }));

        const cart = screen.getByLabelText('Order Cart');

        // Click Discount trigger
        const discountBtn = within(cart).getByRole('button', { name: /Discount/i });
        fireEvent.click(discountBtn);

        const dialog = screen.getByRole('dialog');
        expect(within(dialog).getByText('Apply Order Discount')).toBeInTheDocument();

        // Choose 10% Discount
        fireEvent.click(within(dialog).getByRole('button', { name: /10% Discount/i }));
        fireEvent.click(within(dialog).getByRole('button', { name: /Apply Discount/i }));

        // Verify discount applied
        expect(within(cart).getByText(/Discount \(10% applied\)/i)).toBeInTheDocument();
      });

        it('11. Payment preview displays breakdown, method selection, and complete order completes order (Phase 1.1)', () => {
          render(<StaffPOS />);

          // Add Oreo Sundae (₹149)
          fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
          fireEvent.click(screen.getByRole('article', { name: /Oreo Cookie Monster/i }));

          const cart = screen.getByLabelText('Order Cart');

          // Click PROCEED TO PAYMENT
          const continueBtn = within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i });
          fireEvent.click(continueBtn);

          // Payment dialog appears
          const payDialog = screen.getByRole('dialog');
          expect(within(payDialog).getByText(/Payment Preview/i)).toBeInTheDocument();
          expect(within(payDialog).getByText(/Prototype Simulation/i)).toBeInTheDocument();

          // Select Cash method
          const cashBtn = within(payDialog).getByRole('button', { name: /Cash/i });
          fireEvent.click(cashBtn);

          // Complete order via explicit payment confirmation
          const completeBtn = within(payDialog).getByRole('button', { name: /Confirm Payment Received|Complete Order/i });
          fireEvent.click(completeBtn);

          // Payment dialog closes
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

          // Automatically advances to a brand new order for the next customer
          expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();
          expect(screen.getAllByText(/#002/).length).toBeGreaterThanOrEqual(1);

          // Order #001 is finalized and saved to permanent Order History (active queue has only Processing)
          expect(screen.queryByRole('button', { name: /Order #001 COMPLETED/i })).not.toBeInTheDocument();
          expect(screen.queryByText('Completed')).not.toBeInTheDocument();

          // Open Order History to view Order #001 receipt (local unconfirmed since unauthenticated in JSDOM)
          fireEvent.click(screen.getByRole('button', { name: /Order History/i }));
          const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
          fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order #001/i }));
          expect(within(historyDialog).getByText(/NOT YET CONFIRMED IN DATABASE|SAVED LOCALLY/i)).toBeInTheDocument();
          expect(within(historyDialog).getByText(/Oreo Cookie Monster/i)).toBeInTheDocument();
        });

        it('12. Multiple orders: + New Order creates independent orders and prevents empty duplicates', () => {
          render(<StaffPOS />);

          // Initial order is #001 (empty)
          expect(screen.getAllByText(/#001/).length).toBeGreaterThanOrEqual(1);
          const newOrderBtn = screen.getByRole('button', { name: /\+ New Order/i });

          // Clicking New Order on empty order does not duplicate empty orders
          fireEvent.click(newOrderBtn);
          expect(screen.queryByText(/#002/)).not.toBeInTheDocument();

          // Add item to Order #001: Classic Vanilla 85ml (₹169, direct add)
          fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));
          fireEvent.click(screen.getByRole('article', { name: /Classic Vanilla/i }));

          const cart = screen.getByLabelText('Order Cart');
          expect(within(cart).getByText('Classic Vanilla')).toBeInTheDocument();

          // Now click + New Order: Customer 2 arrives!
          fireEvent.click(newOrderBtn);

          // Order #002 is created and active
          expect(screen.getAllByText(/#002/).length).toBeGreaterThanOrEqual(1);
          expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();

          // Add Nutella Bliss with Vanilla Scoop to Order #002 (₹249)
          fireEvent.click(screen.getByRole('button', { name: /Waffle/i }));
          fireEvent.click(screen.getByRole('article', { name: /Nutella Bliss/i }));
          fireEvent.click(screen.getByRole('button', { name: /Vanilla Scoop/i }));

          expect(within(cart).getByText('Nutella Bliss')).toBeInTheDocument();
          expect(within(cart).getAllByText('₹249').length).toBeGreaterThanOrEqual(1);

          // Switch back to Order #001
          const order1Card = screen.getByRole('button', { name: /Order #001/i });
          fireEvent.click(order1Card);

          // Verify Order #001 still has its original item preserved
          expect(within(cart).getByText('Classic Vanilla')).toBeInTheDocument();
          expect(within(cart).queryByText('Nutella Bliss')).not.toBeInTheDocument();

          // Switch back to Order #002
          const order2Card = screen.getByRole('button', { name: /Order #002/i });
          fireEvent.click(order2Card);

          // Verify Order #002 is unchanged
          expect(within(cart).getByText('Nutella Bliss')).toBeInTheDocument();
          expect(within(cart).queryByText('Classic Vanilla')).not.toBeInTheDocument();
        });

        it('13. Order status lifecycle and per-order payment isolation', () => {
          render(<StaffPOS />);

          // Order #001: Add Classic Vanilla (85ml direct add)
          fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));
          fireEvent.click(screen.getByRole('article', { name: /Classic Vanilla/i }));

          const cart = screen.getByLabelText('Order Cart');
          const newOrderBtn = screen.getByRole('button', { name: /\+ New Order/i });

          // Create Order #002: Add Nutella Bliss
          fireEvent.click(newOrderBtn);
          fireEvent.click(screen.getByRole('button', { name: /Waffle/i }));
          fireEvent.click(screen.getByRole('article', { name: /Nutella Bliss/i }));
          fireEvent.click(screen.getByRole('button', { name: /Vanilla Scoop/i }));

          // Switch to Order #001 and open Payment Preview
          fireEvent.click(screen.getByRole('button', { name: /Order #001/i }));
          fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }));

          const dialog = screen.getByRole('dialog');
          expect(within(dialog).getByText(/Payment Preview — Order #001/i)).toBeInTheDocument();

          // Select Cash method for Order #001
          fireEvent.click(within(dialog).getByRole('button', { name: /Cash/i }));

          // Selecting Cash alone DOES NOT complete the order
          expect(screen.getByRole('dialog')).toBeInTheDocument();

          // Confirm Payment
          fireEvent.click(within(dialog).getByRole('button', { name: /Confirm Payment Received/i }));
          expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

          // Order #001 is finalized to history; Order #002 is active in Processing queue
          expect(screen.queryByText('Completed')).not.toBeInTheDocument();

          // Switch to Order #002 and verify it is untouched and still UNPAID
          fireEvent.click(screen.getByRole('button', { name: /Order #002/i }));
          expect(within(cart).getByText('Nutella Bliss')).toBeInTheDocument();
          expect(within(cart).queryByText(/ORDER CONFIRMED & PAID/i)).not.toBeInTheDocument();

          // Open payment for Order #002 and pay with UPI
          fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }));
          const dialog2 = screen.getByRole('dialog');
          fireEvent.click(within(dialog2).getByRole('button', { name: /UPI/i }));
          fireEvent.click(within(dialog2).getByRole('button', { name: /Confirm Payment Received/i }));

          // Order #002 is completed and saved to history as well
          expect(screen.queryByText('Completed')).not.toBeInTheDocument();
          expect(within(cart).getByText('Your cart is empty')).toBeInTheDocument();
        });

        it('15. Order queue has only Processing section (Completed and Awaiting Payment removed)', () => {
          render(<StaffPOS />);

          // Processing section must be present
          expect(screen.getByText('Processing')).toBeInTheDocument();

          // Completed and Awaiting Payment sections must be absent
          expect(screen.queryByText('Completed')).not.toBeInTheDocument();
          expect(screen.queryByText('Awaiting Payment')).not.toBeInTheDocument();
          expect(screen.queryByText('None awaiting')).not.toBeInTheDocument();
          expect(screen.queryByText(/Refreshes in 1m/i)).not.toBeInTheDocument();
        });
      });
