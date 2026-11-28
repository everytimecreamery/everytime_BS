import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/supabase/database.types';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://guvdawwjgxwvdqqedvfy.supabase.co';
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1dmRhd3dqZ3h3dmRxcWVkdmZ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUyNzc2MzcsImV4cCI6MjExMDg1MzYzN30.MIdnExuseNgiBLZK_Hb99DOKd8Rghf-SqumdH-nSczs';

/**
 * Cookie-backed browser Supabase client (@supabase/ssr).
 * Shares the exact same HTTP cookies managed by Next.js Middleware,
 * Server Components, and Server Actions. Never uses service-role credentials.
 */
export const createClient = () =>
  createBrowserClient<Database>(supabaseUrl, supabaseKey);
