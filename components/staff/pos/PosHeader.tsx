'use client';

import React from 'react';
import Link from 'next/link';
import { BrandLogo } from '@/components/shared/BrandLogo';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { OrderStatus } from '@/lib/pos/order';
import { Plus, ArrowLeftRight, History } from 'lucide-react';

interface PosHeaderProps {
  activeOrderToken: string;
  activeOrderStatus: OrderStatus;
  onNewOrder: () => void;
  onOpenOrderHistory?: () => void;
  staffName?: string;
}

export function PosHeader({
  activeOrderToken,
  activeOrderStatus,
  onNewOrder,
  onOpenOrderHistory,
  staffName = 'Alex M.',
}: PosHeaderProps) {
  // Status visual badge styling (Only Processing and Completed)
  const statusConfig = {
    PROCESSING: {
      label: 'PROCESSING',
      classes: 'bg-amber-100 text-amber-900 border-amber-300',
      dotClass: 'bg-amber-500',
    },
    COMPLETED: {
      label: 'COMPLETED',
      classes: 'bg-emerald-100 text-emerald-900 border-emerald-300',
      dotClass: 'bg-emerald-500',
    },
  }[activeOrderStatus] || {
    label: 'PROCESSING',
    classes: 'bg-amber-100 text-amber-900 border-amber-300',
    dotClass: 'bg-amber-500',
  };

  return (
      <header className="h-13 sm:h-14 bg-white border-b border-[#E8E3C3] px-3 sm:px-5 flex items-center justify-between shadow-2xs shrink-0 select-none">
        {/* 1. Left: Brand & Terminal Identification */}
        <div className="flex items-center gap-3">
              <BrandLogo size="md" href="/" />
              <div className="hidden lg:block h-5 w-px bg-[#E8E3C3]" />
              <div className="hidden lg:flex items-center gap-2">
                <StatusBadge label="Staff Counter Terminal" variant="brand" />
                <span className="text-xs text-[#777777] font-semibold">
                  Terminal #01 · {staffName}
                </span>
              </div>
          </div>

            {/* 2. Center: Active Order Indicator & Status */}
            <div className="flex items-center gap-2">
              <div
                role="status"
                aria-label={`Active Order ${activeOrderToken} ${statusConfig.label}`}
                className="flex items-center gap-2 px-3 py-1 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]"
              >
                <span className="hidden sm:inline text-xs font-bold text-[#777777] uppercase tracking-wider">
                  ACTIVE ORDER —
                </span>
                <span className="text-xs sm:text-sm font-black text-[#222222] tracking-tight">
                  {activeOrderToken}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border ${statusConfig.classes}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${statusConfig.dotClass}`} />
                  <span>{statusConfig.label}</span>
                </span>
              </div>
            </div>

              {/* 3. Right: New Order, Order History, Portal Link */}
              <div className="flex items-center gap-2 sm:gap-2.5">
                <button
                  type="button"
                  onClick={onNewOrder}
                  aria-label="+ New Order"
                  className="h-9 px-3.5 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-black tracking-wide flex items-center gap-1.5 transition-all shadow-xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C43C1E] active:scale-95 shrink-0"
                >
                  <Plus className="w-4 h-4 stroke-[3]" />
                  <span>+ New Order</span>
                </button>

                <button
                  type="button"
                  onClick={onOpenOrderHistory}
                  aria-label="Order History"
                  className="h-9 px-3 rounded-xl bg-white hover:bg-[#FAF8E8] border border-[#E8E3C3] hover:border-[#C43C1E]/50 text-[#222222] text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C43C1E] active:scale-95 shrink-0"
                >
                  <History className="w-4 h-4 text-[#C43C1E]" />
                  <span className="hidden sm:inline">Order History</span>
                  <span className="sm:hidden">History</span>
                </button>

                <Link
                  href="/"
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-medium text-[#222222] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C43C1E]"
                  title="Switch Portal"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[#777777]" />
                  <span className="hidden xl:inline">Portals</span>
                </Link>
              </div>
            </header>
            );
}
