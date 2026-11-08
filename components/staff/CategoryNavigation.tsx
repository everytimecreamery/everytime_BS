'use client';

import React from 'react';
import { IceCream, Package, Coffee, LucideIcon } from 'lucide-react';
import { ProductCategory } from '@/lib/mock-data/categories';

const ICON_MAP: Record<ProductCategory['iconName'], LucideIcon> = {
  IceCream,
  Package,
  Coffee,
};

interface CategoryNavigationProps {
  categories: ProductCategory[];
  activeCategoryId: ProductCategory['id'];
  onSelectCategory: (id: ProductCategory['id']) => void;
}

export function CategoryNavigation({
  categories,
  activeCategoryId,
  onSelectCategory,
}: CategoryNavigationProps) {
  return (
    <nav
      aria-label="Product Categories"
      className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none"
    >
      {categories.map((category) => {
        const Icon = ICON_MAP[category.iconName] || IceCream;
        const isActive = activeCategoryId === category.id;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelectCategory(category.id)}
            aria-pressed={isActive}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all select-none min-h-[44px] cursor-pointer ${
              isActive
                ? 'bg-[#C43C1E] text-white shadow-xs'
                : 'bg-white text-[#222222] border border-[#E8E3C3] hover:bg-[#FAF8E8] hover:border-[#D8D1A8]'
            }`}
          >
            <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#C43C1E]'}`} />
            <span>{category.label}</span>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                isActive ? 'bg-white/20 text-white' : 'bg-[#FAF8E8] text-[#777777]'
              }`}
            >
              {category.count}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

