import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { User } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

export type UserRole = 'owner' | 'staff';

export const VALID_ROLES: readonly UserRole[] = ['owner', 'staff'] as const;

export interface UserProfile {
  id: string;
  store_id: string | null;
  role: UserRole;
  full_name: string;
  cashier_code: string | null;
  is_active?: boolean;
  deactivated_at?: string | null;
  deactivated_by?: string | null;
  pin_hash?: string | null;
  created_at?: string;
  updated_at?: string;
}

export class AuthError extends Error {
  constructor(message: string, public readonly statusCode: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

export class AuthenticationRequiredError extends AuthError {
  constructor(message = 'Authentication required. Please sign in to continue.') {
    super(message, 401);
    this.name = 'AuthenticationRequiredError';
  }
}

export class ForbiddenRoleError extends AuthError {
  constructor(message = 'Forbidden: your role does not have permission to perform this operation.') {
    super(message, 403);
    this.name = 'ForbiddenRoleError';
  }
}

export class ProfileNotFoundError extends AuthError {
  constructor(message = 'Account profile not found. Please contact administration.') {
    super(message, 403);
    this.name = 'ProfileNotFoundError';
  }
}

export class InvalidRoleError extends AuthError {
  constructor(message = 'Account has an invalid or unrecognized role.') {
    super(message, 403);
    this.name = 'InvalidRoleError';
  }
}

export interface RequireRoleOptions {
  redirectUrl?: string;
  unauthorizedRedirectUrl?: string;
}

/**
 * Retrieves the currently authenticated Supabase user.
 * Returns null if no active session or on error.
 */
export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }
    return user;
  } catch (err) {
    return null;
  }
}

/**
 * Retrieves the profile of the currently authenticated user from public.profiles.
 * Validates that the role is a valid UserRole.
 * Returns null if user is not authenticated, profile is missing, role is invalid, or on DB error.
 */
export async function getCurrentProfile(): Promise<UserProfile | null> {
  try {
    const user = await getCurrentUser();
    if (!user) return null;

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, store_id, role, full_name, cashier_code, is_active, created_at, updated_at')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !profile) {
      return null;
    }

    if ((profile as UserProfile).is_active === false) {
      return null;
    }

    if (!VALID_ROLES.includes(profile.role as UserRole)) {
      return null;
    }

    return profile as UserProfile;
  } catch (err) {
    return null;
  }
}

/**
 * Ensures a user is authenticated.
 * Throws AuthenticationRequiredError or redirects if redirectUrl is supplied.
 */
export async function requireAuthenticatedUser(
  options?: RequireRoleOptions
): Promise<{ user: User }> {
  const user = await getCurrentUser();
  if (!user) {
    if (options?.redirectUrl) {
      redirect(options.redirectUrl);
    }
    throw new AuthenticationRequiredError();
  }
  return { user };
}

/**
 * Enforces that the current authenticated user has one of the allowed roles.
 * Resolves identity and role strictly on the server from public.profiles.
 */
export async function requireRole(
  allowedRoles: UserRole | UserRole[],
  options?: RequireRoleOptions
): Promise<{ user: User; profile: UserProfile }> {
  const user = await getCurrentUser();
  if (!user) {
    if (options?.redirectUrl) {
      redirect(options.redirectUrl);
    }
    throw new AuthenticationRequiredError();
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, store_id, role, full_name, cashier_code, is_active, created_at, updated_at')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) {
    if (options?.unauthorizedRedirectUrl || options?.redirectUrl) {
      redirect(options.unauthorizedRedirectUrl || options.redirectUrl!);
    }
    throw new ProfileNotFoundError();
  }

  if ((profile as UserProfile).is_active === false) {
    if (options?.unauthorizedRedirectUrl || options?.redirectUrl) {
      redirect(options.unauthorizedRedirectUrl || options.redirectUrl!);
    }
    throw new ForbiddenRoleError(
      'Forbidden: Your account has been deactivated. Please contact the store owner.'
    );
  }

  if (!VALID_ROLES.includes(profile.role as UserRole)) {
    if (options?.unauthorizedRedirectUrl || options?.redirectUrl) {
      redirect(options.unauthorizedRedirectUrl || options.redirectUrl!);
    }
    throw new InvalidRoleError(`Invalid role: ${profile.role}`);
  }

  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!rolesArray.includes(profile.role as UserRole)) {
    if (options?.unauthorizedRedirectUrl || options?.redirectUrl) {
      redirect(options.unauthorizedRedirectUrl || options.redirectUrl!);
    }
    throw new ForbiddenRoleError(
      `Forbidden: Access denied: required role ${rolesArray.join(' or ')}, but user has ${profile.role}`
    );
  }

  return { user, profile: profile as UserProfile };
}

/**
 * Enforces that the current user has the 'owner' role.
 */
export async function requireOwner(
  options?: RequireRoleOptions
): Promise<{ user: User; profile: UserProfile }> {
  return requireRole('owner', options);
}

/**
 * Enforces that the current user has either 'staff' or 'owner' role.
 * (Owners retain super-role counter access).
 */
export async function requireStaff(
  options?: RequireRoleOptions
): Promise<{ user: User; profile: UserProfile }> {
  return requireRole(['staff', 'owner'], options);
}
