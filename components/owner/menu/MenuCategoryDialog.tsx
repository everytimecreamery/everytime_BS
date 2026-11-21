'use client';

import React, { useState, useEffect } from 'react';
import {
  CategoryPayload,
  saveCategory,
  APPROVED_LUCIDE_ICONS,
  ApprovedLucideIcon,
} from '@/lib/supabase/menu';
import {
  X,
  Layers,
  Flame,
  IceCream,
  Cherry,
  UtensilsCrossed,
  CupSoda,
  Milk,
  Package,
  Coffee,
  Sparkles,
  Tag,
  Box,
  Heart,
  Smile,
  Star,
  Info,
} from 'lucide-react';

const ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  Flame,
  Layers,
  IceCream,
  Cherry,
  UtensilsCrossed,
  CupSoda,
  Milk,
  Package,
  Coffee,
  Sparkles,
  Tag,
  Box,
  Heart,
  Smile,
  Star,
};

interface MenuCategoryDialogProps {
  isOpen: boolean;
  category: any | null; // null for Create, object for Edit
  onClose: () => void;
  onSaved: () => void;
}

export function MenuCategoryDialog({
  isOpen,
  category,
  onClose,
  onSaved,
}: MenuCategoryDialogProps) {
  const [label, setLabel] = useState('');
  const [iconName, setIconName] = useState<ApprovedLucideIcon>('IceCream');
  const [sortOrder, setSortOrder] = useState<number>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setLabel(category.label || '');
      setIconName((category.icon_name as ApprovedLucideIcon) || 'IceCream');
      setSortOrder(category.sort_order ?? 10);
      setErrorMessage(null);
    } else {
      setLabel('');
      setIconName('IceCream');
      setSortOrder(10);
      setErrorMessage(null);
    }
  }, [category, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const trimmedLabel = label.trim();
    if (!trimmedLabel) {
      setErrorMessage('Please provide a category label.');
      setIsSubmitting(false);
      return;
    }

    const payload: CategoryPayload = {
      id: category?.id,
      label: trimmedLabel,
      icon_name: iconName,
      sort_order: sortOrder,
    };

    const res = await saveCategory(payload);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to save category.');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSaved();
    onClose();
  };

  const SelectedIcon = ICON_COMPONENTS[iconName] || IceCream;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={category ? 'Edit Category' : 'New Category'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-md shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#222222] tracking-tight">
                {category ? `Edit Category: ${category.label}` : 'Create Category'}
              </h2>
              <p className="text-xs text-[#777777]">
                Master Catalog Organization
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">
              Category Label <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Sorbets & Popsicles"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">
              Display Sort Order
            </label>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
            />
            <span className="text-[10.5px] text-[#777777] mt-0.5 block">
              Lower numbers appear first on the staff counter sidebar.
            </span>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1.5">
              Select Icon (Approved Brand Symbols)
            </label>
            <div className="grid grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1 border border-[#E8E3C3] rounded-xl bg-[#FAF8E8]/30">
              {APPROVED_LUCIDE_ICONS.map((ic) => {
                const IconComp = ICON_COMPONENTS[ic] || IceCream;
                const isSelected = iconName === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIconName(ic)}
                    className={`p-2 rounded-lg border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#C43C1E] bg-[#FAF8E8] text-[#C43C1E] shadow-xs'
                        : 'border-transparent text-[#777777] hover:bg-white hover:text-[#222222]'
                    }`}
                  >
                    <IconComp className="w-4 h-4" />
                    <span className="text-[9px] font-semibold truncate max-w-[50px]">{ic}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview */}
          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between text-xs">
            <span className="text-[#777777]">Sidebar Preview:</span>
            <div className="flex items-center gap-2 font-bold text-[#222222]">
              <SelectedIcon className="w-4 h-4 text-[#C43C1E]" />
              <span>{label || 'Category Label'}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-[#E8E3C3]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving...' : category ? 'Save Changes' : 'Create Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
