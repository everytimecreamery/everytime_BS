'use client';

import React from 'react';
import {
  Flame,
  Layers,
  IceCream,
  Cherry,
  UtensilsCrossed,
  CupSoda,
  Package,
  Coffee,
  LucideIcon,
} from 'lucide-react';
import { MENU_CATEGORIES, CategoryId } from '@/lib/mock/menu';

const ICON_MAP: Record<string, LucideIcon> = {
  Flame,
  Layers,
  IceCream,
  Cherry,
  UtensilsCrossed,
  CupSoda,
  Package,
  Coffee,
};

interface CategorySidebarProps {
  activeCategoryId: CategoryId;
  onSelectCategory: (id: CategoryId) => void;
}

export function CategorySidebar({
  activeCategoryId,
  onSelectCategory,
}: CategorySidebarProps) {
  return (
    <aside
      aria-label="Category Sidebar"
      className="w-full md:w-48 lg:w-52 bg-white rounded-2xl border border-[#E8E3C3] p-2.5 sm:p-3 shadow-xs flex flex-row md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0"
    >
      <div className="hidden md:block px-2.5 py-1.5 mb-1 border-b border-[#FAF8E8]">
        <span className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">
          Categories
        </span>
      </div>

      <nav
        aria-label="Menu Categories"
        className="flex flex-row md:flex-col gap-1.5 w-full min-w-max md:min-w-0"
      >
        {MENU_CATEGORIES.map((category) => {
          const IconComponent = ICON_MAP[category.iconName] || IceCream;
          const isActive = activeCategoryId === category.id;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onSelectCategory(category.id)}
              aria-pressed={isActive}
              className={`flex items-center gap-3 w-full px-3.5 py-3 rounded-xl font-bold text-sm transition-all select-none min-h-[48px] text-left cursor-pointer ${
                isActive
                  ? 'bg-[#C43C1E] text-white shadow-sm'
                  : 'bg-transparent text-[#222222] hover:bg-[#FAF8E8] hover:text-[#C43C1E]'
              }`}
            >
              <IconComponent
                className={`w-4 h-4 shrink-0 ${
                  isActive ? 'text-white' : 'text-[#C43C1E]'
                }`}
              />
              <span className="truncate">{category.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

