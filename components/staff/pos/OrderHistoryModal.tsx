'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PosOrder } from '@/lib/pos/order';
import {
  DateFilterOption,
  HistorySortOption,
  filterAndSortOrderHistory,
  calculateHistoryRevenuePaise,
  updateHistoricalOrder,
} from '@/lib/pos/orderHistory';
import { formatPaise } from '@/lib/pos/calculations';
import { OrderReceiptView } from './OrderReceiptView';
import { OrderEditView } from './OrderEditView';
import {
  History,
  Search,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  ChevronRight,
  TrendingUp,
  Receipt,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';

interface OrderHistoryModalProps {
  isOpen: boolean;
  orders: PosOrder[];
  onClose: () => void;
  onUpdateOrder?: (updatedOrder: PosOrder) => void;
}

function formatOrderTime(isoString?: string | null): string {
  if (!isoString) return '--:--';
  try {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch {
    return '--:--';
  }
}

function formatOrderDate(isoString?: string | null): string {
  if (!isoString) return '--';
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '--';
  }
}

export function OrderHistoryModal({ isOpen, orders, onClose, onUpdateOrder }: OrderHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortOption, setSortOption] = useState<HistorySortOption>('newest');
  const [selectedOrder, setSelectedOrder] = useState<PosOrder | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setSelectedOrder(null);
    setIsEditing(false);
    setSuccessMessage(null);
    onClose();
  }, [onClose]);

  const handleSaveEditedOrder = (edited: PosOrder) => {
    const { savedOrder } = updateHistoricalOrder(edited.id, edited);
    setSelectedOrder(savedOrder);
    setIsEditing(false);
    setSuccessMessage(`Order ${savedOrder.token} modified and saved successfully!`);
    onUpdateOrder?.(savedOrder);
  };

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        if (isEditing) {
          return;
        }
        if (selectedOrder) {
          setSelectedOrder(null);
          setSuccessMessage(null);
        } else {
          handleClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedOrder, isEditing, handleClose]);

  // Compute filtered & sorted orders
  const filteredOrders = useMemo(() => {
    return filterAndSortOrderHistory(orders, {
      searchQuery,
      dateFilter,
      customStartDate: customStart,
      customEndDate: customEnd,
      sortOption,
    });
  }, [orders, searchQuery, dateFilter, customStart, customEnd, sortOption]);

  const totalRevenuePaise = useMemo(() => {
    return calculateHistoryRevenuePaise(filteredOrders);
  }, [filteredOrders]);

  if (!isOpen) return null;

  const dateFilterLabels: { id: DateFilterOption; label: string }[] = [
    { id: 'all', label: 'All Orders' },
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'week', label: 'This Week' },
    { id: 'month', label: 'This Month' },
    { id: 'custom', label: 'Custom Range' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Order History"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-4xl h-[90vh] max-h-[820px] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* If editing, show edit view; if individual receipt is selected, show receipt view */}
        {isEditing && selectedOrder ? (
          <OrderEditView
            order={selectedOrder}
            onSave={handleSaveEditedOrder}
            onCancel={() => setIsEditing(false)}
          />
        ) : selectedOrder ? (
          <div className="flex flex-col h-full overflow-hidden">
            {successMessage && (
              <div
                role="status"
                aria-live="polite"
                className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs font-bold flex items-center justify-between shrink-0 animate-in fade-in"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{successMessage}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <OrderReceiptView
              order={selectedOrder}
              onEdit={() => setIsEditing(true)}
              onBack={() => {
                setSelectedOrder(null);
                setSuccessMessage(null);
              }}
              onClose={handleClose}
            />
          </div>
        ) : (
          <>
            {/* 1. Modal Top Bar */}
            <div className="p-4 sm:px-6 sm:py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#C43C1E]/10 border border-[#C43C1E]/20 text-[#C43C1E] flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 id="order-history-title" className="text-base sm:text-lg font-bold text-[#222222]">
                      Order History
                    </h3>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#C43C1E] text-white tabular-nums">
                      {filteredOrders.length} {filteredOrders.length === 1 ? 'order' : 'orders'}
                    </span>
                  </div>
                  <p className="text-xs text-[#777777] hidden sm:block">
                    Permanent register of all completed customer transactions
                  </p>
                </div>
              </div>

              {/* Revenue Summary Pill & Close */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#E8E3C3] text-xs">
                  <TrendingUp className="w-3.5 h-3.5 text-[#C43C1E]" />
                  <span className="text-[#777777] font-semibold">Total Revenue:</span>
                  <span className="font-extrabold text-[#222222] tabular-nums">
                    {formatPaise(totalRevenuePaise)}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close Order History"
                  className="w-9 h-9 rounded-xl flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 2. Search, Filter & Sort Controls */}
            <div className="p-3 sm:px-6 sm:py-3 border-b border-[#E8E3C3] bg-white space-y-2.5 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#777777]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by order #, flavor, product or date..."
                    aria-label="Search orders"
                    className="w-full h-9 pl-9 pr-8 rounded-xl border border-[#E8E3C3] bg-[#FAF8E8]/60 text-xs font-semibold text-[#222222] placeholder:text-[#777777] focus:outline-none focus:border-[#C43C1E] focus:bg-white transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#222222]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort selector */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-[#777777] font-bold hidden md:inline">Sort:</span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as HistorySortOption)}
                    aria-label="Sort orders"
                    className="h-9 px-3 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:border-[#C43C1E] cursor-pointer"
                  >
                    <option value="newest">Newest First</option>
                    <option value="oldest">Oldest First</option>
                    <option value="highest">Highest Amount</option>
                    <option value="lowest">Lowest Amount</option>
                  </select>
                </div>
              </div>

              {/* Date Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin text-xs">
                {dateFilterLabels.map((df) => (
                  <button
                    key={df.id}
                    type="button"
                    onClick={() => setDateFilter(df.id)}
                    aria-pressed={dateFilter === df.id}
                    className={`h-7 px-3 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                      dateFilter === df.id
                        ? 'bg-[#C43C1E] text-white shadow-2xs'
                        : 'bg-[#FAF8E8] text-[#777777] hover:text-[#222222] border border-[#E8E3C3]'
                    }`}
                  >
                    {df.label}
                  </button>
                ))}
              </div>

              {/* Custom Date Range Row (Shown only if 'custom' is active) */}
              {dateFilter === 'custom' && (
                <div className="flex items-center gap-2 p-2 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3] text-xs">
                  <span className="font-bold text-[#777777]">Range:</span>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    aria-label="Start Date"
                    className="h-7 px-2 rounded-lg border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222]"
                  />
                  <span className="text-[#777777] font-bold">to</span>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    aria-label="End Date"
                    className="h-7 px-2 rounded-lg border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222]"
                  />
                  {(customStart || customEnd) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomStart('');
                        setCustomEnd('');
                      }}
                      className="text-xs text-[#C43C1E] font-bold hover:underline ml-auto"
                    >
                      Clear Dates
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. Orders List Table / Card View */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0 bg-[#FAF8E8]/30">
              {filteredOrders.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 border border-dashed border-[#E8E3C3] rounded-2xl bg-white/80 min-h-[280px]">
                  <div className="w-12 h-12 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mb-3">
                    <Receipt className="w-6 h-6 text-[#C43C1E]" />
                  </div>
                  <h4 className="text-base font-bold text-[#222222]">No Historical Orders Found</h4>
                  <p className="text-xs text-[#777777] mt-1.5 max-w-sm leading-relaxed">
                    {searchQuery || dateFilter !== 'all'
                      ? 'No orders match your current filter and search criteria. Try clearing the search or choosing another date range.'
                      : 'No completed orders exist yet in this terminal session. Completed orders will be permanently stored here.'}
                  </p>
                  {(searchQuery || dateFilter !== 'all') && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setDateFilter('all');
                        setCustomStart('');
                        setCustomEnd('');
                      }}
                      className="mt-4 px-3.5 py-1.5 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-bold text-[#C43C1E] hover:bg-[#C43C1E] hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Filters</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredOrders.map((order) => {
                    const dateText = formatOrderDate(order.completedAt || order.createdAt);
                    const timeText = formatOrderTime(order.completedAt || order.createdAt);
                    const itemsSummary = order.items
                      .map((i) => `${i.quantity}x ${i.productName}${i.variantLabel ? ` (${i.variantLabel})` : ''}`)
                      .join(', ');

                    return (
                      <div
                        key={order.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedOrder(order)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            setSelectedOrder(order);
                          }
                        }}
                        aria-label={`View receipt for order ${order.token} total ${formatPaise(order.totalPaise)}`}
                        className="p-3.5 sm:p-4 rounded-xl border border-[#E8E3C3] bg-white hover:border-[#C43C1E]/50 hover:bg-[#FAF8E8]/50 transition-all shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer group"
                      >
                        {/* Left: Token, Date/Time & Items Summary */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="font-black text-sm text-[#222222] tracking-tight group-hover:text-[#C43C1E] transition-colors">
                              {order.token}
                            </span>
                            <span className="text-[9.5px] font-black uppercase px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                              PAID
                            </span>
                            <span className="text-[10px] font-bold text-[#777777] flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-[#C43C1E]" />
                              <span>{dateText}</span>
                              <span>·</span>
                              <span>{timeText}</span>
                            </span>
                          </div>

                          <p className="text-xs text-[#777777] truncate max-w-lg">
                            <strong className="text-[#222222] font-semibold">
                              {order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'}:
                            </strong>{' '}
                            {itemsSummary}
                          </p>
                        </div>

                        {/* Right: Payment Method Badge, Amount & Chevron */}
                        <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                          <span className="inline-flex items-center gap-1 text-[10.5px] font-bold uppercase px-2 py-0.5 rounded-md bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                            {order.paymentMethod === 'CASH' ? (
                              <Banknote className="w-3 h-3" />
                            ) : order.paymentMethod === 'UPI' ? (
                              <QrCode className="w-3 h-3" />
                            ) : (
                              <CreditCard className="w-3 h-3" />
                            )}
                            <span>{order.paymentMethod || 'CASH'}</span>
                          </span>

                          <span className="text-base sm:text-lg font-black text-[#222222] tabular-nums min-w-[75px] text-right">
                            {formatPaise(order.totalPaise)}
                          </span>

                          <div className="w-7 h-7 rounded-lg bg-[#FAF8E8] text-[#777777] group-hover:bg-[#C43C1E] group-hover:text-white transition-colors flex items-center justify-center">
                            <ChevronRight className="w-4 h-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 4. Footer Bar */}
            <div className="p-3 sm:px-6 sm:py-3 border-t border-[#E8E3C3] bg-white flex items-center justify-between shrink-0 text-xs text-[#777777]">
              <span>
                Showing <strong>{filteredOrders.length}</strong> of <strong>{orders.length}</strong> total records
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-1.5 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] font-bold text-[#222222] transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
