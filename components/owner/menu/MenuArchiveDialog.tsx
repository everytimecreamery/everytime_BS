'use client';

import React, { useState } from 'react';
import { setMenuItemArchivedAction, setCategoryArchivedAction } from '@/app/actions/menu';
import { Archive, RotateCcw, AlertTriangle, X } from 'lucide-react';

interface MenuArchiveDialogProps {
  isOpen: boolean;
  type: 'item' | 'category';
  target: any | null;
  action: 'archive' | 'restore';
  onClose: () => void;
  onSuccess: () => void;
}

export function MenuArchiveDialog({
  isOpen,
  type,
  target,
  action,
  onClose,
  onSuccess,
}: MenuArchiveDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !target) return null;

  const isItem = type === 'item';
  const name = isItem ? target.name : target.label;
  const isArchive = action === 'archive';

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = isItem
        ? await setMenuItemArchivedAction(target.id, isArchive)
        : await setCategoryArchivedAction(target.id, isArchive);

      if (!res.success) {
        setErrorMessage(res.error || 'Operation failed.');
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected exception occurred.');
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${isArchive ? 'Archive' : 'Restore'} ${name}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-md shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isArchive
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
            }`}
          >
            {isArchive ? <Archive className="w-5 h-5" /> : <RotateCcw className="w-5 h-5" />}
          </div>
          <div>
            <h3 className="text-sm font-black text-[#222222]">
              {isArchive ? `Archive ${isItem ? 'Product' : 'Category'}` : `Restore ${isItem ? 'Product' : 'Category'}`}: {name}?
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              {isItem ? 'Menu Product' : 'Category Section'}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMessage}</span>
          </div>
        )}

        {isArchive ? (
          <div className="text-xs text-[#555555] bg-amber-50/70 p-3.5 rounded-xl border border-amber-200 leading-relaxed space-y-1.5">
            <div className="font-bold text-amber-950 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
              <span>Safe Soft Archive</span>
            </div>
            <p>
              {isItem
                ? 'Item disappears from the staff grid. Past orders and reports are unaffected.'
                : 'Category disappears from the staff sidebar. All historical orders remain intact.'}
            </p>
            <p className="text-[11px] text-[#777777]">
              Archived items can be restored at any time from the "Archived" tab.
            </p>
          </div>
        ) : (
          <div className="text-xs text-[#555555] bg-emerald-50/70 p-3.5 rounded-xl border border-emerald-200 leading-relaxed">
            Restoring will make this {isItem ? 'item' : 'category'} available for sale again on the staff POS terminal.
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#E8E3C3]">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className={`px-5 py-2 rounded-xl text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer ${
              isArchive
                ? 'bg-amber-700 hover:bg-amber-800'
                : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            {isSubmitting
              ? isArchive
                ? 'Archiving...'
                : 'Restoring...'
              : isArchive
              ? 'Archive'
              : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}
