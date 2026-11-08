'use client';

import React, { useEffect } from 'react';
import { MenuItem } from '@/lib/mock/menu';
import { formatPaise } from '@/lib/pos/calculations';
import { Coffee, AlertCircle } from 'lucide-react';

interface HotChocolateDialogProps {
  isOpen: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onSelectOption: (
    item: MenuItem,
    variantId: string,
    variantLabel: string,
    pricePaise: number
  ) => void;
}

/**
 * NOTE FOR BUSINESS OWNER:
 * The menu lists Hot Chocolate at ₹79 / ₹149 without specifying whether these represent
 * sizes (e.g., Regular / Large), milk vs water preparations, or single vs double shot.
 * Until approved by the owner, they are presented as Option 1 and Option 2.
 */
export function HotChocolateDialog({
  isOpen,
  item,
  onClose,
  onSelectOption,
}: HotChocolateDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const variants = item.variants || [
    { id: 'option-1', label: 'Option 1', pricePaise: 7900 },
    { id: 'option-2', label: 'Option 2', pricePaise: 14900 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="hot-choc-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center animate-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-full bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] flex items-center justify-center mx-auto mb-3">
          <Coffee className="w-6 h-6" />
        </div>

        <h3 id="hot-choc-dialog-title" className="text-lg font-bold text-[#222222]">
          {item.name}
        </h3>
        <p className="text-xs text-[#777777] mt-1 mb-2">
          Select price option
        </p>

        {/* Business Clarification Warning Notice */}
        <div className="mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-[11px] text-[#777777] text-left">
          <AlertCircle className="w-3.5 h-3.5 text-[#C43C1E] shrink-0" />
          <span>Awaiting owner confirmation on exact option meanings.</span>
        </div>

        {/* Options List */}
        <div className="space-y-3">
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => {
                onSelectOption(item, v.id, v.label, v.pricePaise);
                onClose();
              }}
              className="w-full h-14 rounded-xl border border-[#E8E3C3] bg-white hover:border-[#C43C1E] hover:bg-[#FAF8E8] transition-all flex items-center justify-between px-5 font-bold text-sm text-[#222222] shadow-2xs group cursor-pointer"
            >
              <span className="group-hover:text-[#C43C1E] transition-colors">{v.label}</span>
              <span className="text-[#C43C1E] tabular-nums font-extrabold">{formatPaise(v.pricePaise)}</span>
            </button>
          ))}
        </div>

        {/* Cancel Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-4 h-11 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
}

