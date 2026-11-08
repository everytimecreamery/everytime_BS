'use client';

import React, { useEffect } from 'react';
import { MenuItem } from '@/lib/mock/menu';
import { formatPaise } from '@/lib/pos/calculations';
import { UtensilsCrossed } from 'lucide-react';

interface WaffleOptionsDialogProps {
  isOpen: boolean;
  item: MenuItem | null;
  onClose: () => void;
  onSelectOption: (
    item: MenuItem,
    addOnId: string,
    addOnLabel: string,
    totalPricePaise: number
  ) => void;
}

export function WaffleOptionsDialog({
  isOpen,
  item,
  onClose,
  onSelectOption,
}: WaffleOptionsDialogProps) {
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

  const options = item.addOns || [
    { id: 'scoop-none', label: 'No Scoop', pricePaise: 0 },
    { id: 'scoop-vanilla', label: 'Vanilla Scoop', pricePaise: 6000 },
    { id: 'scoop-chocolate', label: 'Chocolate Scoop', pricePaise: 6000 },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="waffle-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center animate-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-full bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] flex items-center justify-center mx-auto mb-3">
          <UtensilsCrossed className="w-6 h-6" />
        </div>

        <h3 id="waffle-dialog-title" className="text-lg font-bold text-[#222222]">
          {item.name}
        </h3>
        <p className="text-xs text-[#777777] mt-1 mb-5">
          Add a scoop?
        </p>

        {/* Options List */}
        <div className="space-y-3">
          {options.map((opt) => {
            const finalPrice = item.basePricePaise + opt.pricePaise;
            const isNoScoop = opt.pricePaise === 0;

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onSelectOption(item, opt.id, opt.label, finalPrice);
                  onClose();
                }}
                className="w-full h-14 rounded-xl border border-[#E8E3C3] bg-white hover:border-[#C43C1E] hover:bg-[#FAF8E8] transition-all flex items-center justify-between px-5 font-bold text-sm text-[#222222] shadow-2xs group cursor-pointer"
              >
                <div className="text-left">
                  <span className="group-hover:text-[#C43C1E] transition-colors block">
                    {opt.label}
                  </span>
                  {!isNoScoop && (
                    <span className="text-[11px] text-[#777777] font-normal">
                      +₹60 add-on
                    </span>
                  )}
                </div>
                <span className="text-[#C43C1E] tabular-nums font-extrabold">
                  {formatPaise(finalPrice)}
                </span>
              </button>
            );
          })}
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

