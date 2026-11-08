'use client';

import React, { useSyncExternalStore } from 'react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Calendar, Store } from 'lucide-react';

interface OwnerHeaderProps {
  title: string;
  description: string;
}

function subscribeDate() {
  return () => { };
}

function getDateSnapshot() {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());
}

function getServerSnapshot() {
  return 'Today';
}

export function OwnerHeader({ title, description }: OwnerHeaderProps) {
  const today = useSyncExternalStore(subscribeDate, getDateSnapshot, getServerSnapshot);

  return (
    <header className="bg-white border-b border-[#E8E3C3] px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
      <div>
        <h1 className="text-xl font-bold text-[#222222] tracking-tight">{title}</h1>
        <p className="text-xs text-[#777777] mt-0.5">{description}</p>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs text-[#222222]">
          <Calendar className="w-3.5 h-3.5 text-[#C43C1E]" />
          <span className="font-medium">{today}</span>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs text-[#222222]">
          <Store className="w-3.5 h-3.5 text-[#C43C1E]" />
          <span className="font-medium">Main Store Outlet</span>
        </div>

        <StatusBadge label="Phase 0 Active" variant="neutral" />
      </div>
    </header>
  );
}
