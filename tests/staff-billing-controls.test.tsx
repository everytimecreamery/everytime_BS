import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const mockGetCurrentBillingSessionAction = vi.fn();
const mockStartBillingSessionAction = vi.fn();
const mockStopBillingSessionAction = vi.fn();
const mockPushOrderToDatabase = vi.fn();

vi.mock('@/lib/supabase/client', () => {
  const mockChannel = {
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn().mockReturnThis(),
  };
  return {
    supabase: {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'mocked in test' },
            }),
          }),
        }),
      })),
      channel: vi.fn(() => mockChannel),
      removeChannel: vi.fn(),
    },
  };
});

vi.mock('@/app/actions/billing-sessions', () => ({
  getCurrentBillingSessionAction: (...args: any[]) =>
    mockGetCurrentBillingSessionAction(...args),
  startBillingSessionAction: (...args: any[]) =>
    mockStartBillingSessionAction(...args),
  stopBillingSessionAction: (...args: any[]) =>
    mockStopBillingSessionAction(...args),
}));

vi.mock('@/lib/supabase/orders', async () => {
  const actual = await vi.importActual<typeof import('@/lib/supabase/orders')>(
    '@/lib/supabase/orders'
  );
  return {
    ...actual,
    pushOrderToDatabase: (...args: any[]) => mockPushOrderToDatabase(...args),
  };
});

import { StaffPOSWorkspace } from '@/components/staff/pos/StaffPOSWorkspace';
import { resetSessionTokenCounter } from '@/lib/pos/order';
import { clearOrderHistory } from '@/lib/pos/orderHistory';

const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
const SESSION_1_ID = '55555555-5555-5555-5555-555555555551';
const SESSION_2_ID = '55555555-5555-5555-5555-555555555552';
const EMP_ROHAN_ID = '44444444-4444-4444-4444-444444444441';
const EMP_KARAN_ID = '44444444-4444-4444-4444-444444444443';

const baseOffSnapshot = {
  server_now: '2026-11-28T11:00:00.000Z',
  store: { id: STORE_1_ID, name: 'Everytime Creamery - Flagship' },
  terminal: {
    id: TERMINAL_1_ID,
    store_id: STORE_1_ID,
    terminal_number: '01',
    device_name: 'Counter Terminal #01',
  },
  actor: {
    id: '22222222-2222-2222-2222-222222222222',
    full_name: 'Staff Alex',
    role: 'staff' as const,
    cashier_code: 'ALEX-01',
  },
  active: false,
  active_session: null,
  previous_session: {
    session_id: '55555555-5555-5555-5555-555555555550',
    store_id: STORE_1_ID,
    terminal_id: TERMINAL_1_ID,
    staff_member_id: EMP_ROHAN_ID,
    staff_member_name: 'Rohan Sharma',
    cashier_code: 'ROHAN-01',
    started_at: '2026-11-27T11:00:00.000Z',
    stopped_at: '2026-11-27T20:30:00.000Z',
    started_by: '22222222-2222-2222-2222-222222222222',
    started_by_name: 'Staff Alex',
    stopped_by: '22222222-2222-2222-2222-222222222222',
    stopped_by_name: 'Staff Alex',
    stop_reason: 'Night shift close',
    status: 'STOPPED' as const,
    order_count: 14,
    sales_total_paise: 425000,
  },
  active_cashiers: [
    {
      id: EMP_ROHAN_ID,
      full_name: 'Rohan Sharma',
      cashier_code: 'ROHAN-01',
      store_id: STORE_1_ID,
      is_active: true,
    },
    {
      id: EMP_KARAN_ID,
      full_name: 'Karan Mehta',
      cashier_code: 'KARAN-03',
      store_id: STORE_1_ID,
      is_active: true,
    },
  ],
};

