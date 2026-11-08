'use client';

import React from 'react';
import { CartLineItem } from '@/lib/cart/cart-types';
import { formatPaise } from '@/lib/cart/pricing';
import { Plus, Minus, Trash2 } from 'lucide-react';

interface CartItemProps {
  item: CartLineItem;
  onIncrease: (lineId: string) => void;
  onDecrease: (lineId: string) => void;
  onRemove: (lineId: string) => void;
}

export function CartItem({ item, onIncrease, onDecrease, onRemove }: CartItemProps) {
  const flavors = item.configuration?.flavors || [];
  const size = item.configuration?.size;

  return (
    <div
      role="listitem"
      aria-label={`${item.quantity}x ${item.productName}`}
      className="p-3.5 bg-white rounded-xl border border-[#E8E3C3] shadow-2xs hover:border-[#D8D1A8] transition-all space-y-2.5"
    >
      {/* Top row: Name & Remove */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h5 className="text-sm font-bold text-[#222222] leading-snug">
              {item.productName}
            </h5>
            {size && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                {size}
              </span>
            )}
          </div>

          {/* Flavors list */}
          {flavors.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {flavors.map((flavor, idx) => (
                <span
                  key={`${flavor.id}-${idx}`}
                  className="inline-flex items-center text-[11px] font-medium text-[#777777] bg-[#FAF8E8] px-2 py-0.5 rounded-md border border-[#E8E3C3]"
                >
                  {flavor.name}
                </span>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.productName} from cart`}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#C43C1E] hover:bg-[#FAF8E8] transition-colors shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Bottom row: Unit price, Quantity controls, and Line total */}
      <div className="pt-2 border-t border-[#FAF8E8] flex items-center justify-between">
        <div className="text-xs text-[#777777]">
          <span className="tabular-nums">{formatPaise(item.unitPricePaise)}</span>
          <span className="text-[10px] text-[#777777]/80 block">per item</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Stepper */}
          <div className="flex items-center gap-1 bg-[#FAF8E8] border border-[#E8E3C3] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => onDecrease(item.id)}
              disabled={item.quantity <= 1}
              aria-label={`Decrease quantity of ${item.productName}`}
              className="w-7 h-7 rounded-md bg-white border border-[#E8E3C3] flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Minus className="w-3 h-3" />
            </button>

            <span className="w-7 text-center text-xs font-bold tabular-nums text-[#222222]">
              {item.quantity}
            </span>

            <button
              type="button"
              onClick={() => onIncrease(item.id)}
              aria-label={`Increase quantity of ${item.productName}`}
              className="w-7 h-7 rounded-md bg-white border border-[#E8E3C3] flex items-center justify-center text-[#222222] hover:bg-[#FAF8E8] transition-colors"
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

