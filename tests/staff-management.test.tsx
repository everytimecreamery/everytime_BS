import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

const mockGetUser = vi.fn();
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockFrom = vi.fn();
const mockCreateServerClient = vi.fn(() => ({
  auth: {
    getUser: mockGetUser,
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
  from: mockFrom,
}));

vi.mock('@/utils/supabase/server', () => ({
  createClient: () => mockCreateServerClient(),
}));

const mockMiddlewareGetUser = vi.fn();
const mockMiddlewareProfileMaybeSingle = vi.fn();
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(),
  createServerClient: vi.fn(() => ({
    auth: { getUser: mockMiddlewareGetUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMiddlewareProfileMaybeSingle,
        })),
      })),
    })),
  })),
}));

import {
  listStaffManagementDataAction,
  createStaffMemberAction,
  updateStaffMemberAction,
  setStaffMemberActiveAction,
} from '@/app/actions/staff';
import { requireStaff, requireOwner } from '@/lib/auth/rbac';
import { loginStaffAction } from '@/app/owner/login/actions';
import { updateSession } from '@/utils/supabase/middleware';
import { StaffManagementView } from '@/components/owner/StaffManagementView';

const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
const EMP_1_ID = '11111111-1111-1111-1111-111111111111';
const EMP_2_ID = '22222222-2222-2222-2222-222222222222';

