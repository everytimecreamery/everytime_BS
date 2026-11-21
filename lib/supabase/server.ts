import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase admin client.
 * Uses SUPABASE_SERVICE_ROLE_KEY to bypass RLS for administrative operations,
 * daily Z-reports, and system diagnostics.
 *
 * CRITICAL: This file MUST NEVER be imported into Client Components ('use client').
 */
export function createServerAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Server Supabase Admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
