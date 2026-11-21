'use client';

import React, { useState, useEffect } from 'react';
import {
  MenuItemPayload,
  MenuVariantPayload,
  saveMenuItem,
  deriveInteractionType,
} from '@/lib/supabase/menu';
import { paiseToRupees, rupeesToPaise, formatPaise } from '@/lib/pos/calculations';
import { X, Plus, Trash2, Info, Sparkles, Star, Layers, IceCream } from 'lucide-react';

interface MenuItemFormDialogProps {
  isOpen: boolean;
  categories: any[];
  item: any | null; // null for Create, object for Edit
  onClose: () => void;
  onSaved: () => void;
}

export function MenuItemFormDialog({
  isOpen,
  categories,
  item,
  onClose,
  onSaved,
}: MenuItemFormDialogProps) {
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [portionGrams, setPortionGrams] = useState(85);
  const [isPremium, setIsPremium] = useState(false);
  const [isFrequent, setIsFrequent] = useState(false);
  const [description, setDescription] = useState('');
  const [variants, setVariants] = useState<MenuVariantPayload[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setName(item.name || '');
      setCategoryId(item.category_id || categories[0]?.id || 'gelato');
      setPriceRupees(String(paiseToRupees(item.base_price_paise || 9900)));
      setPortionGrams(item.portion_grams || 85);
      setIsPremium(Boolean(item.is_premium));
      setIsFrequent(Boolean(item.is_frequent));
      setDescription(item.description || '');

      const existingVariants = (item.menu_variants || []).map((v: any) => ({
        id: v.id,
        label: v.label,
        price_paise: v.price_paise,
        volume_ml: v.volume_ml,
        is_archived: v.is_archived,
      }));
      setVariants(existingVariants);
      setErrorMessage(null);
    } else {
      setName('');
      setCategoryId(categories.find((c) => c.id !== 'frequent')?.id || 'gelato');
      setPriceRupees('99');
      setPortionGrams(85);
      setIsPremium(false);
      setIsFrequent(false);
      setDescription('');
      setVariants([]);
      setErrorMessage(null);
    }
  }, [item, categories, isOpen]);

  if (!isOpen) return null;

  const isGelatoCategory = categoryId === 'gelato';
  const effectiveVariants = isGelatoCategory ? [] : variants.filter((v) => !v.is_archived);
  const interactionType = deriveInteractionType(categoryId, effectiveVariants.length);

  const handleAddVariant = () => {
    setVariants((prev) => [
      ...prev,
      {
        label: '',
        price_paise: rupeesToPaise(parseFloat(priceRupees) || 99),
        volume_ml: null,
        is_archived: false,
      },
    ]);
  };

  const handleUpdateVariant = (index: number, updates: Partial<MenuVariantPayload>) => {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleRemoveVariant = (index: number) => {
    setVariants((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    const numRupees = parseFloat(priceRupees);
    if (!numRupees || numRupees <= 0) {
      setErrorMessage('Please enter a valid base price greater than ₹0.');
      setIsSubmitting(false);
      return;
    }

    const payload: MenuItemPayload = {
      id: item?.id,
      name: name.trim(),
      category_id: categoryId,
      base_price_paise: rupeesToPaise(numRupees),
      portion_grams: isGelatoCategory ? 85 : portionGrams,
      is_premium: isPremium,
      is_frequent: isFrequent,
      description: description.trim() || null,
      variants: isGelatoCategory ? [] : variants,
    };

    const res = await saveMenuItem(payload);
    if (!res.success) {
      setErrorMessage(res.error || 'Failed to save menu item');
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    onSaved();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item ? 'Edit Menu Item' : 'New Menu Item'}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
              <IceCream className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#222222] tracking-tight">
                {item ? `Edit: ${item.name}` : 'Create Menu Item'}
              </h2>
              <p className="text-xs text-[#777777]">
                Master Menu Catalog • Supabase Source of Truth
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Name & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">
                Item Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Madagascar Vanilla"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 cursor-pointer"
              >
                {categories
                  .filter((c) => c.id !== 'frequent' && !c.is_archived)
                  .map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label} ({cat.id})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Price & Portion */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">
                Base Price (₹ Rupees) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#777777]">₹</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="99"
                  value={priceRupees}
                  onChange={(e) => setPriceRupees(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-black text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
                />
              </div>
              <div className="text-[10.5px] text-[#777777] mt-0.5">
                Saved as integer paise ({rupeesToPaise(parseFloat(priceRupees) || 0)} paise)
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">Portion Weight (grams)</label>
              <input
                type="number"
                disabled={isGelatoCategory}
                value={isGelatoCategory ? 85 : portionGrams}
                onChange={(e) => setPortionGrams(parseInt(e.target.value, 10) || 85)}
                className={`w-full px-3 py-2 rounded-xl border border-[#E8E3C3] text-xs font-bold ${
                  isGelatoCategory ? 'bg-zinc-100 text-zinc-500 cursor-not-allowed' : 'bg-white text-[#222222]'
                }`}
              />
              {isGelatoCategory && (
                <div className="text-[10.5px] text-amber-700 mt-0.5">
                  Locked to 85g single scoop for artisan gelato (Invariant 2)
                </div>
              )}
            </div>
          </div>

          {/* Flags: Premium & Frequent */}
          <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-[#FAF8E8]/60 border border-[#E8E3C3]">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#222222]">
              <input
                type="checkbox"
                checked={isPremium}
                onChange={(e) => setIsPremium(e.target.checked)}
                className="w-4 h-4 rounded text-[#C43C1E] focus:ring-[#C43C1E]"
              />
              <span className="flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>Premium Flavor</span>
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#222222]">
              <input
                type="checkbox"
                checked={isFrequent}
                onChange={(e) => setIsFrequent(e.target.checked)}
                className="w-4 h-4 rounded text-[#C43C1E] focus:ring-[#C43C1E]"
              />
              <span className="flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#C43C1E]" />
                <span>Show in Frequent View</span>
              </span>
            </label>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">Description / Notes (Optional)</label>
            <textarea
              rows={2}
              placeholder="e.g. Pure Bourbon vanilla bean with rich creamy custard base..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 resize-none"
            />
          </div>

          {/* Variants Section (Only non-gelato categories) */}
          {!isGelatoCategory ? (
            <div className="border-t border-[#E8E3C3] pt-3">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="text-xs font-bold text-[#222222]">Size & Add-on Variants</div>
                  <div className="text-[10.5px] text-[#777777]">
                    Tubs (250ml/500ml), hot chocolates, waffle pairings.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-2.5 py-1 rounded-lg border border-[#E8E3C3] bg-[#FAF8E8] text-[#C43C1E] hover:bg-[#C43C1E] hover:text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Variant</span>
                </button>
              </div>

              {effectiveVariants.length === 0 ? (
                <div className="text-center py-4 bg-zinc-50 rounded-xl border border-dashed border-zinc-200 text-xs text-[#777777]">
                  No variants defined. This item uses <strong>Direct Add</strong> (one-tap counter add).
                </div>
              ) : (
                <div className="space-y-2">
                  {variants.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-[#E8E3C3] bg-[#FAF8E8]/30"
                    >
                      <input
                        type="text"
                        placeholder="Label (e.g. 250ml)"
                        value={v.label}
                        onChange={(e) => handleUpdateVariant(idx, { label: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222]"
                      />
                      <div className="relative w-24">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-[#777777]">₹</span>
                        <input
                          type="number"
                          placeholder="Price"
                          value={paiseToRupees(v.price_paise)}
                          onChange={(e) =>
                            handleUpdateVariant(idx, {
                              price_paise: rupeesToPaise(parseFloat(e.target.value) || 0),
                            })
                          }
                          className="w-full pl-5 pr-2 py-1.5 rounded-lg border border-[#E8E3C3] bg-white text-xs font-black text-[#222222]"
                        />
                      </div>
                      <input
                        type="number"
                        placeholder="Volume ml"
                        value={v.volume_ml || ''}
                        onChange={(e) =>
                          handleUpdateVariant(idx, {
                            volume_ml: e.target.value ? parseInt(e.target.value, 10) : null,
                          })
                        }
                        className="w-20 px-2 py-1.5 rounded-lg border border-[#E8E3C3] bg-white text-xs text-[#222222]"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveVariant(idx)}
                        className="p-1.5 text-zinc-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-center gap-2">
              <Info className="w-4 h-4 text-blue-700 shrink-0" />
              <span>
                <strong>Direct Add Active:</strong> Gelato flavors are locked to an 85g portion and single base price.
              </span>
            </div>
          )}

          {/* Interaction Summary Banner */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-xs">
            <span className="text-[#777777]">Derived Add Mode:</span>
            <span className="font-bold text-[#222222] bg-white px-2.5 py-0.5 rounded-md border border-zinc-200">
              {interactionType === 'direct' ? 'Direct Add (One-Tap)' : 'Options Dialog Mode'}
            </span>
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
              {isSubmitting ? 'Saving...' : item ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