describe('Employee Records Management (StaffManagementView & Server Actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function mockOwnerAuth(profileOverrides: Record<string, any> = {}) {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'owner-1', email: 'owner@everytimecreamery.com' } },
      error: null,
    });
    return {
      id: 'owner-1',
      store_id: STORE_1_ID,
      role: 'owner',
      full_name: 'Owner One',
      cashier_code: 'OWNER',
      is_active: true,
      ...profileOverrides,
    };
  }

  function mockStaffAuth() {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'staff-1', email: 'staff@everytimecreamery.com' } },
      error: null,
    });
    return {
      id: 'staff-1',
      store_id: STORE_1_ID,
      role: 'staff',
      full_name: 'Counter Staff',
      cashier_code: 'C01',
      is_active: true,
    };
  }

  it('1. Owner can add an employee with normalized fields and optional email/phone', async () => {
    const ownerProfile = mockOwnerAuth();
    const insertSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: EMP_1_ID,
        full_name: 'Priya Sharma',
        email: 'priya@everytimecreamery.com',
        phone: '+91 98765 43210',
        store_id: STORE_1_ID,
        cashier_code: 'C04',
        is_active: true,
        created_at: '2026-11-28T10:00:00Z',
        updated_at: '2026-11-28T10:00:00Z',
      },
      error: null,
    });
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ single: insertSingleMock }),
    });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: STORE_1_ID }, error: null }),
            }),
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          insert: insertMock,
        };
      }
      return {};
    });

    const res = await createStaffMemberAction({
      fullName: '  Priya Sharma  ',
      email: ' Priya@EverytimeCreamery.com ',
      phone: ' +91 98765 43210 ',
      storeId: STORE_1_ID,
      cashierCode: 'c04',
    });

    expect(res.success).toBe(true);
    expect(insertMock).toHaveBeenCalledWith({
      full_name: 'Priya Sharma',
      email: 'priya@everytimecreamery.com',
      phone: '+91 98765 43210',
      store_id: STORE_1_ID,
      cashier_code: 'C04',
      is_active: true,
    });
  });

  it('2. Non-owner (staff or unauthenticated) cannot list, add, edit, or change status of employees', async () => {
    // Unauthenticated
    mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const unauthRes = await createStaffMemberAction({
      fullName: 'Test',
      storeId: STORE_1_ID,
      cashierCode: 'C01',
    });
    expect(unauthRes.success).toBe(false);
    expect(unauthRes.error).toMatch(/authentication required/i);

    // Staff user blocked across all 4 employee actions
    const staffProfile = mockStaffAuth();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: staffProfile, error: null }),
            }),
          }),
        };
      }
      return {};
    });

    const listRes = await listStaffManagementDataAction();
    expect(listRes.success).toBe(false);
    expect(listRes.error).toMatch(/forbidden/i);

    mockStaffAuth();
    const createRes = await createStaffMemberAction({
      fullName: 'Unauthorized Hire',
      storeId: STORE_1_ID,
      cashierCode: 'C02',
    });
    expect(createRes.success).toBe(false);
    expect(createRes.error).toMatch(/forbidden/i);

    mockStaffAuth();
    const updateRes = await updateStaffMemberAction(EMP_1_ID, {
      fullName: 'Edited',
      storeId: STORE_1_ID,
      cashierCode: 'C02',
    });
    expect(updateRes.success).toBe(false);
    expect(updateRes.error).toMatch(/forbidden/i);

    mockStaffAuth();
    const statusRes = await setStaffMemberActiveAction(EMP_1_ID, false);
    expect(statusRes.success).toBe(false);
    expect(statusRes.error).toMatch(/forbidden/i);
  });

  it('3. Duplicate cashier codes and invalid store assignments are rejected', async () => {
    const ownerProfile = mockOwnerAuth();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockImplementation((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: val === STORE_1_ID ? { id: STORE_1_ID } : null,
                error: null,
              }),
            })),
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [{ id: EMP_1_ID, cashier_code: 'C01' }],
              error: null,
            }),
          }),
        };
      }
      return {};
    });

    // Duplicate cashier code (case-insensitive)
    const dupRes = await createStaffMemberAction({
      fullName: 'Duplicate Cashier',
      storeId: STORE_1_ID,
      cashierCode: 'c01',
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.error).toMatch(/cashier code.*already assigned/i);

    // Invalid UUID store assignment
    mockOwnerAuth();
    const invalidUuidRes = await createStaffMemberAction({
      fullName: 'Invalid Store',
      storeId: 'not-a-uuid',
      cashierCode: 'C02',
    });
    expect(invalidUuidRes.success).toBe(false);
    expect(invalidUuidRes.error).toMatch(/store.*invalid/i);

    // Non-existent store UUID assignment
    mockOwnerAuth();
    const missingStoreRes = await createStaffMemberAction({
      fullName: 'Missing Store',
      storeId: '99999999-9999-9999-9999-999999999999',
      cashierCode: 'C02',
    });
    expect(missingStoreRes.success).toBe(false);
    expect(missingStoreRes.error).toMatch(/store does not exist/i);
  });

  it('4. Owner can edit employee details and deactivate/reactivate employees', async () => {
    const ownerProfile = mockOwnerAuth();
    const updateSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: EMP_1_ID,
        full_name: 'Priya S.',
        email: null,
        phone: '9876543210',
        store_id: STORE_2_ID,
        cashier_code: 'C09',
        is_active: true,
        created_at: '2026-11-28T10:00:00Z',
        updated_at: '2026-11-28T11:00:00Z',
      },
      error: null,
    });
    const updateSelectMock = vi.fn().mockReturnValue({ single: updateSingleMock });
    const updateEqMock = vi.fn().mockReturnValue({ select: updateSelectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: STORE_2_ID }, error: null }),
            }),
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: EMP_1_ID }, error: null }),
                }),
              };
            }
            if (cols.includes('is_active')) {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: EMP_1_ID, full_name: 'Priya S.', is_active: true },
                    error: null,
                  }),
                }),
              };
            }
            return {
              eq: vi.fn().mockReturnValue({
                neq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          }),
          update: updateMock,
        };
      }
      return {};
    });

    const editRes = await updateStaffMemberAction(EMP_1_ID, {
      fullName: 'Priya S.',
      email: '',
      phone: '9876543210',
      storeId: STORE_2_ID,
      cashierCode: 'C09',
    });
    expect(editRes.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: 'Priya S.',
        email: null,
        phone: '9876543210',
        store_id: STORE_2_ID,
        cashier_code: 'C09',
      })
    );

    mockOwnerAuth();
    const deactRes = await setStaffMemberActiveAction(EMP_1_ID, false);
    expect(deactRes.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: false })
    );

    mockOwnerAuth();
    const reactRes = await setStaffMemberActiveAction(EMP_1_ID, true);
    expect(reactRes.success).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ is_active: true })
    );
  });

  it('5. StaffManagementView renders table, empty state, validation, edit, and deactivation confirmation while keeping inactive rows visible', async () => {
    const ownerProfile = mockOwnerAuth();
    let employeesState = [
      {
        id: EMP_1_ID,
        full_name: 'Alex M.',
        email: 'alex@everytimecreamery.com',
        phone: '+91 98765 43210',
        store_id: STORE_1_ID,
        cashier_code: 'C01',
        is_active: true,
        created_at: '2026-11-28T09:00:00Z',
        updated_at: '2026-11-28T09:00:00Z',
      },
      {
        id: EMP_2_ID,
        full_name: 'Riya K.',
        email: null,
        phone: null,
        store_id: STORE_2_ID,
        cashier_code: 'C02',
        is_active: false,
        created_at: '2026-11-27T09:00:00Z',
        updated_at: '2026-11-28T08:00:00Z',
      },
    ];

    const storesList = [
      { id: STORE_1_ID, name: 'Everytime Creamery' },
      { id: STORE_2_ID, name: 'South Station Shop' },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols === 'id') {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { id: STORE_1_ID }, error: null }),
                }),
              };
            }
            return {
              order: vi.fn().mockResolvedValue({ data: storesList, error: null }),
            };
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockImplementation((cols: string) => {
            if (cols.includes('created_at')) {
              return {
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: employeesState[0], error: null }),
                }),
                order: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({ data: employeesState, error: null }),
                }),
              };
            }
            return {
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            };
          }),
          update: vi.fn().mockImplementation((patch: any) => ({
            eq: vi.fn().mockImplementation((_col: string, id: string) => {
              employeesState = employeesState.map((e) =>
                e.id === id ? { ...e, ...patch } : e
              );
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: employeesState.find((e) => e.id === id),
                    error: null,
                  }),
                }),
              };
            }),
          })),
        };
      }
      return {};
    });

    render(<StaffManagementView />);

    await waitFor(() => {
      expect(screen.getByText('Alex M.')).toBeInTheDocument();
    });

    // Both active and inactive employees remain visible in the table
    expect(screen.getByText('Riya K.')).toBeInTheDocument();
    expect(screen.getByText('alex@everytimecreamery.com')).toBeInTheDocument();
    expect(screen.getByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByText('C01')).toBeInTheDocument();
    expect(screen.getByText('C02')).toBeInTheDocument();
    expect(screen.getByText('Everytime Creamery')).toBeInTheDocument();
    expect(screen.getByText('South Station Shop')).toBeInTheDocument();
    expect(screen.getByText('1 active · 2 total employees')).toBeInTheDocument();

    // No invitation tabs or auth/password fields exist
    expect(screen.queryByText(/Staff Invitations/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Send Invite/i)).not.toBeInTheDocument();

    // Form validation when submitting empty Add Employee form
    fireEvent.click(screen.getByRole('button', { name: /Add Employee/i }));
    const dialog = screen.getByRole('dialog', { name: /Add Employee/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Add Employee$/i }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Full name is required/i);
    fireEvent.click(within(dialog).getByRole('button', { name: /Close employee dialog/i }));

    // Deactivate requires confirmation dialog first
    fireEvent.click(screen.getByRole('button', { name: /Deactivate Alex M\./i }));
    const confirmDialog = screen.getByRole('dialog', { name: /Deactivate Alex M\./i });
    expect(confirmDialog).toBeInTheDocument();

    mockOwnerAuth();
    mockOwnerAuth();
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /Confirm Deactivate/i }));

    await waitFor(() => {
      expect(screen.getByText(/Alex M\. has been marked Inactive/i)).toBeInTheDocument();
    });

    // Alex M. remains visible in list, now with Inactive status and Activate button
    expect(screen.getByText('Alex M.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Activate Alex M\./i })).toBeInTheDocument();

    // Verify client & action source files never reference service_role key or Supabase Auth admin APIs
    const staffViewSrc = fs.readFileSync(
      path.join(process.cwd(), 'components/owner/StaffManagementView.tsx'),
      'utf-8'
    );
    const staffActionsSrc = fs.readFileSync(
      path.join(process.cwd(), 'app/actions/staff.ts'),
      'utf-8'
    );
    expect(staffViewSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(staffViewSrc).not.toContain('createServerAdminClient');
    expect(staffActionsSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(staffActionsSrc).not.toContain('createServerAdminClient');
    expect(staffActionsSrc).not.toContain('inviteUserByEmail');
  });

  it('6. StaffManagementView renders clear empty state when there are no employees', async () => {
    const ownerProfile = mockOwnerAuth();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: ownerProfile, error: null }),
            }),
          }),
        };
      }
      if (table === 'stores') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({
              data: [{ id: STORE_1_ID, name: 'Everytime Creamery' }],
              error: null,
            }),
          }),
        };
      }
      if (table === 'staff_members') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      return {};
    });

    render(<StaffManagementView />);

    await waitFor(() => {
      expect(screen.getByText(/No employees added yet/i)).toBeInTheDocument();
    });
  });

  it('7. Existing deactivated-profile RBAC, middleware, and loginStaffAction protections remain intact', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'staff-deactivated' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: {
              id: 'staff-deactivated',
              store_id: STORE_1_ID,
              role: 'staff',
              full_name: 'Former Staff',
              is_active: false,
            },
            error: null,
          }),
        }),
      }),
    });
    await expect(requireStaff()).rejects.toThrow(/deactivated/i);

    mockGetUser.mockResolvedValueOnce({
      data: { user: { id: 'owner-deactivated' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'owner-deactivated', role: 'owner', is_active: false },
            error: null,
          }),
        }),
      }),
    });
    await expect(requireOwner()).rejects.toThrow(/deactivated/i);

    mockMiddlewareGetUser.mockResolvedValueOnce({ data: { user: { id: 'staff-deactivated' } } });
    mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
      data: { role: 'staff', is_active: false },
    });
    const mwRes = await updateSession(new NextRequest('http://localhost:3000/staff'));
    expect(mwRes.status).toBe(307);
    expect(mwRes.headers.get('location')).toBe('http://localhost:3000/owner/login?error=deactivated');

    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'staff-deactivated', email: 'former@everytimecreamery.com' } },
      error: null,
    });
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { id: 'staff-deactivated', role: 'staff', is_active: false },
            error: null,
          }),
        }),
      }),
    });
    const loginForm = new FormData();
    loginForm.append('email', 'former@everytimecreamery.com');
    loginForm.append('password', 'ValidPass123!');
    const loginRes = await loginStaffAction(null, loginForm);
    expect(loginRes.success).toBe(false);
    expect(loginRes.error).toMatch(/deactivated/i);
    expect(mockSignOut).toHaveBeenCalled();
  });
});
