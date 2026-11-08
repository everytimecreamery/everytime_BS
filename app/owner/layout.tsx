import React from 'react';

export const metadata = {
  title: 'Owner Portal — Everytime Creamery',
  description: 'Operations management, sales analytics, and configuration for Everytime Creamery',
};

export default function OwnerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="min-h-screen bg-[#F9F7DC] text-[#222222] font-sans">
      {children}
    </div>
  );
}

