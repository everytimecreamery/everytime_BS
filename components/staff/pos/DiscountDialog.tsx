'use client';

import React, { useState, useEffect } from 'react';
import { DiscountConfig, validateDiscountPercent } from '@/lib/pos/calculations';
import { Tag, Info } from 'lucide-react';

interface DiscountDialogProps {
  isOpen: boolean;
  currentDiscount: DiscountConfig;
  onClose: () => void;
  onApplyDiscount: (discount: DiscountConfig) => void;
}

function DiscountDialogModal({
  currentDiscount,
  onClose,
  onApplyDiscount,
}: Omit<DiscountDialogProps, 'isOpen'>) {
  const [selectedType, setSelectedType] = useState<DiscountConfig['type']>(
    currentDiscount.type
  );
  const [customValue, setCustomValue] = useState<string>(
    currentDiscount.type === 'custom' ? currentDiscount.percent.toString() : ''
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleApply = () => {
    if (selectedType === 'none') {
      onApplyDiscount({ type: 'none', percent: 0 });
      onClose();
    } else if (selectedType === 'percent_5') {
      onApplyDiscount({ type: 'percent_5', percent: 5 });
      onClose();
    } else if (selectedType === 'percent_10') {
      onApplyDiscount({ type: 'percent_10', percent: 10 });
      onClose();
    } else if (selectedType === 'custom') {
      const num = parseFloat(customValue);
      const validation = validateDiscountPercent(num);
      if (!validation.isValid) {
        setErrorMessage(
          validation.error || 'Please enter a valid percentage (0 to less than 100)'
        );
        return;
      }
      onApplyDiscount({ type: 'custom', percent: validation.sanitizedPercent });
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="discount-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center animate-in zoom-in-95 duration-150">
        <div className="w-12 h-12 rounded-full bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] flex items-center justify-center mx-auto mb-3">
          <Tag className="w-6 h-6" />
        </div>

        <h3 id="discount-dialog-title" className="text-lg font-bold text-[#222222]">
          Apply Order Discount
        </h3>
        <p className="text-xs text-[#777777] mt-1 mb-4">
          Select standard or custom discount
        </p>

        {/* Prototype notice */}
        <div className="mb-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-[10px] text-[#777777] text-left">
          <Info className="w-3.5 h-3.5 text-[#C43C1E] shrink-0" />
          <span>Discount prototype: Production authorization rules will be confirmed in Phase 3.</span>
        </div>

        {/* Quick Options */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setSelectedType('none');
              setErrorMessage(null);
            }}
            className={`h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${selectedType === 'none'
              ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
              : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
          >
            No Discount
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedType('percent_5');
              setErrorMessage(null);
            }}
            className={`h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${selectedType === 'percent_5'
              ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
              : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
          >
            5% Discount
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedType('percent_10');
              setErrorMessage(null);
            }}
            className={`h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${selectedType === 'percent_10'
              ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
              : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
          >
            10% Discount
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedType('custom');
              setErrorMessage(null);
            }}
            className={`h-11 rounded-xl text-xs font-bold border transition-all cursor-pointer ${selectedType === 'custom'
              ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
              : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
          >
            Custom %
          </button>
        </div>

        {/* Custom Input */}
        {selectedType === 'custom' && (
          <div className="mb-4 text-left">
            <label htmlFor="custom-discount-input" className="block text-xs font-bold text-[#222222] mb-1.5">
              Enter Percentage (0 to below 100):
            </label>
            <div className="relative">
              <input
                id="custom-discount-input"
                type="number"
                min="0"
                max="99.99"
                step="0.5"
                value={customValue}
                onChange={(e) => {
                  setCustomValue(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. 15"
                className="w-full h-11 px-3 pr-8 rounded-xl border border-[#E8E3C3] text-sm text-[#222222] focus:outline-none focus:border-[#C43C1E] focus:ring-2 focus:ring-[#C43C1E]/20"
              />
              <span className="absolute inset-y-0 right-3 flex items-center text-sm font-bold text-[#777777]">
                %
              </span>
            </div>
            {errorMessage && (
              <p className="text-[11px] font-semibold text-[#C43C1E] mt-1.5">
                {errorMessage}
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="flex-1 h-11 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-colors shadow-xs cursor-pointer"
          >
            Apply Discount
          </button>
        </div>
      </div>
    </div>
  );
}

export function DiscountDialog({
  isOpen,
  currentDiscount,
  onClose,
  onApplyDiscount,
}: DiscountDialogProps) {
  if (!isOpen) return null;
  return (
    <DiscountDialogModal
      currentDiscount={currentDiscount}
      onClose={onClose}
      onApplyDiscount={onApplyDiscount}
    />
  );
}
