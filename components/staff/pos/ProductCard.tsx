'use client';

import React from 'react';
import { CategoryId, MenuItem } from '@/lib/mock/menu';
import { formatPaise } from '@/lib/pos/calculations';
import { Plus, SlidersHorizontal, Star } from 'lucide-react';

interface ProductCardProps {
  item: MenuItem;
  onSelect: (item: MenuItem) => void;
  activeCategoryId?: CategoryId;
}

export function ProductCard({ item, onSelect, activeCategoryId }: ProductCardProps) {
  const isTubCategory = activeCategoryId === 'tubs';
  const isGelatoItem = item.interactionType === 'gelato_sizes';

  // Format price preview depending on interaction type & active category
  const renderPriceInfo = () => {
    if (isGelatoItem) {
      if (isTubCategory) {
        const p250 = item.variants?.find((v) => v.id === '250ml')?.pricePaise ?? item.basePricePaise;
        const p500 = item.variants?.find((v) => v.id === '500ml')?.pricePaise;
        return (
          <div>
            <span className="text-[11px] text-[#777777] block font-medium">250ml / 500ml</span>
            <span className="text-base font-extrabold text-[#222222] tabular-nums">
              {formatPaise(p250)} / {p500 ? formatPaise(p500) : ''}
            </span>
          </div>
        );
      }

      // Gelato category: counter cups are strictly single 85ml
      return (
        <div>
          <span className="text-[11px] text-[#777777] block font-medium">85ml</span>
          <span className="text-base font-extrabold text-[#222222] tabular-nums">
            {formatPaise(item.basePricePaise)}
          </span>
        </div>
      );
    }

    if (item.interactionType === 'waffle_scoop') {
      return (
        <div>
          <span className="text-[11px] text-[#777777] block font-medium">Add-on scoop available</span>
          <span className="text-base font-extrabold text-[#222222] tabular-nums">
            {formatPaise(item.basePricePaise)}
          </span>
        </div>
      );
    }

    if (item.interactionType === 'hot_chocolate_options') {
      return (
        <div>
          <span className="text-[11px] text-[#777777] block font-medium">2 Price Options</span>
          <span className="text-base font-extrabold text-[#222222] tabular-nums">
            ₹79 / ₹149
          </span>
        </div>
      );
    }

    // Direct items
    return (
      <div>
        <span className="text-[11px] text-[#777777] block font-medium">Price</span>
        <span className="text-base font-extrabold text-[#222222] tabular-nums">
          {formatPaise(item.basePricePaise)}
        </span>
      </div>
    );
  };

  // Only Takeaway Tubs pop up size selector for gelato; Gelato is direct 85ml single scoop
  const isConfigurable =
    (isGelatoItem && isTubCategory) ||
    item.interactionType === 'waffle_scoop' ||
    item.interactionType === 'hot_chocolate_options';

  return (
    <div
      role="article"
      aria-label={item.name}
      onClick={() => onSelect(item)}
      className="bg-white rounded-2xl border border-[#E8E3C3] p-4 flex flex-col justify-between shadow-2xs hover:shadow-md hover:border-[#C43C1E]/50 transition-all cursor-pointer select-none group min-h-[148px]"
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-1 mb-2">
          {item.isPremium ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
              <span>Premium</span>
            </span>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FAF8E8] text-[#777777] border border-[#E8E3C3]">
              {isGelatoItem
                ? isTubCategory
                  ? 'Sizes'
                  : '85ml'
                : item.interactionType === 'waffle_scoop'
                ? 'Waffle'
                : item.interactionType === 'hot_chocolate_options'
                ? 'Options'
                : 'Direct'}
            </span>
          )}

          {isConfigurable && (
            <span className="text-[10px] font-semibold text-[#777777]">
              Options
            </span>
          )}
        </div>

        {/* Product Name */}
        <h4 className="text-base font-bold text-[#222222] group-hover:text-[#C43C1E] transition-colors leading-snug">
          {item.name}
        </h4>
      </div>

      {/* Pricing & Add Action */}
      <div className="pt-3 mt-3 border-t border-[#FAF8E8] flex items-center justify-between gap-2">
        {renderPriceInfo()}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(item);
          }}
          aria-label={`Add ${item.name}`}
          className={`h-9 px-3 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all shadow-2xs shrink-0 cursor-pointer ${
            isConfigurable
              ? 'bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] hover:bg-[#C43C1E] hover:text-white'
              : 'bg-[#C43C1E] text-white hover:bg-[#AB3419]'
          }`}
        >
          {isConfigurable ? (
            <>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Select</span>
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Add</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

