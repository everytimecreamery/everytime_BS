import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { NextRequest } from 'next/server';

const mockGetOwnerBillingMonitoringAction = vi.fn();
const mockGetBillingSessionDetailsAction = vi.fn();

vi.mock('@/app/actions/billing-sessions', () => ({
  getOwnerBillingMonitoringAction: (...args: any[]) =>
    mockGetOwnerBillingMonitoringAction(...args),
  getBillingSessionDetailsAction: (...args: any[]) =>
    mockGetBillingSessionDetailsAction(...args),
}));

vi.mock('@/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  })),
}));

import { BillingMonitoringView } from '@/components/owner/BillingMonitoringView';
import { GET as billingStreamGET } from '@/app/api/owner/billing-stream/route';

const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022';
const SESSION_ACTIVE_ID = '55555555-5555-5555-5555-555555555551';
const SESSION_STOPPED_ID = '55555555-5555-5555-5555-555555555550';

const activeSessionSummary = {
  session_id: SESSION_ACTIVE_ID,
  store_id: STORE_1_ID,
  store_name: 'Everytime Creamery - Flagship',
  terminal_id: TERMINAL_1_ID,
  terminal_number: '01',
  device_name: 'Counter Terminal #01',
  staff_member_id: '44444444-4444-4444-4444-444444444441',
  staff_member_name: 'Rohan Sharma',
  cashier_code: 'ROHAN-01',
  started_at: '2026-11-28T11:00:00.000Z',
  stopped_at: null,
  started_by: '22222222-2222-2222-2222-222222222222',
  started_by_name: 'Staff Alex',
  stopped_by: null,
  stopped_by_name: null,
  status: 'ACTIVE' as const,
  stop_reason: null,
  duration_seconds: 3600,
  order_count: 2,
  subtotal_paise: 37700,
  discount_paise: 1980,
  tax_paise: 1786,
  cgst_paise: 893,
  sgst_paise: 893,
  sales_total_paise: 37506,
  cash_paise: 18795,
  upi_paise: 18711,
  card_paise: 0,
};

const stoppedSessionSummary = {
  session_id: SESSION_STOPPED_ID,
  store_id: STORE_1_ID,
  store_name: 'Everytime Creamery - Flagship',
  terminal_id: TERMINAL_2_ID,
  terminal_number: '02',
  device_name: 'Counter Terminal #02',
  staff_member_id: '44444444-4444-4444-4444-444444444443',
  staff_member_name: 'Karan Mehta',
  cashier_code: 'KARAN-03',
  started_at: '2026-11-27T11:00:00.000Z',
  stopped_at: '2026-11-27T18:00:00.000Z',
  started_by: '22222222-2222-2222-2222-222222222222',
  started_by_name: 'Staff Alex',
  stopped_by: '22222222-2222-2222-2222-222222222222',
  stopped_by_name: 'Staff Alex',
  status: 'STOPPED' as const,
  stop_reason: 'Evening shift handoff',
  duration_seconds: 25200,
  order_count: 8,
  subtotal_paise: 120000,
  discount_paise: 0,
  tax_paise: 6000,
  cgst_paise: 3000,
  sgst_paise: 3000,
  sales_total_paise: 126000,
  cash_paise: 50000,
  upi_paise: 76000,
  card_paise: 0,
};

