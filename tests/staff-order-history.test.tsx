import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { StaffPOSWorkspace } from '@/components/staff/pos/StaffPOSWorkspace';
import { clearOrderHistory, loadOrderHistory, addOrderToHistory } from '@/lib/pos/orderHistory';
import { resetSessionTokenCounter, createNewPosOrder, addItemToOrder, completeOrderPayment } from '@/lib/pos/order';

describe('Staff POS Order History Feature Tests', () => {
  beforeEach(() => {
    clearOrderHistory();
    resetSessionTokenCounter(1);
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    clearOrderHistory();
  });

  it('1. Order History button appears in header next to + New Order without count badge', () => {
    render(<StaffPOSWorkspace />);

    const newOrderBtn = screen.getByRole('button', { name: /\+ New Order/i });
    const historyBtn = screen.getByRole('button', { name: /Order History/i });

    expect(newOrderBtn).toBeInTheDocument();
    expect(historyBtn).toBeInTheDocument();
    expect(historyBtn).not.toHaveTextContent(/[0-9]/);
  });

  it('2. Completing an order stores it in permanent Order History and clears it from active queue', () => {
    render(<StaffPOSWorkspace />);

    // Add Hot Chocolate Fudge (₹149)
    fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
    fireEvent.click(screen.getByRole('article', { name: /Hot Chocolate Fudge/i }));

    // Proceed to Payment
    const cart = screen.getByLabelText('Order Cart');
    fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }));

    const payDialog = screen.getByRole('dialog');
    fireEvent.click(within(payDialog).getByRole('button', { name: /Cash/i }));
    fireEvent.click(within(payDialog).getByRole('button', { name: /Confirm Payment Received/i }));

    // Order #001 is removed from active queue since only processing orders are active
    expect(screen.queryByRole('button', { name: /Order #001/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();

    // Verify stored in permanent order history
    const stored = loadOrderHistory();
    expect(stored).toHaveLength(1);
    expect(stored[0].token).toBe('#001');
    expect(stored[0].paymentMethod).toBe('CASH');

    // Click Order History button in header to verify modal displays it
    const historyBtn = screen.getByRole('button', { name: /Order History/i });
    fireEvent.click(historyBtn);

    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
    expect(historyDialog).toBeInTheDocument();
    expect(within(historyDialog).getByText('#001')).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Hot Chocolate Fudge/i)).toBeInTheDocument();
  });

  it('3. Active queue contains exclusively Processing orders with Completed phase removed', () => {
    render(<StaffPOSWorkspace />);

    // Only Processing header appears in active orders queue
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.queryByText('Refreshes in 1m')).not.toBeInTheDocument();
  });

  it('4. Receipt Accuracy: Selecting a historical order displays full read-only receipt breakdown', () => {
    render(<StaffPOSWorkspace />);

    // Add Classic Vanilla (85ml, ₹169)
    fireEvent.click(screen.getByRole('button', { name: /Gelato/i }));
    fireEvent.click(screen.getByRole('article', { name: /Classic Vanilla/i }));

    // Proceed to Payment
    const cart = screen.getByLabelText('Order Cart');
    fireEvent.click(within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i }));

    const payDialog = screen.getByRole('dialog');
    fireEvent.click(within(payDialog).getByRole('button', { name: /Cash/i }));
    fireEvent.click(within(payDialog).getByRole('button', { name: /Confirm Payment Received/i }));

    // Open Order History
    const historyBtn = screen.getByRole('button', { name: /Order History/i });
    fireEvent.click(historyBtn);

    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
    const orderRow = within(historyDialog).getByRole('button', { name: /View receipt for order #001/i });
    fireEvent.click(orderRow);

    // Verify receipt view elements
    expect(within(historyDialog).getByText(/ORDER CONFIRMED & PAID/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText('Classic Vanilla')).toBeInTheDocument();
    expect(within(historyDialog).getByText('85ml')).toBeInTheDocument();
    expect(within(historyDialog).getAllByText('₹169').length).toBeGreaterThanOrEqual(1);
    expect(within(historyDialog).getByText(/Cash Tendered/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Change Returned/i)).toBeInTheDocument();

    // Click Back to History
    fireEvent.click(within(historyDialog).getByRole('button', { name: /Back to Order History/i }));
    expect(within(historyDialog).getByText(/Order History/i)).toBeInTheDocument();
  });

  it('5. Search & Date Filter in Order History modal filters orders correctly', () => {
    // Seed 2 orders into history
    let o1 = createNewPosOrder('#001');
    o1 = addItemToOrder(o1, { productId: 'p1', productName: 'Classic Vanilla', unitPricePaise: 16900 });
    o1 = completeOrderPayment(o1, 'CASH');
    o1.completedAt = '2026-11-08T10:00:00Z';
    addOrderToHistory(o1);

    let o2 = createNewPosOrder('#002');
    o2 = addItemToOrder(o2, { productId: 'p2', productName: 'Nutella Bliss', unitPricePaise: 24900 });
    o2 = completeOrderPayment(o2, 'UPI');
    o2.completedAt = '2026-11-08T12:00:00Z';
    addOrderToHistory(o2);

    render(<StaffPOSWorkspace />);

    // Open Order History
    const historyBtn = screen.getByRole('button', { name: /Order History/i });
    fireEvent.click(historyBtn);

    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
    expect(within(historyDialog).getByText('#001')).toBeInTheDocument();
    expect(within(historyDialog).getByText('#002')).toBeInTheDocument();

    // Search by Nutella
    const searchInput = within(historyDialog).getByLabelText(/Search orders/i);
    fireEvent.change(searchInput, { target: { value: 'Nutella' } });

    expect(within(historyDialog).queryByText('#001')).not.toBeInTheDocument();
    expect(within(historyDialog).getByText('#002')).toBeInTheDocument();

    // Clear search
    fireEvent.change(searchInput, { target: { value: '' } });
    expect(within(historyDialog).getByText('#001')).toBeInTheDocument();
    expect(within(historyDialog).getByText('#002')).toBeInTheDocument();
  });

  it('6. Duplicate Prevention: Retriggering save on same order does not duplicate historical records', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'p1', productName: 'Test Product', unitPricePaise: 10000 });
    order = completeOrderPayment(order, 'CARD');

    addOrderToHistory(order);
    addOrderToHistory(order);
    addOrderToHistory(order);

    expect(loadOrderHistory()).toHaveLength(1);
  });

  it('7. Edit Order button appears on historical receipt and opens editable order mode', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'gelato-classic-vanilla', productName: 'Classic Vanilla', unitPricePaise: 16900 });
    order = completeOrderPayment(order, 'CASH', 20000, 2255);
    addOrderToHistory(order);

    render(<StaffPOSWorkspace />);

    // Open Order History modal
    fireEvent.click(screen.getByRole('button', { name: /Order History/i }));
    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });

    // Open receipt
    fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order #001/i }));

    // Verify Edit Order button is in receipt header actions
    const editBtn = within(historyDialog).getByRole('button', { name: /Edit Order/i });
    expect(editBtn).toBeInTheDocument();

    // Click Edit Order
    fireEvent.click(editBtn);

    // Verify switched into Edit Order mode
    expect(within(historyDialog).getByText(/Editing Order #001/i)).toBeInTheDocument();
    expect(within(historyDialog).getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(within(historyDialog).getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('8. Edit Order: modifying quantity and saving updates receipt with modification audit trail', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'gelato-classic-vanilla', productName: 'Classic Vanilla', unitPricePaise: 16900 });
    order = completeOrderPayment(order, 'CASH', 20000, 2255);
    const initialPaidTotal = order.totalPaise;
    addOrderToHistory(order);

    render(<StaffPOSWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /Order History/i }));
    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
    fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order #001/i }));

    // Click Edit Order
    fireEvent.click(within(historyDialog).getByRole('button', { name: /Edit Order/i }));

    // Increase Classic Vanilla quantity from 1 to 2
    const increaseBtn = within(historyDialog).getByRole('button', { name: /Increase quantity of Classic Vanilla/i });
    fireEvent.click(increaseBtn);

    // Click Save Changes
    fireEvent.click(within(historyDialog).getByRole('button', { name: /Save Changes/i }));

    // Returned to read-only receipt view
    expect(within(historyDialog).getByText(/ORDER CONFIRMED & PAID/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Order #001 modified and saved successfully!/i)).toBeInTheDocument();

    // Modification History audit trail must be displayed
    expect(within(historyDialog).getByText(/Modification History/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Modification #1/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Payment Reconciliation/i)).toBeInTheDocument();
    expect(within(historyDialog).getByText(/Additional Amount Due/i)).toBeInTheDocument();

    // Verify stored in localStorage
    const saved = loadOrderHistory()[0];
    expect(saved.totalPaise).toBeGreaterThan(initialPaidTotal);
    expect(saved.modificationCount).toBe(1);
    expect(saved.originalPayment?.totalPaise).toBe(initialPaidTotal);
    expect(saved.originalPayment?.method).toBe('CASH');
  });

  it('9. Edit Order: canceling edit discards modifications and restores original order', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, { productId: 'gelato-classic-vanilla', productName: 'Classic Vanilla', unitPricePaise: 16900 });
    order = completeOrderPayment(order, 'UPI');
    const initialTotal = order.totalPaise;
    addOrderToHistory(order);

    render(<StaffPOSWorkspace />);

    fireEvent.click(screen.getByRole('button', { name: /Order History/i }));
    const historyDialog = screen.getByRole('dialog', { name: /Order History/i });
    fireEvent.click(within(historyDialog).getByRole('button', { name: /View receipt for order #001/i }));

    fireEvent.click(within(historyDialog).getByRole('button', { name: /Edit Order/i }));

    // Increase quantity
    fireEvent.click(within(historyDialog).getByRole('button', { name: /Increase quantity of Classic Vanilla/i }));

    // Click Cancel
    fireEvent.click(within(historyDialog).getByRole('button', { name: /Cancel/i }));

    // Discard confirmation dialog should appear
    expect(screen.getByText(/Discard Unsaved Changes\?/i)).toBeInTheDocument();

    // Confirm Discard
    fireEvent.click(screen.getByRole('button', { name: /Discard Changes/i }));

    // Restores read-only receipt with original price
    expect(within(historyDialog).getByText(/ORDER CONFIRMED & PAID/i)).toBeInTheDocument();
    expect(loadOrderHistory()[0].totalPaise).toBe(initialTotal);
    expect(loadOrderHistory()[0].modificationCount ?? 0).toBe(0);
  });
});
