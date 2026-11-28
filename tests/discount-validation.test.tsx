import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

const mockGetUser = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockRpc = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      return {};
    }),
    rpc: mockRpc,
  })),
}));

import { submitOrderAction } from '@/app/actions/orders';
import { DiscountDialog } from '@/components/staff/pos/DiscountDialog';
import { PaymentPreviewDialog } from '@/components/staff/pos/PaymentPreviewDialog';
import {
  createNewPosOrder,
  addItemToOrder,
  applyOrderDiscount,
  completeOrderPayment,
} from '@/lib/pos/order';

describe('100% Discount & Complimentary Order Restriction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'staff-1' } },
      error: null,
    });
    mockProfileMaybeSingle.mockResolvedValue({
      data: {
        id: 'staff-1',
        store_id: 'store-1',
        role: 'staff',
        full_name: 'Cashier',
        is_active: true,
      },
      error: null,
    });
  });

  it('1. submitOrderAction rejects 100% discount, >100% discount, and zero-total orders before RPC', async () => {
    const baseOrder = {
      id: 'ord-disc-100',
      token: 'T1-001',
      subtotalPaise: 9900,
      discountPaise: 9900,
      taxPreviewPaise: 0,
      totalPaise: 0,
      discount: { type: 'custom', percent: 100 },
      items: [
        {
          lineId: 'l1',
          productId: 'gelato-madagascar-vanilla',
          productName: 'Madagascar Vanilla',
          unitPricePaise: 9900,
          quantity: 1,
          lineTotalPaise: 9900,
        },
      ],
    } as any;

    const res100 = await submitOrderAction({ order: baseOrder, method: 'CASH' });
    expect(res100.success).toBe(false);
    expect(res100.error).toMatch(/100% discounts|not currently supported/i);
    expect(mockRpc).not.toHaveBeenCalled();

    const resOver = await submitOrderAction({
      order: { ...baseOrder, discount: { type: 'custom', percent: 120 } },
      method: 'CASH',
    });
    expect(resOver.success).toBe(false);
    expect(resOver.error).toMatch(/less than 100%/i);
    expect(mockRpc).not.toHaveBeenCalled();

    // Even if percent is 99.99% but totalPaise rounds to 0 -> rejected cleanly
    const resZeroTotal = await submitOrderAction({
      order: {
        ...baseOrder,
        discount: { type: 'custom', percent: 99.99 },
        totalPaise: 0,
      },
      method: 'CASH',
    });
    expect(resZeroTotal.success).toBe(false);
    expect(resZeroTotal.error).toMatch(/greater than ₹0|Complimentary orders/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('2. submitOrderAction allows 0% and 99% boundary discounts when totalPaise > 0', async () => {
    mockRpc.mockResolvedValue({ data: { order_id: 'ord-ok', total_paise: 104 }, error: null });

    const res99 = await submitOrderAction({
      order: {
        id: 'ord-99',
        token: 'T1-002',
        subtotalPaise: 9900,
        discountPaise: 9801,
        taxPreviewPaise: 5,
        totalPaise: 104,
        discount: { type: 'custom', percent: 99 },
        items: [
          {
            lineId: 'l1',
            productId: 'gelato-madagascar-vanilla',
            productName: 'Madagascar Vanilla',
            unitPricePaise: 9900,
            quantity: 1,
            lineTotalPaise: 9900,
          },
        ],
      } as any,
      method: 'CASH',
    });

    expect(res99.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_pos_checkout',
      expect.objectContaining({ p_discount_percent: 99 })
    );
  });

  it('3. Domain order helpers reject 100% discounts and ₹0 orders without converting free orders to paid', () => {
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, {
      productId: 'gelato-madagascar-vanilla',
      productName: 'Madagascar Vanilla',
      unitPricePaise: 9900,
      quantity: 1,
    });

    expect(() => applyOrderDiscount(order, { type: 'custom', percent: 100 })).toThrow(
      /100% discounts|less than 100%/i
    );
    expect(() => applyOrderDiscount(order, { type: 'custom', percent: 99.996 })).toThrow(
      /less than 100%/i
    );

    const valid99 = applyOrderDiscount(order, { type: 'custom', percent: 99 });
    expect(valid99.totalPaise).toBeGreaterThan(0);

    const tamperedZero = { ...order, totalPaise: 0 };
    expect(() => completeOrderPayment(tamperedZero, 'CASH')).toThrow(
      /Complimentary.*not supported/i
    );
  });

  it('4. DiscountDialog rejects 100% with clear message and allows 99%', () => {
    const onApplyDiscount = vi.fn();
    const onClose = vi.fn();

    render(
      <DiscountDialog
        isOpen={true}
        currentDiscount={{ type: 'none', percent: 0 }}
        onClose={onClose}
        onApplyDiscount={onApplyDiscount}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Custom %/i }));
    const input = screen.getByLabelText(/Enter Percentage/i);

    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Discount/i }));

    expect(screen.getByText(/100% discounts.*not currently enabled/i)).toBeInTheDocument();
    expect(onApplyDiscount).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply Discount/i }));

    expect(onApplyDiscount).toHaveBeenCalledWith({ type: 'custom', percent: 99 });
    expect(onClose).toHaveBeenCalled();
  });

  it('5. PaymentPreviewDialog blocks ₹0 orders and disables Confirm Payment Received', () => {
    const onConfirmPayment = vi.fn();
    let order = createNewPosOrder('#001');
    order = addItemToOrder(order, {
      productId: 'gelato-madagascar-vanilla',
      productName: 'Madagascar Vanilla',
      unitPricePaise: 9900,
      quantity: 1,
    });
    const zeroOrder = { ...order, totalPaise: 0, totalPayablePaise: 0 };

    render(
      <PaymentPreviewDialog
        isOpen={true}
        order={zeroOrder}
        onClose={vi.fn()}
        onConfirmPayment={onConfirmPayment}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/Complimentary \(₹0\) orders/i);
    const confirmBtn = screen.getByRole('button', { name: /Confirm Payment Received/i });
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(onConfirmPayment).not.toHaveBeenCalled();
  });
});
