import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

// Mock @supabase/ssr for browser & middleware verification
const mockCreateBrowserClient = vi.fn();
const mockMiddlewareGetUser = vi.fn();
const mockMiddlewareProfileMaybeSingle = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: (...args: any[]) => mockCreateBrowserClient(...args),
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockMiddlewareGetUser,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMiddlewareProfileMaybeSingle,
        })),
      })),
    })),
  })),
}));

// Mock next/headers and @/utils/supabase/server for login actions
const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockServerProfileMaybeSingle = vi.fn();

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signOut: mockSignOut,
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockServerProfileMaybeSingle,
        })),
      })),
    })),
  })),
}));

import { createClient as createBrowserSsrClient } from '@/utils/supabase/client';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { OwnerSectionView } from '@/components/owner/OwnerSectionView';
import { loginOwnerAction, loginStaffAction } from '@/app/owner/login/actions';
import { updateSession } from '@/utils/supabase/middleware';

describe('Phase 2 — Standardized SSR Cookie Authentication & Session Isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Standardizes browser Supabase clients on @supabase/ssr cookies without localStorage auth or service_role keys', () => {
    const utilsClientSrc = fs.readFileSync(path.join(process.cwd(), 'utils/supabase/client.ts'), 'utf-8');
    const libClientSrc = fs.readFileSync(path.join(process.cwd(), 'lib/supabase/client.ts'), 'utf-8');

    expect(utilsClientSrc).toContain("from '@supabase/ssr'");
    expect(utilsClientSrc).toContain('createBrowserClient');
    expect(utilsClientSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY');

    expect(libClientSrc).toContain("from '@/utils/supabase/client'");
    expect(libClientSrc).not.toContain("import { createClient } from '@supabase/supabase-js'");
    expect(libClientSrc).not.toContain('persistSession: true');
    expect(libClientSrc).not.toContain('SUPABASE_SERVICE_ROLE_KEY');

    const fakeBrowserClient = { from: vi.fn(), channel: vi.fn(), removeChannel: vi.fn() };
    mockCreateBrowserClient.mockReturnValue(fakeBrowserClient);

    const c1 = createBrowserSsrClient();
    const c2 = getSupabaseBrowserClient();
    expect(c1).toBe(fakeBrowserClient);
    expect(c2).toBe(fakeBrowserClient);
    expect(mockCreateBrowserClient).toHaveBeenCalled();
  });

  it('2. Owner dashboard reads work with cookie-authenticated SSR browser client and surface RLS errors', async () => {
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };

    const mockBrowserClient = {
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: 'ord-ssr-1',
                        token_terminal: 'T1',
                        token_seq: 42,
                        status: 'COMPLETED',
                        total_paise: 15645,
                        client_completed_at: new Date().toISOString(),
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'terminals') {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: 'term-1', terminal_number: '01', last_synced_at: new Date().toISOString() }],
              error: null,
            }),
          };
        }
        return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
      }),
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    };

    mockCreateBrowserClient.mockReturnValue(mockBrowserClient);

    render(<OwnerSectionView sectionId="dashboard" />);

    await waitFor(() => {
      expect(screen.getByText('T1-042')).toBeInTheDocument();
    });
    expect(screen.getAllByText('₹156.45').length).toBeGreaterThanOrEqual(1);
    expect(mockCreateBrowserClient).toHaveBeenCalled();
  });

  it('3. Owner dashboard displays explicit alert if RLS denies a query', async () => {
    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };

    mockCreateBrowserClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'orders') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  order: vi.fn().mockResolvedValue({
                    data: null,
                    error: { message: 'permission denied for table orders' },
                  }),
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }),
      channel: vi.fn().mockReturnValue(mockChannel),
      removeChannel: vi.fn(),
    });

    render(<OwnerSectionView sectionId="dashboard" />);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/permission denied for table orders/i);
    });
  });

  it('4. Staff authentication works via loginStaffAction and /staff middleware, while /owner remains blocked for staff', async () => {
    // Staff login via loginStaffAction succeeds
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'staff-1', email: 'staff@everytimecreamery.com' } },
      error: null,
    });
    mockServerProfileMaybeSingle.mockResolvedValueOnce({
      data: { id: 'staff-1', role: 'staff', full_name: 'Counter Staff', store_id: 'store-1' },
      error: null,
    });

    const staffForm = new FormData();
    staffForm.append('email', 'staff@everytimecreamery.com');
    staffForm.append('password', 'StaffPass123!');

    const staffLoginRes = await loginStaffAction(null, staffForm);
    expect(staffLoginRes.success).toBe(true);
    expect(mockSignOut).not.toHaveBeenCalled();

    // Staff attempting owner-only loginOwnerAction is still rejected and signed out
    mockSignInWithPassword.mockResolvedValueOnce({
      data: { user: { id: 'staff-1', email: 'staff@everytimecreamery.com' } },
      error: null,
    });
    mockServerProfileMaybeSingle.mockResolvedValueOnce({
      data: { id: 'staff-1', role: 'staff', full_name: 'Counter Staff', store_id: 'store-1' },
      error: null,
    });

    const ownerLoginRes = await loginOwnerAction(null, staffForm);
    expect(ownerLoginRes.success).toBe(false);
    expect(mockSignOut).toHaveBeenCalled();

    // Middleware allows staff on /staff, blocks staff on /owner
    mockMiddlewareGetUser.mockResolvedValueOnce({ data: { user: { id: 'staff-1' } } });
    mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({ data: { role: 'staff' } });
    const staffPageRes = await updateSession(new NextRequest('http://localhost:3000/staff'));
    expect(staffPageRes.status).not.toBe(307);

    mockMiddlewareGetUser.mockResolvedValueOnce({ data: { user: { id: 'staff-1' } } });
    mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({ data: { role: 'staff' } });
    const ownerPageRes = await updateSession(new NextRequest('http://localhost:3000/owner'));
    expect(ownerPageRes.status).toBe(307);
    expect(ownerPageRes.headers.get('location')).toBe('http://localhost:3000/owner/login?error=unauthorized');
  });
});
