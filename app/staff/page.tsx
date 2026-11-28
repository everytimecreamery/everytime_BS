import React, { Suspense } from 'react';
import { requireStaff } from '@/lib/auth/rbac';
import { StaffPOS } from '@/components/staff/StaffPOS';

async function StaffContent() {
  await requireStaff({ redirectUrl: '/owner/login?redirect=/staff' });
  return <StaffPOS />;
}

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-[#777777]">Loading Staff POS...</div>}>
      <StaffContent />
    </Suspense>
  );
}
