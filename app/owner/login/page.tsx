import React, { Suspense } from 'react';
import { OwnerLoginForm } from './OwnerLoginForm';

export const metadata = {
  title: 'Owner Login — Everytime Creamery',
  description: 'Authentication for Everytime Creamery Owner Back Office',
};

export default function OwnerLoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F9F7DC] flex items-center justify-center text-xs text-[#777777]">
          Loading Owner Portal Login...
        </div>
      }
    >
      <OwnerLoginForm />
    </Suspense>
  );
}
