import React from 'react';
import { ShoppingBag, Trash2, PauseCircle, Tag, ArrowRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

export function StaffCartPlaceholder() {
  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-[#E8E3C3] shadow-xs overflow-hidden">
      {/* Cart Top Bar */}
      <div className="p-4 border-b border-[#E8E3C3] flex items-center justify-between bg-[#FAF8E8]/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#C43C1E]/10 flex items-center justify-center text-[#C43C1E]">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#222222]">Current Ticket</h3>
            <p className="text-[11px] text-[#777777]">Token Sequence: Pending</p>
          </div>
        </div>

        {/* Quick Cart Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            className="p-2 rounded-lg text-[#777777] hover:bg-[#FAF8E8] disabled:opacity-40 border border-[#E8E3C3]"
            title="Hold Ticket (Phase 1)"
          >
            <PauseCircle className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled
            className="p-2 rounded-lg text-[#777777] hover:bg-[#FAF8E8] disabled:opacity-40 border border-[#E8E3C3]"
            title="Add Discount (Phase 3)"
          >
            <Tag className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled
            className="p-2 rounded-lg text-[#C43C1E] hover:bg-[#C43C1E]/10 disabled:opacity-40 border border-[#E8E3C3]"
            title="Clear Cart (Phase 1)"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cart Items Placeholder Area */}
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mb-3">
          <ShoppingBag className="w-6 h-6" />
        </div>
        <h4 className="text-sm font-bold text-[#222222]">Order Ticket Empty</h4>
        <p className="text-xs text-[#777777] max-w-[220px] mt-1">
          Items selected from the menu grid will display here with flavor combinations and modifiers.
        </p>
        <span className="mt-4 px-2.5 py-1 rounded-full bg-[#FAF8E8] text-[11px] font-semibold text-[#777777] border border-[#E8E3C3]">
          Phase 0 Cart Foundation
        </span>
      </div>

      {/* Billing Summary Preview */}
      <div className="p-4 bg-[#FAF8E8]/70 border-t border-[#E8E3C3] space-y-2">
        <div className="flex justify-between text-xs text-[#777777]">
          <span>Subtotal</span>
          <span className="font-semibold text-[#222222] tabular-nums">{formatCurrency(0)}</span>
        </div>
        <div className="flex justify-between text-xs text-[#777777]">
          <span>Taxes (Estimated)</span>
          <span className="font-semibold text-[#222222] tabular-nums">{formatCurrency(0)}</span>
        </div>
        <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline">
          <span className="text-sm font-bold text-[#222222]">Total Due</span>
          <span className="text-xl font-extrabold text-[#C43C1E] tabular-nums">{formatCurrency(0)}</span>
        </div>

        {/* Primary Pay Action */}
        <button
          type="button"
          disabled
          className="w-full mt-3 h-12 rounded-lg bg-[#C43C1E] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-sm opacity-60 cursor-not-allowed select-none"
        >
          <span>Charge & Generate Token</span>
          <ArrowRight className="w-4 h-4" />
        </button>
        <p className="text-[10px] text-center text-[#777777]">
          Payment processing & token issuance unlocks in Phase 4
        </p>
      </div>
    </div>
  );
}

