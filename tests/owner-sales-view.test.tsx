import React, { act } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { OwnerSalesView } from '@/components/owner/sales/OwnerSalesView';
import * as ordersApi from '@/lib/supabase/orders';

// Mock Supabase channel
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('Owner Sales View (Date-Range Filtering & Immutability)', () => {
  const mockOrdersData = {
    orders: [
      {
        id: 'ord-1',
        token_terminal: 'T1',
        token_seq: 3,
        client_completed_at: '2026-11-22T06:46:12.227Z',
        subtotal_paise: 65800,
        discount_paise: 0,
        tax_paise: 3290,
        total_paise: 69090,
        status: 'COMPLETED',
        order_items: [
          {
            id: 'item-1',
            product_name: 'Vanilla Tub 500ml',
            quantity: 1,
            unit_price_paise: 65800,
            total_price_paise: 65800,
          },
        ],
        payments: [{ method: 'upi', amount_paise: 69090 }],
      },
      {
        id: 'ord-2',
        token_terminal: 'T1',
        token_seq: 4,
        client_completed_at: '2026-11-22T06:46:24.070Z',
        subtotal_paise: 37500,
        discount_paise: 0,
        tax_paise: 1875,
        total_paise: 39375,
        status: 'COMPLETED',
        order_items: [
          {
            id: 'item-2',
            product_name: 'Classic Vanilla Cup',
            quantity: 1,
            unit_price_paise: 37500,
            total_price_paise: 37500,
          },
        ],
        payments: [{ method: 'cash', amount_paise: 39375 }],
      },
    ],
    grossPaise: 108465,
    cashPaise: 39375,
    upiPaise: 69090,
    cardPaise: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(ordersApi, 'fetchSalesLedger').mockResolvedValue(mockOrdersData);
  });

  it('1. Renders segmented pill control with Today selected by default', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    expect(screen.getByRole('tab', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Yesterday' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'This Week' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'This Month' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'All Time' })).toBeInTheDocument();

    const todayTab = screen.getByRole('tab', { name: 'Today' });
    expect(todayTab).toHaveAttribute('aria-selected', 'true');
    expect(todayTab.className).toContain('bg-[#C43C1E]');
  });

  it('2. Renders summary line with order count, formatted paise gross, and range label', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    await waitFor(() => {
      expect(screen.getByText(/Showing 2 orders • ₹1,084.65 gross • Today/i)).toBeInTheDocument();
    });
  });

  it('3. Payment tender cards display amounts matching visible orders', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    await waitFor(() => {
      expect(screen.getAllByText('₹393.75').length).toBeGreaterThanOrEqual(1); // Cash
      expect(screen.getAllByText('₹690.90').length).toBeGreaterThanOrEqual(1); // UPI
      expect(screen.getAllByText('₹0').length).toBeGreaterThanOrEqual(1);      // Card
    });
  });

  it('4. Table contains finalized orders with single "View receipt" action (no edit or delete icons)', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    await waitFor(() => {
      expect(screen.getByText('T1-003')).toBeInTheDocument();
      expect(screen.getByText('T1-004')).toBeInTheDocument();
    });

    // Check actions
    const receiptButtons = screen.getAllByRole('button', { name: /View receipt/i });
    expect(receiptButtons.length).toBe(2);

    // Assert that edit (pencil) and delete (trash) buttons are NOT present in the table
    expect(screen.queryByTitle('Edit Order')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Delete Order')).not.toBeInTheDocument();
  });

  it('5. Clicking "View receipt" opens the official read-only receipt modal', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    await waitFor(() => {
      expect(screen.getByText('T1-003')).toBeInTheDocument();
    });

    const viewReceiptBtn = screen.getByRole('button', { name: /View receipt for order 3/i });
    await act(async () => {
      fireEvent.click(viewReceiptBtn);
    });

    // Modal opens
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Receipt Order T1-003/i })).toBeInTheDocument();
      expect(screen.getByText('Official Receipt Preview (Read-Only)')).toBeInTheDocument();
    });
  });

  it('6. Selecting "Custom" reveals date inputs and Apply button', async () => {
    await act(async () => {
      render(<OwnerSalesView />);
    });

    const customTab = screen.getByRole('tab', { name: 'Custom' });
    await act(async () => {
      fireEvent.click(customTab);
    });

    expect(screen.getByLabelText(/From:/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/To:/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply/i })).toBeInTheDocument();
  });

  it('7. Displays real empty state when no finalized orders exist in range', async () => {
    vi.spyOn(ordersApi, 'fetchSalesLedger').mockResolvedValueOnce({
      orders: [],
      grossPaise: 0,
      cashPaise: 0,
      upiPaise: 0,
      cardPaise: 0,
    });

    await act(async () => {
      render(<OwnerSalesView />);
    });

    await waitFor(() => {
      expect(screen.getByText('No finalized orders in this range')).toBeInTheDocument();
    });
  });
});
