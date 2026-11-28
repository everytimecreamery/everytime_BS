import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetUser = vi.fn();
const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
    from: mockFrom,
    rpc: mockRpc,
  })),
}));

import {
  startBillingSessionAction,
  stopBillingSessionAction,
  getCurrentBillingSessionAction,
  listActiveStaffMembersAction,
  getBillingSessionHistoryAction,
  getBillingSessionDetailsAction,
  getOwnerBillingMonitoringAction,
} from '@/app/actions/billing-sessions';
import { submitOrderAction } from '@/app/actions/orders';
import { createNewPosOrder, addItemToOrder } from '@/lib/pos/order';
import { classifySyncError } from '@/lib/supabase/orders';

const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
const SESSION_1_ID = '55555555-5555-5555-5555-555555555551';
const STAFF_USER_ID = '22222222-2222-2222-2222-222222222222';
const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
const EMP_1_ID = '44444444-4444-4444-4444-444444444441';

function setupAuthenticatedUser(role: 'staff' | 'owner', storeId = STORE_1_ID) {
  const uid = role === 'owner' ? OWNER_USER_ID : STAFF_USER_ID;
  mockGetUser.mockResolvedValue({
    data: { user: { id: uid, email: `${role}@everytimecreamery.com` } },
    error: null,
  });

  return {
    id: uid,
    store_id: storeId,
    role,
    full_name: role === 'owner' ? 'Owner Boss' : 'Staff Alex',
    cashier_code: role === 'owner' ? 'OWNER-01' : 'ALEX-01',
    is_active: true,
  };
}

