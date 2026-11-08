'use client';

import React from 'react';
import { Flavor } from '@/lib/mock-data/flavors';
import { CartFlavorSelection } from '@/lib/cart/cart-types';
import { X, Check, Sparkles } from 'lucide-react';

interface FlavorSelectorProps {
  flavors: Flavor[];
  selectedFlavors: CartFlavorSelection[];
  requiredCount: number;
  onAddFlavor: (flavor: Flavor) => void;
  onRemoveFlavorAtIndex: (index: number) => void;
}

export function FlavorSelector({
  flavors,
  selectedFlavors,
  requiredCount,
  onAddFlavor,
  onRemoveFlavorAtIndex,
}: FlavorSelectorProps) {
  const isComplete = selectedFlavors.length >= requiredCount;

  // Count occurrences of each flavor
  const flavorSelectionCounts = selectedFlavors.reduce<Record<string, number>>(
    (acc, f) => {
      acc[f.id] = (acc[f.id] || 0) + 1;
      return acc;
    },
    {}
  );

  return (
    <div className="space-y-4">
      {/* Allocated Flavor Slots */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold uppercase tracking-wider text-[#777777] flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#C43C1E]" />
            <span>Flavor Allocations</span>
          </label>
          <span
            className={`text-xs font-bold px-2 py-0.5 rounded-md ${
              isComplete
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]'
            }`}
          >
            {selectedFlavors.length} of {requiredCount} selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: requiredCount }).map((_, idx) => {
            const assigned = selectedFlavors[idx];
            return (
              <div
                key={idx}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                  assigned
                    ? 'bg-white border-[#C43C1E] shadow-2xs'
                    : 'bg-[#FAF8E8]/70 border-dashed border-[#E8E3C3] text-[#777777]'
                }`}
              >
                <div className="flex items-center gap-2 overflow-hidden pr-1">
                  <span className="w-5 h-5 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[10px] font-bold text-[#777777] shrink-0">
                    {idx + 1}
                  </span>
                  {assigned ? (
                    <span className="font-bold text-[#222222] truncate">
                      {assigned.name}
                    </span>
                  ) : (
                    <span className="italic truncate text-[#777777]">
                      Choose flavor...
                    </span>
                  )}
                </div>

                {assigned && (
                  <button
                    type="button"
                    onClick={() => onRemoveFlavorAtIndex(idx)}
                    aria-label={`Remove ${assigned.name} from slot ${idx + 1}`}
                    className="p-1 rounded-md text-[#777777] hover:text-[#C43C1E] hover:bg-[#FAF8E8] transition-colors shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Flavor Options Grid */}
      <div>
        <div className="text-xs font-bold uppercase tracking-wider text-[#777777] mb-2">
          Available Artisan Flavors
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[260px] overflow-y-auto pr-1">
          {flavors.map((flavor) => {
            const count = flavorSelectionCounts[flavor.id] || 0;
            const canSelect = !isComplete;

            return (
              <button
                key={flavor.id}
                type="button"
                onClick={() => onAddFlavor(flavor)}
                disabled={!canSelect}
                aria-label={`Select ${flavor.name}`}
                className={`p-3 rounded-xl border text-left flex items-center justify-between gap-2 transition-all min-h-[50px] ${
                  canSelect
                    ? 'bg-white border-[#E8E3C3] hover:border-[#C43C1E] hover:bg-[#FAF8E8] cursor-pointer'
                    : 'bg-white/50 border-[#E8E3C3]/60 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <span
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10 shadow-2xs"
                    style={{ backgroundColor: flavor.colorHex }}
                  />
                  <div className="overflow-hidden">
                    <div className="text-xs font-bold text-[#222222] truncate">
                      {flavor.name}
                    </div>
                    {flavor.isDairyFree && (
                      <span className="text-[10px] text-emerald-700 font-medium">
                        Dairy-Free
                      </span>
                    )}
                    {flavor.containsNuts && (
                      <span className="text-[10px] text-amber-700 font-medium">
                        Contains Nuts
                      </span>
                    )}
                  </div>
                </div>

                {count > 0 && (
                  <span className="flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-[#C43C1E] text-white shrink-0">
                    <Check className="w-3 h-3" />
                    <span>{count}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

