'use client';

import React from 'react';
import { Search, X } from 'lucide-react';

interface ProductSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClearSearch: () => void;
}

export function ProductSearch({
  searchQuery,
  onSearchChange,
  onClearSearch,
}: ProductSearchProps) {
  return (
    <div className="relative w-full">
      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#777777]">
        <Search className="w-4 h-4" />
      </div>

      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search menu products..."
        aria-label="Search menu products"
        className="w-full h-11 pl-10 pr-10 rounded-xl bg-white border border-[#E8E3C3] text-sm text-[#222222] placeholder:text-[#777777] focus:outline-none focus:border-[#C43C1E] focus:ring-2 focus:ring-[#C43C1E]/20 transition-all shadow-2xs"
      />

      {searchQuery && (
        <button
          type="button"
          onClick={onClearSearch}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#777777] hover:text-[#C43C1E] cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

