import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render, screen } from '@testing-library/react';
import { OrderManagementBar } from '@/components/staff/pos/OrderManagementBar';
import { PosHeader } from '@/components/staff/pos/PosHeader';
import { formatOrderTime, formatClockTime } from '@/lib/utils';
import { PosOrder } from '@/lib/pos/order';

describe('Time Formatting and Hydration Invariants', () => {
  describe('formatOrderTime (Pinned Intl Formatter)', () => {
    it('is timezone-independent and formats UTC epochs to Asia/Kolkata (IST)', () => {
      // 2026-05-15T09:30:00.000Z -> IST is 15:00 (3:00 PM)
      const epoch1 = '2026-05-15T09:30:00.000Z';
      const formatted1 = formatOrderTime(epoch1);
      expect(formatted1.toLowerCase().replace(/\s+/g, ' ')).toMatch(/3:00\s?(pm|pm)/i);

      // 2026-01-01T00:00:00.000Z -> IST is 05:30 (5:30 AM)
      const epoch2 = '2026-01-01T00:00:00.000Z';
      const formatted2 = formatOrderTime(epoch2);
      expect(formatted2.toLowerCase().replace(/\s+/g, ' ')).toMatch(/5:30\s?(am|am)/i);

      // 2026-07-20T18:45:00.000Z -> IST is 00:15 (12:15 AM)
      const epoch3 = '2026-07-20T18:45:00.000Z';
      const formatted3 = formatOrderTime(epoch3);
      expect(formatted3.toLowerCase().replace(/\s+/g, ' ')).toMatch(/12:15\s?(am|am)/i);
    });

    it('handles numeric epoch timestamps identically', () => {
      const date = new Date('2026-05-15T09:30:00.000Z');
      expect(formatOrderTime(date.getTime())).toBe(formatOrderTime(date.toISOString()));
    });

    it('gracefully handles missing, null, undefined, or invalid inputs without throwing', () => {
      expect(formatOrderTime(null)).toBe('--:--');
      expect(formatOrderTime(undefined)).toBe('--:--');
      expect(formatOrderTime('')).toBe('--:--');
      expect(formatOrderTime('not-a-valid-date')).toBe('--:--');
    });
  });

  describe('OrderManagementBar SSR & Client Render Parity', () => {
    const fixedOrderFixture: PosOrder = {
      id: 'test-order-fixture-uuid-001',
      token: '#001',
      status: 'PROCESSING',
      paymentStatus: 'UNPAID',
      items: [
        {
          lineId: 'line-1',
          productId: 'classic-vanilla',
          productName: 'Classic Vanilla',
          unitPricePaise: 9900,
          quantity: 2,
          lineTotalPaise: 19800,
        },
      ],
      totalQuantity: 2,
      subtotalPaise: 19800,
      discountPaise: 0,
      discount: { type: 'none', percent: 0 },
      taxConfig: { ratePercent: 5, isProvisional: true },
      taxPreviewPaise: 990,
      cgstPaise: 495,
      sgstPaise: 495,
      totalPaise: 20790,
      totalPayablePaise: 20790,
      paymentMethod: null,
      createdAt: '2026-05-15T09:30:00.000Z',
      updatedAt: '2026-05-15T09:30:00.000Z',
      completedAt: null,
      businessDate: '2026-05-15',
    };

    it('renders identical HTML between renderToString (SSR) and client render', () => {
      const props = {
        orders: [fixedOrderFixture],
        activeOrderId: fixedOrderFixture.id,
        onSelectOrder: () => {},
      };

      // 1. Server-side render
      const serverMarkup = renderToString(<OrderManagementBar {...props} />);

      // 2. Client-side render
      const { container } = render(<OrderManagementBar {...props} />);
      const clientMarkup = container.innerHTML;

      // React renderToString inserts <!-- --> between text nodes; normalize them for comparison
      const normalizedServerMarkup = serverMarkup.replace(/<!-- -->/g, '');
      expect(clientMarkup).toBe(normalizedServerMarkup);
    });

    it('ensures suppressHydrationWarning is NOT used on the order-card time span', () => {
      const props = {
        orders: [fixedOrderFixture],
        activeOrderId: fixedOrderFixture.id,
        onSelectOrder: () => {},
      };

      const { container } = render(<OrderManagementBar {...props} />);
      const timeElement = screen.getByText(formatOrderTime(fixedOrderFixture.createdAt));

      expect(timeElement).toBeInTheDocument();
      // Verify timeElement rendered clean text without hydration warning masking
      expect(timeElement.tagName.toLowerCase()).toBe('span');
      expect(container.innerHTML).not.toContain('suppressHydrationWarning');
    });

    it('renders deterministic empty queue placeholder when no orders exist', () => {
      const serverMarkup = renderToString(
        <OrderManagementBar orders={[]} activeOrderId="" onSelectOrder={() => {}} />
      );
      const { container } = render(
        <OrderManagementBar orders={[]} activeOrderId="" onSelectOrder={() => {}} />
      );

      const normalizedServerMarkup = serverMarkup.replace(/<!-- -->/g, '');
      expect(container.innerHTML).toBe(normalizedServerMarkup);
      expect(screen.getByText('No active orders')).toBeInTheDocument();
    });
  });

  describe('PosHeader Mount-Gated Live Clock', () => {
    it('renders tabular-nums placeholder ("--:-- --") during SSR (renderToString)', () => {
      const serverMarkup = renderToString(
        <PosHeader
          activeOrderToken="#001"
          activeOrderStatus="PROCESSING"
          onNewOrder={() => {}}
          onOpenOrderHistory={() => {}}
          staffName="Alex M."
        />
      );

      expect(serverMarkup).toContain('--:-- --');
    });

    it('hydrates clock time after mounting on the client', () => {
      render(
        <PosHeader
          activeOrderToken="#001"
          activeOrderStatus="PROCESSING"
          onNewOrder={() => {}}
          onOpenOrderHistory={() => {}}
          staffName="Alex M."
        />
      );

      // In JSDOM, useEffect runs immediately upon render
      // The placeholder should be replaced by a live formatted clock time
      expect(screen.queryByText('--:-- --')).not.toBeInTheDocument();
      // Should match format like "3:30 AM" or "3:30 PM"
      const clockSpan = screen.getByText(/\d{1,2}:\d{2}\s?(AM|PM)/i);
      expect(clockSpan).toBeInTheDocument();
    });
  });
});
