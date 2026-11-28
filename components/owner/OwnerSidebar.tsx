'use client';

import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { OWNER_NAV_ITEMS } from '@/lib/constants';
import { logoutOwnerAction } from '@/app/owner/login/actions';
import {
  LayoutDashboard,
  Receipt,
  BarChart3,
  IceCream,
  Users,
  Settings,
  Store,
  ExternalLink,
  LogOut,
  UserCheck,
  Clock,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard,
  Clock,
  Receipt,
  BarChart3,
  IceCream,
  Users,
  Settings,
};

interface OwnerSidebarProps {
  currentSection: string;
  onSelectSection: (sectionId: string) => void;
  userEmail?: string | null;
  ownerName?: string | null;
}

export function OwnerSidebar({
  currentSection,
  onSelectSection,
  userEmail,
  ownerName,
}: OwnerSidebarProps) {
  return (
    <aside className="w-full lg:w-64 bg-white border-r border-[#E8E3C3] flex flex-col shrink-0 lg:min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-[#E8E3C3] flex flex-col gap-2">
        <BrandLogo size="md" href="/" />
        <div className="flex items-center justify-between mt-1">
          <StatusBadge label="Owner Portal" variant="brand" />
          <span className="text-[11px] text-[#777777] font-medium">Back Office</span>
        </div>
      </div>

      {/* Nav List */}
      <nav aria-label="Owner Back Office Navigation" className="flex-1 p-3 space-y-1">
        <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#777777]">
          Management Modules
        </div>

        {OWNER_NAV_ITEMS.map((item) => {
          const IconComponent =
            ICON_MAP[item.iconName as keyof typeof ICON_MAP] || LayoutDashboard;
          const isActive = currentSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-semibold transition-all text-left select-none cursor-pointer ${
                isActive
                  ? 'bg-[#C43C1E] text-white shadow-xs'
                  : 'text-[#222222] hover:bg-[#FAF8E8] hover:text-[#C43C1E]'
              }`}
            >
              <IconComponent
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-white' : 'text-[#777777]'
                }`}
              />
              <span className="flex-1 truncate">{item.label}</span>
              {isActive && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-white shrink-0"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer / User Profile & POS Switcher */}
      <div className="p-4 border-t border-[#E8E3C3] bg-[#FAF8E8]/60 space-y-2.5">
        {/* Active Owner Profile Info */}
        {(ownerName || userEmail) && (
          <div className="flex items-center gap-2.5 px-3 py-2 bg-white rounded-lg border border-[#E8E3C3] text-xs">
            <div className="w-6 h-6 rounded-full bg-[#222222] text-white flex items-center justify-center shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#222222] truncate text-xs">
                {ownerName || 'Store Owner'}
              </p>
              {userEmail && (
                <p className="text-[10px] text-[#777777] truncate">
                  {userEmail}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Switch to Staff Terminal */}
        <Link
          href="/staff"
          className="flex items-center justify-between w-full px-3.5 py-2 rounded-lg bg-white border border-[#E8E3C3] text-xs font-semibold text-[#222222] hover:bg-[#FAF8E8] transition-colors"
        >
          <span className="flex items-center gap-2">
            <Store className="w-3.5 h-3.5 text-[#C43C1E]" />
            Switch to Staff POS
          </span>
          <ExternalLink className="w-3 h-3 text-[#777777]" />
        </Link>

        {/* Sign Out Button */}
        <form action={logoutOwnerAction}>
          <button
            type="submit"
            aria-label="Sign out of Owner Portal"
            className="flex items-center justify-center gap-2 w-full px-3.5 py-2 rounded-lg bg-white border border-[#E8E3C3] text-xs font-semibold text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5 text-red-600" />
            <span>Sign Out</span>
          </button>
        </form>

        <div className="px-1 text-[10px] text-[#777777] leading-tight text-center">
          Everytime Creamery • Phase 1 Protected
        </div>
      </div>
    </aside>
  );
}