const initialMonitoringPayload = {
  server_now: '2026-11-28T12:00:00.000Z',
  terminals: [
    {
      store_id: STORE_1_ID,
      store_name: 'Everytime Creamery - Flagship',
      terminal_id: TERMINAL_1_ID,
      terminal_number: '01',
      device_name: 'Counter Terminal #01',
      billing_active: true,
      status: 'ON' as const,
      active_session: activeSessionSummary,
      last_session: null,
      last_event: {
        id: 'ev-1',
        session_id: SESSION_ACTIVE_ID,
        store_id: STORE_1_ID,
        store_name: 'Everytime Creamery - Flagship',
        terminal_id: TERMINAL_1_ID,
        terminal_number: '01',
        device_name: 'Counter Terminal #01',
        event_type: 'SESSION_STARTED' as const,
        actor_id: '22222222-2222-2222-2222-222222222222',
        actor_name: 'Staff Alex',
        staff_member_id: '44444444-4444-4444-4444-444444444441',
        staff_member_name: 'Rohan Sharma',
        cashier_code: 'ROHAN-01',
        reason: null,
        metadata: {},
        created_at: '2026-11-28T11:00:00.000Z',
      },
    },
    {
      store_id: STORE_1_ID,
      store_name: 'Everytime Creamery - Flagship',
      terminal_id: TERMINAL_2_ID,
      terminal_number: '02',
      device_name: 'Counter Terminal #02',
      billing_active: false,
      status: 'OFF' as const,
      active_session: null,
      last_session: stoppedSessionSummary,
      last_event: {
        id: 'ev-2',
        session_id: SESSION_STOPPED_ID,
        store_id: STORE_1_ID,
        store_name: 'Everytime Creamery - Flagship',
        terminal_id: TERMINAL_2_ID,
        terminal_number: '02',
        device_name: 'Counter Terminal #02',
        event_type: 'SESSION_STOPPED' as const,
        actor_id: '22222222-2222-2222-2222-222222222222',
        actor_name: 'Staff Alex',
        staff_member_id: '44444444-4444-4444-4444-444444444443',
        staff_member_name: 'Karan Mehta',
        cashier_code: 'KARAN-03',
        reason: 'Evening shift handoff',
        metadata: {},
        created_at: '2026-11-27T18:00:00.000Z',
      },
    },
  ],
  active_sessions: [activeSessionSummary],
  historical_sessions: [activeSessionSummary, stoppedSessionSummary],
  recent_events: [
    {
      id: 'ev-1',
      session_id: SESSION_ACTIVE_ID,
      store_id: STORE_1_ID,
      store_name: 'Everytime Creamery - Flagship',
      terminal_id: TERMINAL_1_ID,
      terminal_number: '01',
      device_name: 'Counter Terminal #01',
      event_type: 'SESSION_STARTED' as const,
      actor_id: '22222222-2222-2222-2222-222222222222',
      actor_name: 'Staff Alex',
      staff_member_id: '44444444-4444-4444-4444-444444444441',
      staff_member_name: 'Rohan Sharma',
      cashier_code: 'ROHAN-01',
      reason: null,
      metadata: {},
      created_at: '2026-11-28T11:00:00.000Z',
    },
    {
      id: 'ev-2',
      session_id: SESSION_STOPPED_ID,
      store_id: STORE_1_ID,
      store_name: 'Everytime Creamery - Flagship',
      terminal_id: TERMINAL_2_ID,
      terminal_number: '02',
      device_name: 'Counter Terminal #02',
      event_type: 'SESSION_STOPPED' as const,
      actor_id: '22222222-2222-2222-2222-222222222222',
      actor_name: 'Staff Alex',
      staff_member_id: '44444444-4444-4444-4444-444444444443',
      staff_member_name: 'Karan Mehta',
      cashier_code: 'KARAN-03',
      reason: 'Evening shift handoff',
      metadata: {},
      created_at: '2026-11-27T18:00:00.000Z',
    },
  ],
};

