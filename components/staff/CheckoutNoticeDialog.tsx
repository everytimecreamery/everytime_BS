'use client';

import React, { useEffect } from 'react';
import { ShieldAlert, X, CreditCard, ArrowRight } from 'lucide-react';
import { formatPaise } from '@/lib/cart/pricing';

interface CheckoutNoticeDialogProps {
  isOpen: boolean;
  totalPaise: number;
  itemCount: number;
  onClose: () => void;
}

export function CheckoutNoticeDialog({
  isOpen,
  totalPaise,
  itemCount,
  onClose,
}: CheckoutNoticeDialogProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-notice-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-3xl border border-[#E8E3C3] w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-[#E8E3C3] bg-[#FAF8E8]/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center border border-amber-200">
              <ShieldAlert className="w-5 h-5 text-[#C43C1E]" />
            </div>
            <div>
              <h3 id="checkout-notice-title" className="text-base font-bold text-[#222222]">
                Phase 1 Prototype Boundary
              </h3>
              <p className="text-xs text-[#777777]">Payment & Tokens Not Available</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close notice"
            className="w-8 h-8 rounded-lg border border-[#E8E3C3] bg-white flex items-center justify-center text-[#777777] hover:text-[#222222]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          <div className="p-4 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-between">
            <div>
              <span className="text-xs text-[#777777] font-medium block">
                Current Ticket Total ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </span>
              <span className="text-2xl font-black text-[#222222] tabular-nums">
                {formatPaise(totalPaise)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#E8E3C3] text-xs font-semibold text-[#777777]">
              <CreditCard className="w-4 h-4 text-[#C43C1E]" />
              <span>Simulated POS</span>
            </div>
          </div>

          <div className="space-y-2 text-xs text-[#777777] leading-relaxed">
            <p>
              In accordance with <strong>Phase 1 specifications</strong>, this interface operates with local mock data only.
            </p>
            <p className="bg-amber-50/70 border border-amber-200/60 p-3 rounded-xl text-amber-900">
              <strong>Explicitly Excluded:</strong> Cash drawer integration, card POS terminal connection, dynamic UPI QR codes, receipt printing, and persistent order token generation are scheduled for <strong>Phase 4</strong>.
            </p>
            <p>
              No real financial transaction has occurred or will be recorded.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-[#E8E3C3] bg-[#FAF8E8]/70 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-11 px-6 rounded-xl bg-[#222222] hover:bg-[#333333] text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-2"
          >
            <span>Return to Order Ticket</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

