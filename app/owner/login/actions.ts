'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';

export interface AuthActionResult {
  success: boolean;
  error?: string;
}

/**
 * Server-side Owner authentication handler.
 * Validates credentials via Supabase Auth and strictly enforces the 'owner' role in profiles.
 */
export async function loginOwnerAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get('email') as string)?.trim() || '';
  const password = (formData.get('password') as string) || '';

  // 1. Validation
  if (!email || !password) {
    return {
      success: false,
      error: 'Please enter both your email address and password.',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      error: 'Please enter a valid email address.',
    };
  }

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    // 2. Authenticate using Supabase SSR email/password auth
    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.user) {
      return {
        success: false,
        error:
          authError?.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please verify and try again.'
            : authError?.message || 'Invalid email or password. Please try again.',
      };
    }

    const userId = authData.user.id;

    // 3. Query profiles table to retrieve user role and active status
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, store_id, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (profileError || !profile) {
      // Profile missing: immediately sign out to prevent unauthorized session
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Account profile not found. Please contact administration.',
      };
    }

    if ((profile as any).is_active === false) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'This account has been deactivated by the store owner.',
      };
    }

    // 4. Reject staff accounts attempting to authenticate through owner-only flow
    if (profile.role !== 'owner') {
      await supabase.auth.signOut();
      return {
        success: false,
        error:
          'Access denied: This login is reserved for Owners only. Staff members please use the Staff Terminal.',
      };
    }

    // 5. Success
    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message ||
        'An unexpected server error occurred during authentication. Please try again.',
    };
  }
}

/**
 * Server-side Staff / Counter Terminal authentication handler.
 * Authenticates via Supabase SSR cookie session and allows 'staff' or 'owner' roles.
 */
export async function loginStaffAction(
  prevState: AuthActionResult | null,
  formData: FormData
): Promise<AuthActionResult> {
  const email = (formData.get('email') as string)?.trim() || '';
  const password = (formData.get('password') as string) || '';

  if (!email || !password) {
    return {
      success: false,
      error: 'Please enter both your email address and password.',
    };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return {
      success: false,
      error: 'Please enter a valid email address.',
    };
  }

  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({
        email,
        password,
      });

    if (authError || !authData.user) {
      return {
        success: false,
        error:
          authError?.message === 'Invalid login credentials'
            ? 'Invalid email or password. Please verify and try again.'
            : authError?.message || 'Invalid email or password. Please try again.',
      };
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role, full_name, store_id, is_active')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Account profile not found. Please contact administration.',
      };
    }

    if ((profile as any).is_active === false) {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'This staff account has been deactivated. Please contact the store owner.',
      };
    }

    if (profile.role !== 'staff' && profile.role !== 'owner') {
      await supabase.auth.signOut();
      return {
        success: false,
        error: 'Access denied: Account role is not authorized for Staff POS access.',
      };
    }

    return { success: true };
  } catch (err: any) {
    return {
      success: false,
      error:
        err?.message ||
        'An unexpected server error occurred during authentication. Please try again.',
    };
  }
}

/**
 * Server-side logout handler for owner sessions.
 */
export async function logoutOwnerAction(): Promise<void> {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);
    await supabase.auth.signOut();
  } catch (err) {
    console.error('Logout error:', err);
  }
  redirect('/owner/login');
}
