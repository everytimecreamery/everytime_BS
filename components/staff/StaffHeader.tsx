'use client';

import React, { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Clock, ShieldCheck, ArrowLeftRight } from 'lucide-react';
import { formatDisplayTime } from '@/lib/utils';

function subscribeTime(callback: () => void) {
  const interval = setInterval(callback, 10000);
  return () => clearInterval(interval);
}

function getTimeSnapshot() {
  return formatDisplayTime(new Date());
}

function getServerSnapshot() {
  return '--:--';
}

export function StaffHeader() {
  const time = useSyncExternalStore(subscribeTime, getTimeSnapshot, getServerSnapshot);

  return (
    <header className="h-16 bg-white border-b border-[#E8E3C3] px-4 sm:px-6 flex items-center justify-between shadow-xs sticky top-0 z-30">
      {/* Brand & Terminal Identification */}
      <div className="flex items-center gap-4">
        <BrandLogo size="md" href="/" />
        <div className="hidden sm:block h-6 w-px bg-[#E8E3C3]" />
        <div className="hidden sm:flex items-center gap-2">
          <StatusBadge label="Staff Counter Terminal" variant="brand" />
          <span className="text-xs text-[#777777] font-medium">Terminal #01</span>
        </div>
      </div>

      {/* Center Shift & Time Indicators */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-[#222222]">
          <Clock className="w-4 h-4 text-[#C43C1E]" />
          <span className="text-xs font-semibold tabular-nums tracking-wide">{time}</span>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-[#222222]">
          <ShieldCheck className="w-4 h-4 text-[#C43C1E]" />
          <span className="text-xs font-medium">Shift: Morning POS</span>
        </div>

        {/* Portal Switcher */}
        <Link
          href="/"
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white hover:bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-medium text-[#222222] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C43C1E]"
          title="Switch Portal"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-[#777777]" />
          <span className="hidden sm:inline">Portals</span>
        </Link>
      </div>
    </header>
  );
}
