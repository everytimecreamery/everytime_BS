import { createClient } from '@/utils/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';

let browserClientSingleton: SupabaseClient<Database> | null = null;

/**
 * Returns the standardized cookie-backed browser Supabase client (@supabase/ssr).
 * Replaces the legacy localStorage-backed @supabase/supabase-js client so
 * browser queries and Realtime subscriptions share the SSR cookie session.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    if (!browserClientSingleton) {
      browserClientSingleton = createClient();
    }
    return browserClientSingleton;
  }
  return createClient();
}

/**
 * Public browser-safe Supabase client (Client Components & Realtime).
 * Lazily resolves the @supabase/ssr cookie-backed browser client and
 * strictly enforces Row-Level Security (RLS) using the public anon/publishable key.
 */
export const supabase: SupabaseClient<Database> = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_target, prop) {
      const client = getSupabaseBrowserClient();
      const value = Reflect.get(client, prop, client);
      return typeof value === 'function' ? value.bind(client) : value;
    },
  }
);

export { createClient };
