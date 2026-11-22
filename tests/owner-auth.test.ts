import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loginOwnerAction, logoutOwnerAction } from '@/app/owner/login/actions';
import { updateSession } from '@/utils/supabase/middleware';
import { NextRequest, NextResponse } from 'next/server';

// Mock next/headers
const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock next/navigation
const mockRedirect = vi.fn();
vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

// Mock @/utils/supabase/server
const mockSignInWithPassword = vi.fn();
const mockSignOut = vi.fn();
const mockProfileSelect = vi.fn();
const mockProfileEq = vi.fn();
const mockProfileMaybeSingle = vi.fn();

const mockServerSupabase = {
  auth: {
    signInWithPassword: mockSignInWithPassword,
    signOut: mockSignOut,
  },
  from: vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: mockProfileSelect.mockReturnValue({
          eq: mockProfileEq.mockReturnValue({
            maybeSingle: mockProfileMaybeSingle,
          }),
        }),
      };
    }
    return {
      select: vi.fn(),
    };
  }),
};

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => mockServerSupabase),
}));

// Mock @supabase/ssr for middleware
const mockMiddlewareGetUser = vi.fn();
const mockMiddlewareProfileMaybeSingle = vi.fn();

vi.mock('@supabase/ssr', () => ({
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

describe('Phase 1: Owner Authentication Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Input Validation & Invalid Email Handling', () => {
    it('rejects empty email or password', async () => {
      const formData = new FormData();
      formData.append('email', '');
      formData.append('password', '');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/please enter both/i);
    });

    it('rejects invalid email formats', async () => {
      const formData = new FormData();
      formData.append('email', 'not-a-valid-email');
      formData.append('password', 'SecretPassword123!');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/valid email address/i);
    });
  });

  describe('2. Supabase Password Authentication & Invalid Credentials', () => {
    it('returns error on invalid credentials', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: { user: null },
        error: { message: 'Invalid login credentials' },
      });

      const formData = new FormData();
      formData.append('email', 'owner@everytimecreamery.com');
      formData.append('password', 'WrongPassword!');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/invalid email or password/i);
    });
  });

  describe('3. Missing Profile Handling', () => {
    it('signs out and rejects if user profile is missing in database', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'user-without-profile', email: 'owner@everytimecreamery.com' },
        },
        error: null,
      });

      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const formData = new FormData();
      formData.append('email', 'owner@everytimecreamery.com');
      formData.append('password', 'ValidPassword123!');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/profile not found/i);
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('4. Role-Based Access Control: Staff Account Rejection', () => {
    it('strictly rejects staff account attempting owner login and revokes session', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'staff-user-id', email: 'staff@everytimecreamery.com' },
        },
        error: null,
      });

      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'staff-user-id',
          role: 'staff',
          full_name: 'Cashier Staff',
          store_id: '00000000-0000-0000-0000-000000000001',
        },
        error: null,
      });

      const formData = new FormData();
      formData.append('email', 'staff@everytimecreamery.com');
      formData.append('password', 'StaffPassword123!');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Access denied: This login is reserved for Owners only/i);
      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('5. Valid Owner Authentication', () => {
    it('successfully authenticates owner user with owner role', async () => {
      mockSignInWithPassword.mockResolvedValueOnce({
        data: {
          user: { id: 'owner-user-id', email: 'owner@everytimecreamery.com' },
        },
        error: null,
      });

      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'owner-user-id',
          role: 'owner',
          full_name: 'Store Owner',
          store_id: '00000000-0000-0000-0000-000000000001',
        },
        error: null,
      });

      const formData = new FormData();
      formData.append('email', 'owner@everytimecreamery.com');
      formData.append('password', 'OwnerPassword123!');

      const result = await loginOwnerAction(null, formData);
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe('6. Logout Functionality', () => {
    it('signs out user from Supabase and redirects to /owner/login', async () => {
      await logoutOwnerAction();
      expect(mockSignOut).toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith('/owner/login');
    });
  });

  describe('7. Middleware Protected Routes & Unauthorized Access', () => {
    it('redirects unauthenticated user accessing /owner to /owner/login', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: null },
      });

      const request = new NextRequest('http://localhost:3000/owner');
      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost:3000/owner/login');
    });

    it('allows unauthenticated user accessing /owner/login', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: null },
      });

      const request = new NextRequest('http://localhost:3000/owner/login');
      const response = await updateSession(request);

      // Should not redirect
      expect(response.status).not.toBe(307);
    });

    it('redirects authenticated staff user accessing /owner to /owner/login?error=unauthorized', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-user-id' } },
      });

      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: { role: 'staff' },
      });

      const request = new NextRequest('http://localhost:3000/owner');
      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/owner/login?error=unauthorized'
      );
    });

    it('redirects authenticated owner visiting /owner/login back to /owner', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-user-id' } },
      });

      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: { role: 'owner' },
      });

      const request = new NextRequest('http://localhost:3000/owner/login');
      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe('http://localhost:3000/owner');
    });

    it('allows authenticated owner user to proceed to /owner', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-user-id' } },
      });

      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: { role: 'owner' },
      });

      const request = new NextRequest('http://localhost:3000/owner');
      const response = await updateSession(request);

      // Should not redirect
      expect(response.status).not.toBe(307);
    });
  });
});