describe('Staff Portal Manual Billing Session Controls (Stage D)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    clearOrderHistory();
    resetSessionTokenCounter(1);
  });

  it('1. Displays BILLING OFF state, previous session info, employee selector, and blocks checkout when OFF', async () => {
    mockGetCurrentBillingSessionAction.mockResolvedValue({
      success: true,
      data: baseOffSnapshot,
    });

    render(<StaffPOSWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('BILLING OFF')).toBeInTheDocument();
    });

    expect(
      screen.getByText(/Billing is currently stopped/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Previous billing session summary')
    ).toHaveTextContent(/14 orders/i);
    expect(
      screen.getByLabelText('Previous billing session summary')
    ).toHaveTextContent(/Night shift close/i);

    const startBtn = screen.getByRole('button', { name: /START BILLING/i });
    expect(startBtn).toBeInTheDocument();

    // Add an item to cart and attempt to click Proceed to Payment while Billing is OFF
    fireEvent.click(screen.getByRole('button', { name: /Sundaes/i }));
    fireEvent.click(
      screen.getByRole('article', { name: /Hot Chocolate Fudge/i })
    );

    const cart = screen.getByLabelText('Order Cart');
    fireEvent.click(
      within(cart).getByRole('button', { name: /PROCEED TO PAYMENT|CONTINUE/i })
    );

    // Payment preview modal must NOT open; error alert is shown
    expect(
      screen.queryByRole('dialog', { name: /Payment Preview/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Billing is currently stopped\. Click START BILLING before proceeding to payment\./i
      )
    ).toBeInTheDocument();
  });

  it('2. Waits for authoritative server confirmation before transitioning from OFF to ON and prevents duplicate clicks', async () => {
    mockGetCurrentBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: baseOffSnapshot,
    });

    let resolveStart!: (val: any) => void;
    const pendingStartPromise = new Promise((res) => {
      resolveStart = res;
    });
    mockStartBillingSessionAction.mockReturnValueOnce(pendingStartPromise);

    render(<StaffPOSWorkspace />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /START BILLING/i })
      ).toBeInTheDocument();
    });

    // Change sticky employee selection to Karan Mehta
    const empSelect = screen.getByLabelText('Selected Employee');
    fireEvent.change(empSelect, { target: { value: EMP_KARAN_ID } });
    expect(localStorage.getItem('sticky_pos_cashier_v1')).toBe(EMP_KARAN_ID);

    // Click START BILLING
    const startBtn = screen.getByRole('button', { name: /START BILLING/i });
    fireEvent.click(startBtn);

    // Before server responds: still shows BILLING OFF and disabled STARTING... button (no optimistic success!)
    expect(screen.getByText('BILLING OFF')).toBeInTheDocument();
    expect(screen.getByText('STARTING...')).toBeInTheDocument();
    expect(startBtn).toBeDisabled();

    // Resolve server start action and subsequent refresh
    const activeSnapshot = {
      ...baseOffSnapshot,
      active: true,
      active_session: {
        session_id: SESSION_1_ID,
        store_id: STORE_1_ID,
        terminal_id: TERMINAL_1_ID,
        staff_member_id: EMP_KARAN_ID,
        staff_member_name: 'Karan Mehta',
        cashier_code: 'KARAN-03',
        started_at: new Date().toISOString(),
        started_by: '22222222-2222-2222-2222-222222222222',
        started_by_name: 'Staff Alex',
        status: 'ACTIVE' as const,
        order_count: 0,
        sales_total_paise: 0,
      },
    };
    mockGetCurrentBillingSessionAction.mockResolvedValue({
      success: true,
      data: activeSnapshot,
    });

    resolveStart({
      success: true,
      data: activeSnapshot.active_session,
    });

    await waitFor(() => {
      expect(screen.getByText('BILLING ON')).toBeInTheDocument();
    });

    expect(
      screen.getByRole('button', { name: /STOP BILLING/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Billing session started and confirmed by server/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Current session duration')).toHaveTextContent(
      /Duration:/i
    );
    expect(mockStartBillingSessionAction).toHaveBeenCalledTimes(1);
    expect(mockStartBillingSessionAction).toHaveBeenCalledWith({
      storeId: STORE_1_ID,
      terminalId: TERMINAL_1_ID,
      staffMemberId: EMP_KARAN_ID,
    });
  });

  it('3. Displays error and stays OFF when startBillingSessionAction fails', async () => {
    mockGetCurrentBillingSessionAction.mockResolvedValue({
      success: true,
      data: baseOffSnapshot,
    });
    mockStartBillingSessionAction.mockResolvedValueOnce({
      success: false,
      error: 'Conflict: Terminal already has an active billing session.',
    });

    render(<StaffPOSWorkspace />);

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /START BILLING/i })
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /START BILLING/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /Conflict: Terminal already has an active billing session/i
        )
      ).toBeInTheDocument();
    });
    expect(screen.getByText('BILLING OFF')).toBeInTheDocument();
  });

  it('4. Stops billing with optional reason and restarts billing as a new session', async () => {
    const activeSnapshot = {
      ...baseOffSnapshot,
      active: true,
      active_session: {
        session_id: SESSION_1_ID,
        store_id: STORE_1_ID,
        terminal_id: TERMINAL_1_ID,
        staff_member_id: EMP_ROHAN_ID,
        staff_member_name: 'Rohan Sharma',
        cashier_code: 'ROHAN-01',
        started_at: '2026-11-28T11:00:00.000Z',
        started_by: '22222222-2222-2222-2222-222222222222',
        started_by_name: 'Staff Alex',
        status: 'ACTIVE' as const,
        order_count: 5,
        sales_total_paise: 124500,
      },
    };

    mockGetCurrentBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: activeSnapshot,
    });

    render(<StaffPOSWorkspace />);

    await waitFor(() => {
      expect(screen.getByText('BILLING ON')).toBeInTheDocument();
    });

    expect(screen.getByLabelText('Session order count')).toHaveTextContent(
      '5 orders'
    );

    // Enter stop reason and click STOP BILLING
    const reasonInput = screen.getByLabelText('Optional stop billing reason');
    fireEvent.change(reasonInput, { target: { value: 'Lunch break handoff' } });

    const stoppedSnapshot = {
      ...baseOffSnapshot,
      active: false,
      active_session: null,
      previous_session: {
        ...activeSnapshot.active_session,
        stopped_at: '2026-11-28T14:00:00.000Z',
        stopped_by: '22222222-2222-2222-2222-222222222222',
        stopped_by_name: 'Staff Alex',
        stop_reason: 'Lunch break handoff',
        status: 'STOPPED' as const,
      },
    };

    mockStopBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: stoppedSnapshot.previous_session,
    });
    mockGetCurrentBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: stoppedSnapshot,
    });

    fireEvent.click(screen.getByRole('button', { name: /STOP BILLING/i }));

    await waitFor(() => {
      expect(screen.getByText('BILLING OFF')).toBeInTheDocument();
    });

    expect(mockStopBillingSessionAction).toHaveBeenCalledWith({
      sessionId: SESSION_1_ID,
      stopReason: 'Lunch break handoff',
    });
    expect(
      screen.getByText(/Billing session stopped and confirmed by server/i)
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Previous billing session summary')
    ).toHaveTextContent(/Lunch break handoff/i);

    // Restart billing -> creates SESSION_2_ID
    const restartedSnapshot = {
      ...baseOffSnapshot,
      active: true,
      active_session: {
        session_id: SESSION_2_ID,
        store_id: STORE_1_ID,
        terminal_id: TERMINAL_1_ID,
        staff_member_id: EMP_ROHAN_ID,
        staff_member_name: 'Rohan Sharma',
        cashier_code: 'ROHAN-01',
        started_at: '2026-11-28T14:30:00.000Z',
        started_by: '22222222-2222-2222-2222-222222222222',
        started_by_name: 'Staff Alex',
        status: 'ACTIVE' as const,
        order_count: 0,
        sales_total_paise: 0,
      },
      previous_session: stoppedSnapshot.previous_session,
    };

    mockStartBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: restartedSnapshot.active_session,
    });
    mockGetCurrentBillingSessionAction.mockResolvedValueOnce({
      success: true,
      data: restartedSnapshot,
    });

    fireEvent.click(screen.getByRole('button', { name: /START BILLING/i }));

    await waitFor(() => {
      expect(screen.getByText('BILLING ON')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Session order count')).toHaveTextContent(
      '0 orders'
    );
  });
});
