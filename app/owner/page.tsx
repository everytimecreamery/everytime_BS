import React, { Suspense } from 'react';
import { requireOwner } from '@/lib/auth/rbac';
import { OwnerPortalClient } from '@/components/owner/OwnerPortalClient';

export const metadata = {
  title: 'Owner Portal — Everytime Creamery',
  description: 'Operations management, sales analytics, and configuration for Everytime Creamery',
};

async function OwnerPortalContent() {
  const { user, profile } = await requireOwner({
    redirectUrl: '/owner/login',
    unauthorizedRedirectUrl: '/owner/login?error=unauthorized',
  });

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
