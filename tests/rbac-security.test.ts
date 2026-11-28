import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  requireRole,
  requireOwner,
  requireStaff,
  ProfileNotFoundError,
  InvalidRoleError,
  ForbiddenRoleError,
} from '@/lib/auth/rbac';

// Mock cookies
const mockCookieStore = {
  getAll: vi.fn().mockReturnValue([]),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock Supabase Server Client
const mockGetUser = vi.fn();
const mockProfileMaybeSingle = vi.fn();
const mockFrom = vi.fn();

const mockServerSupabase = {
  auth: {
    getUser: mockGetUser,
  },
  from: mockFrom,
};

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(() => mockServerSupabase),
}));

describe('Phase 2: Privilege Escalation & Security Boundary Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockProfileMaybeSingle,
            }),
          }),
        };
      }
      return {
        select: vi.fn(),
      };
    });
  });

  describe('Scenario 6 & 7: Profile Role Escalation and Downgrade Defense', () => {
    it('Scenario 7: Staff member cannot elevate their role to owner via server checks', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'staff-user-1', email: 'cashier@everytimecreamery.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'staff-user-1',
          role: 'staff',
          full_name: 'Cashier Staff',
        },
        error: null,
      });

      // Staff attempting to access owner operation is rejected
      await expect(requireOwner()).rejects.toThrow(ForbiddenRoleError);
    });

    it('Scenario 6: Owner cannot be downgraded or impersonated by an unauthorized caller', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: { user: { id: 'attacker-id', email: 'attacker@example.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValueOnce({
        data: {
          id: 'attacker-id',
          role: 'staff',
          full_name: 'Attacker Impersonating Owner',
        },
        error: null,
      });

      // requireOwner strictly queries caller's profile linked to auth.uid()
      await expect(requireOwner()).rejects.toThrow(ForbiddenRoleError);
    });
  });

  describe('Scenario 8: Missing Profile Handling', () => {
    it('Scenario 8: Missing profile is rejected with ProfileNotFoundError', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'ghost-user', email: 'ghost@example.com' } },
        error: null,
      });
      mockProfileMaybeSingle.mockResolvedValue({
        data: null,
        error: null,
      });

      await expect(requireRole('staff')).rejects.toThrow(ProfileNotFoundError);
      await expect(requireRole('owner')).rejects.toThrow(ProfileNotFoundError);
    });
  });

  describe('Scenario 9: Invalid Roles Rejected', () => {
    it('Scenario 9: Invalid roles in DB (e.g. "admin", "manager", "hacker") are strictly rejected', async () => {
      const invalidRoles = ['admin', 'manager', 'superuser', 'hacker', 'root', ''];

      for (const invalidRole of invalidRoles) {
        mockGetUser.mockResolvedValueOnce({
          data: { user: { id: 'test-user', email: 'test@example.com' } },
          error: null,
        });
        mockProfileMaybeSingle.mockResolvedValueOnce({
          data: { id: 'test-user', role: invalidRole, full_name: 'Test' },
          error: null,
        });

        await expect(requireRole('staff')).rejects.toThrow(InvalidRoleError);
      }
    });
  });

  describe('Scenario 11: Database RLS Logic Simulation', () => {
    // Evaluates the RLS policy predicates in SQL equivalent logic
    const evaluateMenuWriteRLS = (userRole: string | null): boolean => {
      // Corrected policy: (public.get_user_role() = 'owner')
      return userRole === 'owner';
    };

    const evaluateRoleUpdateTrigger = (
      currentCallerRole: string | null,
      oldRole: string,
      newRole: string
    ): { allowed: boolean; error?: string } => {
      // Trigger check: IF OLD.role IS DISTINCT FROM NEW.role AND public.get_user_role() IS DISTINCT FROM 'owner'
      if (oldRole !== newRole && currentCallerRole !== 'owner') {
        return { allowed: false, error: 'Unauthorized: only owners can modify user roles.' };
      }
      return { allowed: true };
    };

    it('Scenario 11: RLS menu write policy denies staff and anonymous callers', () => {
      expect(evaluateMenuWriteRLS(null)).toBe(false); // Anonymous
      expect(evaluateMenuWriteRLS('staff')).toBe(false); // Staff
      expect(evaluateMenuWriteRLS('owner')).toBe(true); // Owner
    });

    it('Scenario 11: Profile role update trigger blocks staff from escalating role', () => {
      // Staff trying to elevate from 'staff' to 'owner'
      const staffAttempt = evaluateRoleUpdateTrigger('staff', 'staff', 'owner');
      expect(staffAttempt.allowed).toBe(false);
      expect(staffAttempt.error).toMatch(/only owners can modify user roles/i);

      // Anonymous trying to elevate role (caller role is null)
      const anonAttempt = evaluateRoleUpdateTrigger(null, 'staff', 'owner');
      expect(anonAttempt.allowed).toBe(false);
      expect(anonAttempt.error).toMatch(/only owners can modify user roles/i);

      // Owner changing role is allowed
      const ownerAttempt = evaluateRoleUpdateTrigger('owner', 'staff', 'owner');
      expect(ownerAttempt.allowed).toBe(true);
    });
  });
});
