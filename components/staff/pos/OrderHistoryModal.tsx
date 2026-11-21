'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { PosOrder } from '@/lib/pos/order';
import {
  DateFilterOption,
  HistorySortOption,
  filterAndSortOrderHistory,
  calculateHistoryRevenuePaise,
} from '@/lib/pos/orderHistory';
import {
  getCompletedOrdersFromOutbox,
  OutboxOrder,
  triggerSync,
} from '@/lib/sync/outbox';
import { formatPaise } from '@/lib/pos/calculations';
import { OrderReceiptView } from './OrderReceiptView';
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
  CheckCircle2,
  Clock,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

interface OrderHistoryModalProps {
  isOpen: boolean;
  orders?: PosOrder[]; // optional fallback
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

export function OrderHistoryModal({ isOpen, onClose }: OrderHistoryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [sortOption, setSortOption] = useState<HistorySortOption>('newest');
  const [selectedOrder, setSelectedOrder] = useState<PosOrder | null>(null);
  const [historyOrders, setHistoryOrders] = useState<PosOrder[]>([]);
  const [outboxRecords, setOutboxRecords] = useState<OutboxOrder[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Load completed orders from IndexedDB outbox
  const loadOrders = useCallback(async () => {
    try {
      const records = await getCompletedOrdersFromOutbox();
      setOutboxRecords(records);

      // Map OutboxOrder to PosOrder domain model for UI rendering
      const mapped: PosOrder[] = records.map((rec) => ({
        id: rec.id,
        token: rec.token_terminal ? `${rec.token_terminal}-${rec.token_seq.toString().padStart(3, '0')}` : `#${rec.token_seq.toString().padStart(3, '0')}`,
        status: 'COMPLETED',
        items: (rec.items || []).map((it) => ({
          lineId: it.id,
          productId: it.menu_item_id || it.id,
          productName: it.product_name,
          variantId: it.variant_label || undefined,
          variantLabel: it.variant_label || undefined,
          addOnId: it.addon_label || undefined,
          addOnLabel: it.addon_label || undefined,
          unitPricePaise: it.unit_price_paise,
          quantity: it.quantity,
          lineTotalPaise: it.total_price_paise,
          totalPricePaise: it.total_price_paise,
        })),
        subtotalPaise: rec.subtotal_paise,
        discountPaise: rec.discount_paise,
        taxPreviewPaise: rec.tax_paise,
        cgstPaise: rec.cgst_paise,
        sgstPaise: rec.sgst_paise,
        totalPaise: rec.total_paise,
        totalPayablePaise: rec.total_paise,
        totalQuantity: (rec.items || []).reduce((sum, item) => sum + item.quantity, 0),
        discount: {
          type: (rec.discount_type?.toLowerCase() as any) || 'none',
          percent: rec.discount_type === 'PERCENTAGE' ? Math.round((rec.discount_paise / (rec.subtotal_paise || 1)) * 100) : 0,
        },
        taxConfig: { ratePercent: 5, isProvisional: true },
        paymentStatus: 'PAID',
        paymentMethod: (rec.payments?.[0]?.method.toUpperCase() as any) || 'CASH',
        createdAt: rec.client_completed_at,
        updatedAt: rec.client_completed_at,
        completedAt: rec.client_completed_at,
        businessDate: rec.business_date,
      }));

      setHistoryOrders(mapped);
    } catch (err) {
      console.warn('Failed to load orders from outbox:', err);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadOrders();
    }
  }, [isOpen, loadOrders]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    await triggerSync();
    await loadOrders();
    setIsSyncing(false);
  };

  const handleClose = useCallback(() => {
    setSelectedOrder(null);
    onClose();
  }, [onClose]);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        if (selectedOrder) {
          setSelectedOrder(null);
        } else {
          handleClose();
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedOrder, handleClose]);

  // Filter & sort orders
  const filteredOrders = useMemo(() => {
    return filterAndSortOrderHistory(historyOrders, {
      searchQuery,
      dateFilter,
      customStartDate: customStart,
      customEndDate: customEnd,
      sortOption,
    });
  }, [historyOrders, searchQuery, dateFilter, customStart, customEnd, sortOption]);

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
        {selectedOrder ? (
          <OrderReceiptView
            order={selectedOrder}
            onBack={() => setSelectedOrder(null)}
            onClose={handleClose}
          />
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-black text-[#222222] tracking-tight">
                    Order History & Synced Transactions
                  </h2>
                  <p className="text-xs text-[#777777]">
                    IndexedDB Offline Outbox • Immutable Finalized Receipts
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  aria-label="Sync Outbox"
                  className="h-8 px-2.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#222222] flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-[#C43C1E] ${isSyncing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Now'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  aria-label="Close Order History"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Metrics Bar */}
            <div className="px-5 py-3 border-b border-[#E8E3C3] bg-[#FAF8E8]/40 grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
              <div className="bg-white p-2.5 rounded-xl border border-[#E8E3C3]/80">
                <div className="text-[10.5px] font-bold text-[#777777] uppercase tracking-wider">Filtered Orders</div>
                <div className="text-lg font-black text-[#222222] tabular-nums mt-0.5">{filteredOrders.length}</div>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-[#E8E3C3]/80">
                <div className="text-[10.5px] font-bold text-[#777777] uppercase tracking-wider">Total Sales</div>
                <div className="text-lg font-black text-[#C43C1E] tabular-nums mt-0.5">{formatPaise(totalRevenuePaise)}</div>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-[#E8E3C3]/80">
                <div className="text-[10.5px] font-bold text-[#777777] uppercase tracking-wider">Avg Ticket</div>
                <div className="text-lg font-black text-[#222222] tabular-nums mt-0.5">
                  {formatPaise(filteredOrders.length > 0 ? Math.round(totalRevenuePaise / filteredOrders.length) : 0)}
                </div>
              </div>

              <div className="bg-white p-2.5 rounded-xl border border-[#E8E3C3]/80">
                <div className="text-[10.5px] font-bold text-[#777777] uppercase tracking-wider">Outbox Status</div>
                <div className="text-xs font-bold text-emerald-700 flex items-center gap-1 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Offline-First OK</span>
                </div>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="p-3 sm:p-4 border-b border-[#E8E3C3] bg-white flex flex-col gap-2.5 shrink-0">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by token, item name, or date..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl border border-[#E8E3C3] bg-[#FAF8E8]/30 focus:bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 transition-all placeholder:text-[#777777]/70"
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

                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value as HistorySortOption)}
                  className="px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 cursor-pointer"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="highest">Highest Amount</option>
                  <option value="lowest">Lowest Amount</option>
                </select>
              </div>

              {/* Date Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {dateFilterLabels.map((df) => (
                  <button
                    key={df.id}
                    type="button"
                    onClick={() => setDateFilter(df.id)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs shrink-0 transition-all cursor-pointer ${
                      dateFilter === df.id
                        ? 'bg-[#C43C1E] text-white shadow-xs'
                        : 'bg-[#FAF8E8] text-[#777777] hover:bg-[#E8E3C3] hover:text-[#222222]'
                    }`}
                  >
                    {df.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-16 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 rounded-full bg-[#FAF8E8] text-[#777777] flex items-center justify-center mb-3">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <h3 className="text-sm font-bold text-[#222222]">No completed orders found</h3>
                  <p className="text-xs text-[#777777] mt-1 max-w-xs">
                    Completed orders from this terminal automatically save to IndexedDB.
                  </p>
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const outboxRecord = outboxRecords.find((r) => r.id === order.id);
                  const syncStatus = outboxRecord?.sync_status || 'synced';

                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrder(order)}
                      className="w-full text-left p-3.5 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8]/40 hover:border-[#C43C1E]/40 transition-all flex items-center justify-between gap-3 shadow-2xs group cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] font-black text-xs shrink-0">
                          {order.token}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-[#222222]">
                              {order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'}
                            </span>
                            <span className="text-[10px] text-[#777777]">
                              {formatOrderDate(order.completedAt)} • {formatOrderTime(order.completedAt)}
                            </span>
                          </div>

                          <div className="text-[11px] text-[#777777] truncate max-w-xs sm:max-w-md mt-0.5">
                            {order.items.map((it) => `${it.quantity}x ${it.productName}`).join(', ')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {/* Sync Status Badge */}
                        {syncStatus === 'synced' && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span className="hidden sm:inline">Synced</span>
                          </span>
                        )}
                        {syncStatus === 'pending' && (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span className="hidden sm:inline">Pending Sync</span>
                          </span>
                        )}
                        {syncStatus === 'failed' && (
                          <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            <span className="hidden sm:inline">Retrying</span>
                          </span>
                        )}

                        <div className="text-right">
                          <div className="text-sm font-black text-[#222222] tabular-nums">
                            {formatPaise(order.totalPaise)}
                          </div>
                          <div className="text-[10px] font-bold text-[#777777] uppercase">
                            {order.paymentMethod}
                          </div>
                        </div>

                        <ChevronRight className="w-4 h-4 text-[#777777] group-hover:text-[#C43C1E] transition-colors" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
