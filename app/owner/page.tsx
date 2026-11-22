import React, { Suspense } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { OwnerPortalClient } from '@/components/owner/OwnerPortalClient';

export const metadata = {
  title: 'Owner Portal — Everytime Creamery',
  description: 'Operations management, sales analytics, and configuration for Everytime Creamery',
};

async function OwnerPortalContent() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/owner/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, full_name, store_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.role !== 'owner') {
    redirect('/owner/login?error=unauthorized');
  }

  return (
    <OwnerPortalClient
      user={{ id: user.id, email: user.email }}
      profile={profile}
    />
  );
}

/**
 * Server Component: Owner Portal Entry.
 * Wrapped in Suspense to support Next.js Cache Components and Partial Prerendering.
 */
export default function OwnerPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F9F7DC] flex items-center justify-center text-xs text-[#777777]">
          Verifying Owner Authorization...
        </div>
      }
    >
      <OwnerPortalContent />
    </Suspense>
  );
}
