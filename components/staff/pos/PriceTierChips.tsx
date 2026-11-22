'use client';

import React from 'react';
import { MenuItem } from '@/lib/mock/menu';
import { formatPaise } from '@/lib/pos/calculations';

/**
 * Known color tier mapping for Gelato prices.
 * White = 8500 paise (₹85)
 * Red = 9900 paise (₹99)
 * Black = 12500 paise (₹125)
 */
export const KNOWN_TIER_COLORS: Record<number, string> = {
  8500: 'White',
  9900: 'Red',
  12500: 'Black',
};

export interface PriceTier {
  id: number | 'all';
  primaryLabel: string;
  secondaryLabel?: string;
  pricePaise?: number;
  count: number;
}

/**
 * Derives price tier chips from the items present in the active category:
 * - "All" is always first with the total item count.
 * - Distinct basePricePaise values sorted ascending.
 * - 8500 -> "White ₹85"
 * - 9900 -> "Red ₹99"
 * - 12500 -> "Black ₹125"
 * - Any other price -> formatPaise (e.g. "₹109")
 */
export function derivePriceTiers(items: MenuItem[]): PriceTier[] {
  const allTier: PriceTier = {
    id: 'all',
    primaryLabel: 'All',
    count: items.length,
  };

  const priceMap = new Map<number, number>();
  for (const item of items) {
    const price = item.basePricePaise;
    if (typeof price === 'number' && Number.isFinite(price)) {
      priceMap.set(price, (priceMap.get(price) || 0) + 1);
    }
  }

  const sortedPrices = Array.from(priceMap.keys()).sort((a, b) => a - b);

  const tierList: PriceTier[] = sortedPrices.map((price) => {
    const count = priceMap.get(price) || 0;
    const colorName = KNOWN_TIER_COLORS[price];

    if (colorName) {
      return {
        id: price,
        primaryLabel: colorName,
        secondaryLabel: formatPaise(price, false),
        pricePaise: price,
        count,
      };
    }

    return {
      id: price,
      primaryLabel: formatPaise(price, false),
      pricePaise: price,
      count,
    };
  });

  return [allTier, ...tierList];
}

interface PriceTierChipsProps {
  tiers: PriceTier[];
  selectedTier: number | 'all';
  onSelectTier: (tierId: number | 'all') => void;
}

export function PriceTierChips({
  tiers,
  selectedTier,
  onSelectTier,
}: PriceTierChipsProps) {
  if (tiers.length <= 1) return null;

  return (
    <div
      role="group"
      aria-label="Gelato price tier filter"
      className="flex items-center gap-1.5 sm:gap-2 overflow-x-hidden select-none shrink-0"
    >
      {tiers.map((tier) => {
        const isActive = selectedTier === tier.id;
        return (
          <button
            key={String(tier.id)}
            type="button"
            onClick={() => onSelectTier(tier.id)}
            aria-pressed={isActive}
            className={`h-8 sm:h-8.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center shrink-0 cursor-pointer active:scale-97 ${
              isActive
                ? 'bg-[#C43C1E] text-white border border-[#C43C1E] shadow-2xs'
                : 'bg-white text-[#222222] border border-[#E8E3C3] hover:bg-[#FAF8E8] hover:border-[#C43C1E]/40'
            }`}
          >
            <span>{tier.primaryLabel}</span>
            {tier.secondaryLabel && (
              <span
                className={
                  isActive
                    ? 'ml-1 text-white/90 font-medium'
                    : 'ml-1 text-[#555555] font-medium'
                }
              >
                {tier.secondaryLabel}
              </span>
            )}
            <span
              className={
                isActive
                  ? 'ml-1.5 text-white/75 font-normal'
                  : 'ml-1.5 text-[#777777] font-normal'
              }
            >
              • {tier.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
