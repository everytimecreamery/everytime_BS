import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://guvdawwjgxwvdqqedvfy.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dmRhd3dqZ3h3dmRxcWVkdmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNzc2MzcsImV4cCI6MjExMDg1MzYzN30.MIdnExuseNgiBLZK_Hb99DOKd8Rghf-SqumdH-nSczs';

if (!supabaseUrl || !supabaseAnonKey) {
  if (typeof window !== 'undefined') {
    console.warn(
      'Supabase client initialized with missing URL or Anon Key. Check .env.local'
    );
  }
}

/**
 * Public browser-safe Supabase client (Client Components & Outbox sync worker).
 * Uses public Anon Key and respects Row-Level Security (RLS).
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
