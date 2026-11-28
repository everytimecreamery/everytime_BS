import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getCurrentUser,
  getCurrentProfile,
  requireAuthenticatedUser,
  requireRole,
  requireOwner,
  requireStaff,
  AuthenticationRequiredError,
  ForbiddenRoleError,
  ProfileNotFoundError,
  InvalidRoleError,
} from '@/lib/auth/rbac';
import { updateSession } from '@/utils/supabase/middleware';
import { NextRequest } from 'next/server';

// Mock cookies
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
  redirect: (url: string) => {
    mockRedirect(url);
    throw new Error(`NEXT_REDIRECT: ${url}`);
  },
}));

// Mock Supabase Server Client
const mockGetUser = vi.fn();
const mockProfileSelect = vi.fn();
const mockProfileEq = vi.fn();
const mockProfileMaybeSingle = vi.fn();

const mockServerSupabase = {
  auth: {
    getUser: mockGetUser,
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

describe('Phase 2: RBAC Centralized Server Authorization Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. Unauthenticated Users', () => {
    it('getCurrentUser returns null when no session is present', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const user = await getCurrentUser();
      expect(user).toBeNull();
    });

    it('getCurrentProfile returns null for unauthenticated caller', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const profile = await getCurrentProfile();
      expect(profile).toBeNull();
    });

    it('requireAuthenticatedUser throws AuthenticationRequiredError when user is not logged in', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(requireAuthenticatedUser()).rejects.toThrow(AuthenticationRequiredError);
    });

    it('requireOwner throws AuthenticationRequiredError when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(requireOwner()).rejects.toThrow(AuthenticationRequiredError);
    });

    it('requireStaff throws AuthenticationRequiredError when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      await expect(requireStaff()).rejects.toThrow(AuthenticationRequiredError);
    });
  });

  describe('2. Missing and Invalid Profiles', () => {
    it('throws ProfileNotFoundError when user exists in Auth but profile row is missing', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'auth-user-123', email: 'test@example.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

      await expect(requireRole('owner')).rejects.toThrow(ProfileNotFoundError);
    });

    it('throws InvalidRoleError when profile has a malformed or unauthorized role', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'auth-user-123', email: 'test@example.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'auth-user-123', role: 'superadmin_hacker', full_name: 'Attacker' },
        error: null,
      });

      await expect(requireRole('owner')).rejects.toThrow(InvalidRoleError);
    });
  });

  describe('3. Role Authorization: Owner vs Staff', () => {
    it('allows owner to access owner operations via requireOwner', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id', email: 'owner@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const { user, profile } = await requireOwner();
      expect(user.id).toBe('owner-id');
      expect(profile.role).toBe('owner');
    });

    it('strictly forbids staff user from accessing owner operations via requireOwner', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id', email: 'staff@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Staff Cashier' },
        error: null,
      });

      await expect(requireOwner()).rejects.toThrow(ForbiddenRoleError);
    });

    it('allows staff user to access staff operations via requireStaff', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id', email: 'staff@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Staff Cashier' },
        error: null,
      });

      const { user, profile } = await requireStaff();
      expect(user.id).toBe('staff-id');
      expect(profile.role).toBe('staff');
    });

    it('allows owner user to access staff operations (super-role compatibility)', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-id', email: 'owner@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'owner-id', role: 'owner', full_name: 'Store Owner' },
        error: null,
      });

      const { user, profile } = await requireStaff();
      expect(user.id).toBe('owner-id');
      expect(profile.role).toBe('owner');
    });
  });

  describe('4. Server Component Redirection Options', () => {
    it('redirects when redirectUrl is supplied and user is unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });

      await expect(
        requireOwner({ redirectUrl: '/owner/login' })
      ).rejects.toThrow('NEXT_REDIRECT: /owner/login');

      expect(mockRedirect).toHaveBeenCalledWith('/owner/login');
    });

    it('redirects when redirectUrl is supplied and role is forbidden', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-id', email: 'staff@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: { id: 'staff-id', role: 'staff', full_name: 'Staff Cashier' },
        error: null,
      });

      await expect(
        requireOwner({ redirectUrl: '/owner/login?error=unauthorized' })
      ).rejects.toThrow('NEXT_REDIRECT: /owner/login?error=unauthorized');

      expect(mockRedirect).toHaveBeenCalledWith('/owner/login?error=unauthorized');
    });
  });

  describe('5. Middleware Route Boundary Enforcement for /staff/*', () => {
    it('redirects unauthenticated user accessing /staff to /owner/login?redirect=/staff', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({ data: { user: null } });

      const request = new NextRequest('http://localhost:3000/staff');
      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/owner/login?redirect=%2Fstaff'
      );
    });

    it('allows authenticated staff user to access /staff', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-user-id' } },
      });
      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: { role: 'staff' },
      });

      const request = new NextRequest('http://localhost:3000/staff');
      const response = await updateSession(request);

      expect(response.status).not.toBe(307);
    });

    it('allows authenticated owner user to access /staff', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'owner-user-id' } },
      });
      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: { role: 'owner' },
      });

      const request = new NextRequest('http://localhost:3000/staff');
      const response = await updateSession(request);

      expect(response.status).not.toBe(307);
    });

    it('redirects authenticated user with missing profile accessing /staff to login with unauthorized error', async () => {
      mockMiddlewareGetUser.mockResolvedValueOnce({
        data: { user: { id: 'ghost-user-id' } },
      });
      mockMiddlewareProfileMaybeSingle.mockResolvedValueOnce({
        data: null,
      });

      const request = new NextRequest('http://localhost:3000/staff');
      const response = await updateSession(request);

      expect(response.status).toBe(307);
      expect(response.headers.get('location')).toBe(
        'http://localhost:3000/owner/login?error=unauthorized'
      );
    });
  });
});
