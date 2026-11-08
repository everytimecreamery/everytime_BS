import React, { Suspense } from 'react';
import { StaffPOS } from '@/components/staff/StaffPOS';

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="p-4 text-xs text-[#777777]">Loading Staff POS...</div>}>
      <StaffPOS />
    </Suspense>
  );
}
