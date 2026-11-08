'use client';

import React from 'react';
import { formatPaise } from '@/lib/cart/pricing';
import { ArrowRight, Info } from 'lucide-react';

interface CartSummaryProps {
  subtotalPaise: number;
  estimatedTaxPaise: number;
  totalPaise: number;
  itemCount: number;
  onCheckout: () => void;
}

export function CartSummary({
  subtotalPaise,
  estimatedTaxPaise,
  totalPaise,
  itemCount,
  onCheckout,
}: CartSummaryProps) {
  const isCartEmpty = itemCount === 0;

  return (
    <div className="p-4 bg-[#FAF8E8]/80 border-t border-[#E8E3C3] space-y-2.5">
      {/* Subtotal */}
      <div className="flex justify-between text-xs text-[#777777]">
        <span>Subtotal</span>
        <span className="font-semibold text-[#222222] tabular-nums">
          {formatPaise(subtotalPaise)}
        </span>
      </div>

      {/* Mock Tax estimate */}
      <div className="flex justify-between text-xs text-[#777777]">
        <span className="flex items-center gap-1">
          <span>Taxes (Estimated Mock 5%)</span>
        </span>
        <span className="font-semibold text-[#222222] tabular-nums">
          {formatPaise(estimatedTaxPaise)}
        </span>
      </div>

      {/* Total Due */}
      <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline">
        <div>
          <span className="text-sm font-bold text-[#222222]">Estimated Total</span>
          <span className="text-[10px] text-[#777777] block font-normal">
            ({itemCount} {itemCount === 1 ? 'item' : 'items'})
          </span>
        </div>
        <span className="text-2xl font-black text-[#C43C1E] tabular-nums">
          {formatPaise(totalPaise)}
        </span>
      </div>

      {/* Phase 1 development label */}
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-[#E8E3C3] text-[10px] text-[#777777]">
        <Info className="w-3.5 h-3.5 text-[#C43C1E] shrink-0" />
        <span>Phase 1 Mock Pricing. Production GST & rounding will be finalized in Phase 3.</span>
      </div>

      {/* Primary Pay Action */}
      <button
        type="button"
        disabled={isCartEmpty}
        onClick={onCheckout}
        className="w-full mt-2 h-12 rounded-xl bg-[#C43C1E] text-white font-bold text-sm flex items-center justify-center gap-2 shadow-xs hover:bg-[#AB3419] transition-all disabled:opacity-40 disabled:cursor-not-allowed select-none cursor-pointer"
      >
        <span>Charge & Generate Token</span>
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-[10px] text-center text-[#777777]">
        Payment processing & token issuance unlocks in Phase 4
      </p>
    </div>
  );
}

