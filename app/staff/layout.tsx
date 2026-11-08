import React from 'react';

export const metadata = {
  title: 'Staff Portal — Everytime Creamery',
  description: 'Fast counter billing and order terminal for Everytime Creamery staff',
};

export default function StaffLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
        <div className="h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[#F9F7DC] text-[#222222] flex flex-col font-sans select-none">
          <main className="flex-1 flex flex-col p-1.5 sm:p-2.5 overflow-hidden min-h-0">
            {children}
          </main>
        </div>
        );
}
