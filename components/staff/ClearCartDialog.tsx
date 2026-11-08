'use client';

import React, { useEffect } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';

interface ClearCartDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmClear: () => void;
}

export function ClearCartDialog({
  isOpen,
  onClose,
  onConfirmClear,
}: ClearCartDialogProps) {
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
      aria-labelledby="clear-cart-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-sm shadow-2xl overflow-hidden p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-red-50 text-[#C43C1E] border border-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 id="clear-cart-title" className="text-lg font-bold text-[#222222]">
          Clear Current Ticket?
        </h3>
        <p className="text-xs text-[#777777] mt-2 leading-relaxed">
          All items on this order ticket will be permanently removed. This action cannot be undone.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-11 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirmClear();
              onClose();
            }}
            className="flex-1 h-11 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Ticket</span>
          </button>
        </div>
      </div>
    </div>
  );
}
