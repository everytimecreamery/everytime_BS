'use client';

import React from 'react';
import { CategoryId, MenuItem } from '@/lib/mock/menu';
import { ProductCard } from './ProductCard';
import { SearchX } from 'lucide-react';

interface ProductGridProps {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  activeCategoryId?: CategoryId;
  searchQuery?: string;
  onClearSearch?: () => void;
}

export function ProductGrid({
  items,
  onSelect,
  activeCategoryId,
  searchQuery,
  onClearSearch,
}: ProductGridProps) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white/70 border border-dashed border-[#E8E3C3] rounded-2xl text-center min-h-[300px]">
        <div className="w-12 h-12 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mb-3">
          <SearchX className="w-6 h-6 text-[#C43C1E]" />
        </div>
        <h4 className="text-base font-bold text-[#222222]">No Menu Products Found</h4>
        <p className="text-xs text-[#777777] mt-1.5 max-w-xs leading-relaxed">
          {searchQuery
            ? `No products match "${searchQuery}". Check the spelling or search another flavor.`
            : 'No products are currently available in this category.'}
        </p>

        {searchQuery && onClearSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-4 px-4 py-2 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-bold text-[#C43C1E] hover:bg-[#C43C1E] hover:text-white transition-colors cursor-pointer"
          >
            Clear Search
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-3.5 auto-rows-fr">
      {items.map((item) => (
        <ProductCard
          key={item.id}
          item={item}
          onSelect={onSelect}
          activeCategoryId={activeCategoryId}
        />
      ))}
    </div>
  );
}

