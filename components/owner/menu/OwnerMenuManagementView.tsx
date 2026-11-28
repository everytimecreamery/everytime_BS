'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  fetchAllOwnerMenuData,
  APPROVED_LUCIDE_ICONS,
  ApprovedLucideIcon,
} from '@/lib/supabase/menu';
import { toggleMenuItemAvailabilityAction } from '@/app/actions/menu';
import { formatPaise } from '@/lib/pos/calculations';
import {
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
  Search,
  Plus,
  Pencil,
  Archive,
  RotateCcw,
  Check,
  X,
  AlertCircle,
  Filter,
  Shield,
  RefreshCw,
  SlidersHorizontal,
} from 'lucide-react';
import { MenuItemFormDialog } from './MenuItemFormDialog';
import { MenuCategoryDialog } from './MenuCategoryDialog';
import { MenuArchiveDialog } from './MenuArchiveDialog';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
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

type StatusFilter = 'all' | 'available' | 'unavailable' | 'archived';

export function OwnerMenuManagementView() {
  const supabase = useMemo(() => createClient(), []);
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [categories, setCategories] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filters for Items Tab
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Dialog State
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any | null>(null);

  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<any | null>(null);

  const [archiveModal, setArchiveModal] = useState<{
    isOpen: boolean;
    type: 'item' | 'category';
    target: any | null;
    action: 'archive' | 'restore';
  }>({
    isOpen: false,
    type: 'item',
    target: null,
    action: 'archive',
  });

  // Load menu data
  const loadMenuData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    else setIsRefreshing(true);

    try {
      const data = await fetchAllOwnerMenuData();
      setCategories(data.categories || []);
      setItems(data.items || []);
    } catch (err) {
      console.error('[OwnerMenuManagementView] Failed to load menu:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMenuData();
  }, [loadMenuData]);

  // Realtime subscription for live menu synchronization
  useEffect(() => {
    const channel = supabase
      .channel('owner-menu-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_items' },
        () => {
          loadMenuData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'categories' },
        () => {
          loadMenuData(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'menu_variants' },
        () => {
          loadMenuData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadMenuData, supabase]);

  // Optimistic Toggle Availability
  const handleToggleAvailability = async (item: any) => {
    const previousState = item.is_available;
    // Optimistic update
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, is_available: !previousState } : i))
    );

    const res = await toggleMenuItemAvailabilityAction(item.id, previousState);
    if (!res.success) {
      // Revert if failed
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_available: previousState } : i))
      );
      alert(res.error || 'Failed to update availability.');
    }
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Search
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesName = item.name.toLowerCase().includes(query);
        const matchesDesc = item.description?.toLowerCase().includes(query);
        if (!matchesName && !matchesDesc) return false;
      }

      // Category filter
      if (categoryFilter !== 'all' && item.category_id !== categoryFilter) {
        return false;
      }

      // Status filter
      if (statusFilter === 'archived') {
        return Boolean(item.is_archived);
      }
      if (statusFilter === 'available') {
        return !item.is_archived && item.is_available;
      }
      if (statusFilter === 'unavailable') {
        return !item.is_archived && !item.is_available;
      }
      if (statusFilter === 'all') {
        // "All" shows active items by default; archived are viewed via the Archived tab
        return !item.is_archived;
      }

      return true;
    });
  }, [items, searchQuery, statusFilter, categoryFilter]);

  // Counts
  const counts = useMemo(() => {
    const active = items.filter((i) => !i.is_archived);
    return {
      totalActive: active.length,
      available: active.filter((i) => i.is_available).length,
      unavailable: active.filter((i) => !i.is_available).length,
      archived: items.filter((i) => i.is_archived).length,
    };
  }, [items]);

  // Category Active Item Count map
  const activeItemsCountByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    for (const item of items) {
      if (!item.is_archived) {
        map[item.category_id] = (map[item.category_id] || 0) + 1;
      }
    }
    return map;
  }, [items]);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-[#E8E3C3] p-5 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-[#222222]">Master Menu Management</h2>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                <RefreshCw className="w-3 h-3 animate-spin" />
                Syncing
              </span>
            )}
          </div>
          <p className="text-xs text-[#777777] mt-1">
            Configure catalog items, prices in integer paise, and daily availability.
            Changes sync live to staff counter terminals.
          </p>
        </div>

        {/* Tab Selector & New Button */}
        <div className="flex items-center gap-2.5">
          <div className="bg-[#FAF8E8] p-1 rounded-xl border border-[#E8E3C3] flex items-center">
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-white text-[#C43C1E] shadow-xs'
                  : 'text-[#777777] hover:text-[#222222]'
              }`}
            >
              Menu Items ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-white text-[#C43C1E] shadow-xs'
                  : 'text-[#777777] hover:text-[#222222]'
              }`}
            >
              Categories ({categories.length})
            </button>
          </div>

          {activeTab === 'items' ? (
            <button
              type="button"
              onClick={() => {
                setSelectedItem(null);
                setItemFormOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#C43C1E] hover:bg-[#a83319] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Menu Item</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory(null);
                setCategoryFormOpen(true);
              }}
              className="flex items-center gap-2 px-3.5 py-2 bg-[#C43C1E] hover:bg-[#a83319] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Category</span>
            </button>
          )}
        </div>
      </div>

      {/* ---------------- ITEMS TAB CONTENT ---------------- */}
      {activeTab === 'items' && (
        <div className="space-y-4">
          {/* Filter & Search Bar */}
          <div className="bg-white rounded-xl border border-[#E8E3C3] p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products by name or flavor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-[#FAF8E8]/50 border border-[#E8E3C3] rounded-xl focus:outline-none focus:border-[#C43C1E] text-[#222222] placeholder:text-[#777777]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#222222]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Category Filter Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#777777] whitespace-nowrap">Category:</span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="text-xs bg-[#FAF8E8] border border-[#E8E3C3] text-[#222222] font-bold rounded-xl px-3 py-2 focus:outline-none focus:border-[#C43C1E]"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Status Tabs */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#FAF8E8]">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-[#C43C1E] text-white'
                    : 'bg-[#FAF8E8] text-[#777777] hover:text-[#222222] border border-[#E8E3C3]'
                }`}
              >
                Active Items ({counts.totalActive})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('available')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'available'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-[#FAF8E8] text-[#777777] hover:text-[#222222] border border-[#E8E3C3]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Available in POS ({counts.available})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('unavailable')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'unavailable'
                    ? 'bg-zinc-700 text-white'
                    : 'bg-[#FAF8E8] text-[#777777] hover:text-[#222222] border border-[#E8E3C3]'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-zinc-400 inline-block" />
                Sold Out / Unavailable ({counts.unavailable})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('archived')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                  statusFilter === 'archived'
                    ? 'bg-amber-600 text-white'
                    : 'bg-[#FAF8E8] text-[#777777] hover:text-[#222222] border border-[#E8E3C3]'
                }`}
              >
                <Archive className="w-3.5 h-3.5" />
                Archived ({counts.archived})
              </button>
            </div>
          </div>

          {/* Items Table */}
          <div className="bg-white rounded-xl border border-[#E8E3C3] shadow-xs overflow-hidden">
            {loading ? (
              <div className="text-center py-12 text-xs text-[#777777]">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#C43C1E] mb-2" />
                Loading master menu catalog...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-16 px-4 flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-2xl bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3] flex items-center justify-center mb-3">
                  <IceCream className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-[#222222]">No Menu Items Found</h4>
                <p className="text-xs text-[#777777] mt-1 max-w-sm">
                  {searchQuery || categoryFilter !== 'all' || statusFilter !== 'all'
                    ? 'No products match the selected filters or search query.'
                    : 'The menu is currently empty. Click "+ Add Menu Item" to start creating your new products.'}
                </p>
                {!searchQuery && categoryFilter === 'all' && statusFilter === 'all' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedItem(null);
                      setItemFormOpen(true);
                    }}
                    className="mt-4 flex items-center gap-2 px-4 py-2 bg-[#C43C1E] hover:bg-[#a83319] text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add First Menu Item</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#FAF8E8] text-[#777777] font-bold border-b border-[#E8E3C3]">
                    <tr>
                      <th className="p-3">Product Name & Details</th>
                      <th className="p-3">Category</th>
                      <th className="p-3">Base Price</th>
                      <th className="p-3">Portion / Variants</th>
                      <th className="p-3">Flags</th>
                      <th className="p-3 text-center">Availability (POS)</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8E3C3]/50">
                    {filteredItems.map((item) => {
                      const categoryObj = categories.find((c) => c.id === item.category_id);
                      const isArchived = Boolean(item.is_archived);
                      const isGelato = item.category_id === 'gelato';
                      const variantsCount = (item.menu_variants || []).filter((v: any) => !v.is_archived).length;

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-[#FAF8E8]/40 transition-colors ${
                            isArchived ? 'bg-zinc-50/60 opacity-75' : ''
                          }`}
                        >
                          {/* Name & Details */}
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div>
                                <span
                                  className={`font-black text-sm text-[#222222] ${
                                    isArchived ? 'line-through text-[#777777]' : ''
                                  }`}
                                >
                                  {item.name}
                                </span>
                                {item.description && (
                                  <p className="text-[11px] text-[#777777] line-clamp-1 max-w-xs mt-0.5">
                                    {item.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Category */}
                          <td className="p-3">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-[11px] font-bold text-[#222222]">
                              {categoryObj?.label || item.category_id}
                            </span>
                          </td>

                          {/* Base Price */}
                          <td className="p-3">
                            <span className="font-black text-[#C43C1E] tabular-nums text-sm">
                              {formatPaise(item.base_price_paise)}
                            </span>
                          </td>

                          {/* Portion / Variants */}
                          <td className="p-3">
                            {isGelato ? (
                              <span className="text-[11px] text-[#777777] font-bold bg-[#FAF8E8] px-2 py-0.5 rounded border border-[#E8E3C3]/60">
                                85g single scoop
                              </span>
                            ) : variantsCount > 0 ? (
                              <span className="text-[11px] text-amber-800 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                {variantsCount} {variantsCount === 1 ? 'Variant' : 'Variants'}
                              </span>
                            ) : (
                              <span className="text-[11px] text-zinc-500 font-bold bg-zinc-100 px-2 py-0.5 rounded">
                                Direct Add (0 var)
                              </span>
                            )}
                          </td>

                          {/* Flags */}
                          <td className="p-3">
                            <div className="flex items-center gap-1 flex-wrap">
                              {item.is_premium && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Premium
                                </span>
                              )}
                              {item.is_frequent && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                                  <Flame className="w-2.5 h-2.5" />
                                  Frequent
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Availability Toggle */}
                          <td className="p-3 text-center">
                            {isArchived ? (
                              <span className="text-[11px] text-zinc-400 italic">Archived</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleToggleAvailability(item)}
                                className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                                  item.is_available ? 'bg-emerald-500' : 'bg-zinc-300'
                                }`}
                                title={item.is_available ? 'Click to mark Sold Out' : 'Click to mark Available'}
                                aria-label={`Toggle availability for ${item.name}`}
                              >
                                <span
                                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-xs ${
                                    item.is_available ? 'translate-x-5' : 'translate-x-1'
                                  }`}
                                />
                              </button>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItem(item);
                                  setItemFormOpen(true);
                                }}
                                className="p-1.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer"
                                title="Edit Item & Variants"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {!isArchived ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setArchiveModal({
                                      isOpen: true,
                                      type: 'item',
                                      target: item,
                                      action: 'archive',
                                    })
                                  }
                                  className="p-1.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 text-amber-700 transition-colors cursor-pointer"
                                  title="Archive Item (Soft Retirement)"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setArchiveModal({
                                      isOpen: true,
                                      type: 'item',
                                      target: item,
                                      action: 'restore',
                                    })
                                  }
                                  className="p-1.5 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 transition-colors cursor-pointer"
                                  title="Restore to Menu"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------------- CATEGORIES TAB CONTENT ---------------- */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#E8E3C3] shadow-xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8E8] text-[#777777] font-bold border-b border-[#E8E3C3]">
                <tr>
                  <th className="p-3 w-16">Sort</th>
                  <th className="p-3 w-14">Icon</th>
                  <th className="p-3">Category Label</th>
                  <th className="p-3">System Identifier</th>
                  <th className="p-3">Active Items</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3C3]/50">
                {categories.map((cat) => {
                  const IconComp = ICON_MAP[cat.icon_name] || IceCream;
                  const activeCount = activeItemsCountByCategory[cat.id] || 0;
                  const isArchived = Boolean(cat.is_archived);
                  const isVirtualFrequent = cat.id === 'frequent';
                  const isProtectedExtra = cat.id === 'extra';

                  return (
                    <tr
                      key={cat.id}
                      className={`hover:bg-[#FAF8E8]/40 transition-colors ${
                        isArchived ? 'bg-zinc-50 opacity-75' : ''
                      }`}
                    >
                      {/* Sort Order */}
                      <td className="p-3 font-bold text-[#777777] tabular-nums">
                        #{cat.sort_order ?? 0}
                      </td>

                      {/* Icon */}
                      <td className="p-3">
                        <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E]">
                          <IconComp className="w-4 h-4" />
                        </div>
                      </td>

                      {/* Label */}
                      <td className="p-3 font-bold text-sm text-[#222222]">
                        {cat.label}
                        {isVirtualFrequent && (
                          <span className="ml-2 text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                            Virtual (Flag-Driven)
                          </span>
                        )}
                        {isProtectedExtra && (
                          <span className="ml-2 text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                            Protected System
                          </span>
                        )}
                      </td>

                      {/* System Identifier */}
                      <td className="p-3 font-mono text-[11px] text-[#777777]">
                        {cat.id}
                      </td>

                      {/* Active Items */}
                      <td className="p-3">
                        <span className="font-bold text-[#222222] bg-[#FAF8E8] px-2 py-0.5 rounded-lg border border-[#E8E3C3]">
                          {activeCount} items
                        </span>
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        {isArchived ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                            Archived
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isVirtualFrequent ? (
                            <span className="text-[11px] text-[#777777] italic">Virtual Category</span>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedCategory(cat);
                                  setCategoryFormOpen(true);
                                }}
                                className="p-1.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer"
                                title="Edit Category"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>

                              {isProtectedExtra ? (
                                <span
                                  className="p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-400 cursor-not-allowed"
                                  title="Extra category is protected and cannot be archived"
                                >
                                  <Shield className="w-3.5 h-3.5" />
                                </span>
                              ) : !isArchived ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setArchiveModal({
                                      isOpen: true,
                                      type: 'category',
                                      target: cat,
                                      action: 'archive',
                                    })
                                  }
                                  className="p-1.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 text-amber-700 transition-colors cursor-pointer"
                                  title="Archive Category"
                                >
                                  <Archive className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setArchiveModal({
                                      isOpen: true,
                                      type: 'category',
                                      target: cat,
                                      action: 'restore',
                                    })
                                  }
                                  className="p-1.5 rounded-lg border border-emerald-200 bg-white hover:bg-emerald-50 text-emerald-700 transition-colors cursor-pointer"
                                  title="Restore Category"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Item Form Dialog */}
      <MenuItemFormDialog
        isOpen={itemFormOpen}
        categories={categories}
        item={selectedItem}
        onClose={() => setItemFormOpen(false)}
        onSaved={() => loadMenuData(true)}
      />

      {/* Category Form Dialog */}
      <MenuCategoryDialog
        isOpen={categoryFormOpen}
        category={selectedCategory}
        onClose={() => setCategoryFormOpen(false)}
        onSaved={() => loadMenuData(true)}
      />

      {/* Archive / Restore Confirmation Dialog */}
      <MenuArchiveDialog
        isOpen={archiveModal.isOpen}
        type={archiveModal.type}
        target={archiveModal.target}
        action={archiveModal.action}
        onClose={() =>
          setArchiveModal({ isOpen: false, type: 'item', target: null, action: 'archive' })
        }
        onSuccess={() => loadMenuData(true)}
      />
    </div>
  );
}
