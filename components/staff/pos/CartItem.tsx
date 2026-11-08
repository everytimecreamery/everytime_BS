'use client';

import React from 'react';
import { POSCartItem } from '@/lib/pos/cart';
import { formatPaise } from '@/lib/pos/calculations';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface CartItemProps {
  item: POSCartItem;
  onIncrease: (lineId: string) => void;
  onDecrease: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

export function CartItem({ item, onIncrease, onDecrease, onRemove }: CartItemProps) {
  return (
    <div
      role="listitem"
      aria-label={`${item.quantity}x ${item.productName}`}
      className="p-3.5 bg-white rounded-xl border border-[#E8E3C3] shadow-2xs hover:border-[#D8D1A8] transition-all space-y-2.5"
    >
      {/* Top row: Name, variant badges & Remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h5 className="text-sm font-bold text-[#222222] leading-snug">
              {item.productName}
            </h5>
            {item.variantLabel && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                {item.variantLabel}
              </span>
            )}
            {item.addOnLabel && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200">
                + {item.addOnLabel}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.lineId)}
          aria-label={`Remove ${item.productName} from cart`}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#C43C1E] hover:bg-[#FAF8E8] transition-colors shrink-0 cursor-pointer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom row: Unit price, Stepper controls, and Line total */}
      <div className="pt-2 border-t border-[#FAF8E8] flex items-center justify-between">
        <div className="text-xs text-[#777777]">
          <span className="tabular-nums font-semibold text-[#222222]">
            {formatPaise(item.unitPricePaise)}
          </span>
          <span className="text-[10px] text-[#777777] block">per item</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Stepper */}
          <div className="flex items-center gap-1 bg-[#FAF8E8] border border-[#E8E3C3] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onDecrease(item.lineId)}
              aria-label={`Decrease quantity of ${item.productName}`}
              className="w-7 h-7 rounded-md bg-white border border-[#E8E3C3] flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] transition-colors cursor-pointer"
            >
              <Minus className="w-3 h-3" />
            </button>

            <span className="w-7 text-center text-xs font-bold tabular-nums text-[#222222]">
              {item.quantity}
            </span>

            <button
              type="button"
              onClick={() => onIncrease(item.lineId)}
              aria-label={`Increase quantity of ${item.productName}`}
              className="w-7 h-7 rounded-md bg-white border border-[#E8E3C3] flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          {/* Line Total */}
          <span className="text-sm font-extrabold text-[#222222] tabular-nums min-w-[65px] text-right">
            {formatPaise(item.lineTotalPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}

