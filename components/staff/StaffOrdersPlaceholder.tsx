import React from 'react';
import { History, Receipt, ArrowUpRight } from 'lucide-react';

export function StaffOrdersPlaceholder() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#222222] shrink-0">
          <History className="w-5 h-5 text-[#C43C1E]" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-[#222222]">
            Recent Orders & Shift Audit
          </h4>
          <p className="text-xs text-[#777777]">
            Previous orders, receipt re-prints, and counter corrections will appear here (Phase 5).
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-semibold text-[#222222]">
          <Receipt className="w-3.5 h-3.5 text-[#C43C1E]" />
          <span>Active Shift: 0 Orders</span>
        </div>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-[#777777] border border-[#E8E3C3] bg-white opacity-50 cursor-not-allowed"
        >
          <span>History</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