describe('Manual Billing Sessions — Server Actions & Checkout Delegation (Stage C)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Rejects unauthenticated calls across all billing session server actions', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const startRes = await startBillingSessionAction({
      storeId: STORE_1_ID,
      terminalId: TERMINAL_1_ID,
    });
    expect(startRes.success).toBe(false);
    expect(startRes.error).toMatch(/Authentication required/i);

    const stopRes = await stopBillingSessionAction({ sessionId: SESSION_1_ID });
    expect(stopRes.success).toBe(false);
    expect(stopRes.error).toMatch(/Authentication required/i);

    const statusRes = await getCurrentBillingSessionAction(TERMINAL_1_ID);
    expect(statusRes.success).toBe(false);
    expect(statusRes.error).toMatch(/Authentication required/i);

    const monitorRes = await getOwnerBillingMonitoringAction();
    expect(monitorRes.success).toBe(false);
    expect(monitorRes.error).toMatch(/Authentication required/i);
  });

  it('2. Staff starts and stops billing session with store validation and RPC delegation', async () => {
    const profile = setupAuthenticatedUser('staff', STORE_1_ID);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: profile, error: null }),
              maybeSingle: async () => ({ data: profile, error: null }),
            }),
          }),
        };
      }
      if (table === 'terminals') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({
                    data: { id: TERMINAL_1_ID, store_id: STORE_1_ID },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    // Cross-store start attempt by staff is rejected before hitting RPC
    const crossStoreStart = await startBillingSessionAction({
      storeId: STORE_2_ID,
      terminalId: TERMINAL_1_ID,
    });
    expect(crossStoreStart.success).toBe(false);
    expect(crossStoreStart.error).toMatch(/cannot start billing for another store/i);
    expect(mockRpc).not.toHaveBeenCalled();

    // Valid start (auto-resolves terminal when terminalId omitted)
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        session_id: SESSION_1_ID,
        store_id: STORE_1_ID,
        terminal_id: TERMINAL_1_ID,
        status: 'ACTIVE',
        staff_member_id: EMP_1_ID,
        staff_member_name: 'Rohan Sharma',
        cashier_code: 'ROHAN-01',
      },
      error: null,
    });

    const startRes = await startBillingSessionAction({
      staffMemberId: EMP_1_ID,
    });
    expect(startRes.success).toBe(true);
    expect(startRes.data.session_id).toBe(SESSION_1_ID);
    expect(mockRpc).toHaveBeenCalledWith('start_billing_session', {
      p_store_id: STORE_1_ID,
      p_terminal_id: TERMINAL_1_ID,
      p_staff_member_id: EMP_1_ID,
    });

    // Valid stop
    mockRpc.mockResolvedValueOnce({
      data: {
        success: true,
        session_id: SESSION_1_ID,
        status: 'STOPPED',
        stop_reason: 'Break time',
        order_count: 3,
        sales_total_paise: 53100,
      },
      error: null,
    });

    const stopRes = await stopBillingSessionAction({
      sessionId: SESSION_1_ID,
      stopReason: '  Break time  ',
    });
    expect(stopRes.success).toBe(true);
    expect(stopRes.data.status).toBe('STOPPED');
    expect(mockRpc).toHaveBeenCalledWith('stop_billing_session', {
      p_session_id: SESSION_1_ID,
      p_stop_reason: 'Break time',
    });
  });

  it('3. Enforces owner-only permission on getOwnerBillingMonitoringAction', async () => {
    const staffProfile = setupAuthenticatedUser('staff', STORE_1_ID);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: staffProfile, error: null }),
              maybeSingle: async () => ({ data: staffProfile, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const staffAttempt = await getOwnerBillingMonitoringAction();
    expect(staffAttempt.success).toBe(false);
    expect(staffAttempt.error).toMatch(/Forbidden/i);
  });

  it('4. getBillingSessionDetailsAction aggregates session orders, GST splits, payment breakdowns, and cashier attribution', async () => {
    const ownerProfile = setupAuthenticatedUser('owner', STORE_1_ID);

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: (cols?: string) => {
            if (!cols || cols === '*' || cols.includes('role')) {
              return {
                eq: () => ({
                  single: async () => ({ data: ownerProfile, error: null }),
                  maybeSingle: async () => ({ data: ownerProfile, error: null }),
                }),
              };
            }
            return Promise.resolve({
              data: [
                { id: STAFF_USER_ID, full_name: 'Staff Alex', cashier_code: 'ALEX-01' },
                { id: OWNER_USER_ID, full_name: 'Owner Boss', cashier_code: 'OWNER-01' },
              ],
              error: null,
            });
          },
        };
      }
      if (table === 'billing_sessions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: SESSION_1_ID,
                  store_id: STORE_1_ID,
                  terminal_id: TERMINAL_1_ID,
                  staff_member_id: EMP_1_ID,
                  started_at: '2026-11-28T11:00:00.000Z',
                  stopped_at: '2026-11-28T15:00:00.000Z',
                  started_by: STAFF_USER_ID,
                  stopped_by: STAFF_USER_ID,
                  status: 'STOPPED',
                  stop_reason: 'Shift handoff',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { id: STORE_1_ID, name: 'Everytime Creamery - Flagship' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'terminals') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: TERMINAL_1_ID,
                  store_id: STORE_1_ID,
                  terminal_number: '01',
                  device_name: 'Counter Terminal #01',
                },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: () =>
            Promise.resolve({
              data: [
                { id: EMP_1_ID, full_name: 'Rohan Sharma', cashier_code: 'ROHAN-01' },
              ],
              error: null,
            }),
        };
      }
      if (table === 'orders') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: async () => ({
                  data: [
                    {
                      id: 'ord-1',
                      store_id: STORE_1_ID,
                      terminal_id: TERMINAL_1_ID,
                      billing_session_id: SESSION_1_ID,
                      cashier_id: STAFF_USER_ID,
                      staff_member_id: EMP_1_ID,
                      token_terminal: 'T1',
                      token_seq: 1,
                      status: 'COMPLETED',
                      subtotal_paise: 19800,
                      discount_paise: 1980,
                      discount_type: 'PERCENTAGE',
                      tax_paise: 891,
                      cgst_paise: 445,
                      sgst_paise: 446,
                      total_paise: 18711,
                      client_completed_at: '2026-11-28T12:00:00.000Z',
                      server_received_at: '2026-11-28T12:00:01.000Z',
                      business_date: '2026-11-28',
                      order_items: [
                        {
                          id: 'item-1',
                          menu_item_id: 'gelato-madagascar-vanilla',
                          product_name: 'Madagascar Vanilla',
                          variant_label: null,
                          addon_label: null,
                          quantity: 2,
                          unit_price_paise: 9900,
                          addon_price_paise: 0,
                          total_price_paise: 19800,
                        },
                      ],
                      payments: [
                        {
                          id: 'pay-1',
                          method: 'upi',
                          amount_paise: 18711,
                          upi_utr: 'UTR12345',
                          created_at: '2026-11-28T12:00:00.000Z',
                        },
                      ],
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'billing_session_events') {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: [
                  {
                    id: 'ev-1',
                    session_id: SESSION_1_ID,
                    store_id: STORE_1_ID,
                    terminal_id: TERMINAL_1_ID,
                    event_type: 'SESSION_STARTED',
                    actor_id: STAFF_USER_ID,
                    staff_member_id: EMP_1_ID,
                    reason: null,
                    metadata: { actor_name: 'Staff Alex', staff_name: 'Rohan Sharma' },
                    created_at: '2026-11-28T11:00:00.000Z',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    });

    const detailsRes = await getBillingSessionDetailsAction(SESSION_1_ID);
    expect(detailsRes.success).toBe(true);
    const payload = detailsRes.data!;
    expect(payload.session.session_id).toBe(SESSION_1_ID);
    expect(payload.session.staff_member_name).toBe('Rohan Sharma');
    expect(payload.session.cashier_code).toBe('ROHAN-01');
    expect(payload.session.duration_seconds).toBe(4 * 3600);
    expect(payload.session.order_count).toBe(1);
    expect(payload.session.subtotal_paise).toBe(19800);
    expect(payload.session.discount_paise).toBe(1980);
    expect(payload.session.tax_paise).toBe(891);
    expect(payload.session.cgst_paise + payload.session.sgst_paise).toBe(891);
    expect(payload.session.sales_total_paise).toBe(18711);
    expect(payload.session.upi_paise).toBe(18711);
    expect(payload.session.cash_paise).toBe(0);

    expect(payload.orders).toHaveLength(1);
    expect(payload.orders[0].token).toBe('T1-001');
    expect(payload.orders[0].staff_member_name).toBe('Rohan Sharma');
    expect(payload.orders[0].items[0].product_name).toBe('Madagascar Vanilla');
    expect(payload.orders[0].payments[0].upi_utr).toBe('UTR12345');
  });

  it('5. submitOrderAction forwards staffMemberId and surfaces billing session OFF rejection accurately', async () => {
    const staffProfile = setupAuthenticatedUser('staff', STORE_1_ID);
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: staffProfile, error: null }),
              maybeSingle: async () => ({ data: staffProfile, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    let order = createNewPosOrder();
    order = addItemToOrder(order, {
      productId: 'gelato-madagascar-vanilla',
      productName: 'Madagascar Vanilla',
      unitPricePaise: 9900,
      quantity: 1,
    });

    mockRpc.mockResolvedValueOnce({
      data: null,
      error: {
        message:
          'Billing session inactive: Billing is currently STOPPED for terminal 00000000-0000-0000-0000-000000000002. Staff must start a manual billing session before processing orders.',
      },
    });

    const res = await submitOrderAction({
      order,
      method: 'CASH',
      terminalId: TERMINAL_1_ID,
      staffMemberId: EMP_1_ID,
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/Billing session inactive.*Billing is currently STOPPED/i);
    expect(mockRpc).toHaveBeenCalledWith(
      'complete_pos_checkout',
      expect.objectContaining({
        p_terminal_id: TERMINAL_1_ID,
        p_staff_member_id: EMP_1_ID,
      })
    );

    // Verify classifySyncError categorizes billing session inactive as validation (NOT auth_expired or network)
    expect(classifySyncError(res.error)).toBe('validation');
  });
});