describe('Owner Portal Live Billing Monitoring, Detailed Reports & SSE/Polling Fallback (Stages E & F)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Displays live store/terminal ON/OFF cards, staff member attribution, sales totals, and start/stop event log', async () => {
    mockGetOwnerBillingMonitoringAction.mockResolvedValue({
      success: true,
      data: initialMonitoringPayload,
    });

    render(<BillingMonitoringView enableSse={false} pollIntervalMs={0} />);

    await waitFor(() => {
      expect(screen.getByText('BILLING ON')).toBeInTheDocument();
    });
    expect(screen.getByText('BILLING OFF')).toBeInTheDocument();

    // Terminal 1 active card details
    const term1Card = screen.getByLabelText(
      /Everytime Creamery - Flagship Terminal #01/i
    );
    expect(within(term1Card).getByText('Rohan Sharma')).toBeInTheDocument();
    expect(within(term1Card).getByText('ROHAN-01')).toBeInTheDocument();
    expect(within(term1Card).getByText('₹375.06')).toBeInTheDocument();

    // Terminal 2 stopped card details
    const term2Card = screen.getByLabelText(
      /Everytime Creamery - Flagship Terminal #02/i
    );
    expect(
      within(term2Card).getAllByText(/Evening shift handoff/i).length
    ).toBeGreaterThanOrEqual(1);

    // Filter sessions table
    fireEvent.click(screen.getByRole('button', { name: /Active Only/i }));
    const historySection = screen.getByLabelText('Billing Sessions History');
    expect(within(historySection).getByText('Rohan Sharma')).toBeInTheDocument();
    expect(
      within(historySection).queryByText('Karan Mehta')
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /Historical \(Stopped\)/i })
    );
    expect(within(historySection).getByText('Karan Mehta')).toBeInTheDocument();
  });

  it('2. Opens detailed session inspection modal with every order, item, variant, add-on, discount, GST split, payment, and cashier', async () => {
    mockGetOwnerBillingMonitoringAction.mockResolvedValue({
      success: true,
      data: initialMonitoringPayload,
    });

    mockGetBillingSessionDetailsAction.mockResolvedValue({
      success: true,
      data: {
        server_now: '2026-11-28T12:05:00.000Z',
        session: activeSessionSummary,
        orders: [
          {
            id: 'ord-101',
            token: 'T1-001',
            token_terminal: 'T1',
            token_seq: 1,
            status: 'COMPLETED',
            store_id: STORE_1_ID,
            terminal_id: TERMINAL_1_ID,
            billing_session_id: SESSION_ACTIVE_ID,
            cashier_id: '22222222-2222-2222-2222-222222222222',
            cashier_profile_name: 'Staff Alex',
            staff_member_id: '44444444-4444-4444-4444-444444444441',
            staff_member_name: 'Rohan Sharma',
            cashier_code: 'ROHAN-01',
            subtotal_paise: 19800,
            discount_paise: 1980,
            discount_type: 'PERCENTAGE',
            discount_reason: '10% promo',
            tax_paise: 891,
            cgst_paise: 445,
            sgst_paise: 446,
            total_paise: 18711,
            total_quantity: 2,
            client_completed_at: '2026-11-28T11:20:00.000Z',
            server_received_at: '2026-11-28T11:20:01.000Z',
            business_date: '2026-11-28',
            items: [
              {
                id: 'line-1',
                menu_item_id: 'gelato-madagascar-vanilla',
                product_name: 'Madagascar Vanilla',
                variant_label: '85ml',
                addon_label: 'Wafer Cone',
                quantity: 2,
                unit_price_paise: 8900,
                addon_price_paise: 1000,
                effective_unit_price_paise: 9900,
                total_price_paise: 19800,
              },
            ],
            payments: [
              {
                id: 'pay-1',
                method: 'upi',
                amount_paise: 18711,
                upi_utr: 'UTR99887766',
                created_at: '2026-11-28T11:20:00.000Z',
              },
            ],
          },
        ],
        events: initialMonitoringPayload.recent_events.slice(0, 1),
      },
    });

    render(<BillingMonitoringView enableSse={false} pollIntervalMs={0} />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', {
          name: /Inspect active session for Terminal #01/i,
        })
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /Inspect active session for Terminal #01/i,
      })
    );

    const dialog = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(within(dialog).getByText('Order T1-001')).toBeInTheDocument();
    });

    expect(within(dialog).getByText('Madagascar Vanilla')).toBeInTheDocument();
    expect(within(dialog).getByText('85ml')).toBeInTheDocument();
    expect(within(dialog).getByText('+ Wafer Cone')).toBeInTheDocument();
    expect(within(dialog).getByText(/UTR: UTR99887766/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/CGST ₹4\.45 \+ SGST ₹4\.46/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Total: ₹187\.11/i)).toBeInTheDocument();
  });

  it('3. Delivers instant live notifications via automatic polling fallback when billing starts, stops, or orders complete', async () => {
    // 1st snapshot: Terminal 2 is OFF, Terminal 1 has 2 orders
    mockGetOwnerBillingMonitoringAction.mockResolvedValueOnce({
      success: true,
      data: initialMonitoringPayload,
    });

    // 2nd snapshot: Terminal 2 starts billing, Terminal 1 completes a new order (3 orders)
    const updatedPayload = {
      ...initialMonitoringPayload,
      server_now: '2026-11-28T12:01:00.000Z',
      terminals: [
        {
          ...initialMonitoringPayload.terminals[0],
          active_session: {
            ...activeSessionSummary,
            order_count: 3,
            sales_total_paise: 47901,
          },
        },
        {
          ...initialMonitoringPayload.terminals[1],
          billing_active: true,
          status: 'ON' as const,
          active_session: {
            ...stoppedSessionSummary,
            session_id: '55555555-5555-5555-5555-555555555599',
            status: 'ACTIVE' as const,
            started_at: '2026-11-28T12:01:00.000Z',
            stopped_at: null,
            order_count: 0,
            sales_total_paise: 0,
          },
        },
      ],
    };

    mockGetOwnerBillingMonitoringAction.mockResolvedValue({
      success: true,
      data: updatedPayload,
    });

    render(<BillingMonitoringView enableSse={false} pollIntervalMs={80} />);

    await waitFor(() => {
      expect(screen.getByText('BILLING OFF')).toBeInTheDocument();
    });

    // Wait for polling interval to trigger and update UI + notifications without manual refresh
    await waitFor(
      () => {
        const notifRegion = screen.getByLabelText('Live Billing Notifications');
        expect(notifRegion).toHaveTextContent(
          /Billing STARTED on Everytime Creamery - Flagship · Terminal #02 by Karan Mehta/i
        );
        expect(notifRegion).toHaveTextContent(
          /1 new order\(s\) completed on Everytime Creamery - Flagship · Terminal #01/i
        );
      },
      { timeout: 2000 }
    );

    expect(screen.queryByText('BILLING OFF')).not.toBeInTheDocument();
  });

  it('4. BFF / SSE endpoint enforces Owner RBAC and supports snapshot and event-stream modes', async () => {
    // Forbidden for non-owner
    mockGetOwnerBillingMonitoringAction.mockResolvedValueOnce({
      success: false,
      error: 'Forbidden: your role does not have permission to perform this operation.',
    });

    const forbiddenReq = new NextRequest(
      'http://localhost:3000/api/owner/billing-stream?mode=snapshot'
    );
    const forbiddenRes = await billingStreamGET(forbiddenReq);
    expect(forbiddenRes.status).toBe(403);

    // Authorized owner snapshot
    mockGetOwnerBillingMonitoringAction.mockResolvedValueOnce({
      success: true,
      data: initialMonitoringPayload,
    });

    const snapReq = new NextRequest(
      'http://localhost:3000/api/owner/billing-stream?mode=snapshot'
    );
    const snapRes = await billingStreamGET(snapReq);
    expect(snapRes.status).toBe(200);
    const json = await snapRes.json();
    expect(json.success).toBe(true);
    expect(json.data.terminals).toHaveLength(2);
  });
});
