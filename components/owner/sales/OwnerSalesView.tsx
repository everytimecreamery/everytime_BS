'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/pos/calculations';
import {
  RANGE_OPTIONS,
  SalesDateRangeType,
  resolveDateRange,
  getStoreBusinessDate,
  DateRangeFilter,
} from '@/lib/pos/dateRange';
import { fetchSalesLedger, mapSupabaseOrderToPosOrder } from '@/lib/supabase/orders';
import { OrderReceiptView } from '@/components/staff/pos/OrderReceiptView';
import {
  Banknote,
  QrCode,
  CreditCard,
  Receipt,
  Calendar,
  AlertCircle,
} from 'lucide-react';

export function OwnerSalesView() {
  // 1. Filter State (Default selection: 'today')
  const [activeRangeType, setActiveRangeType] = useState<SalesDateRangeType>('today');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [appliedCustom, setAppliedCustom] = useState<{ from: string; to: string } | undefined>(undefined);
  const [customError, setCustomError] = useState<string | null>(null);
  const [mounted, setMounted] = useState<boolean>(false);

  // 2. Data State
  const [orders, setOrders] = useState<any[]>([]);
  const [grossPaise, setGrossPaise] = useState<number>(0);
  const [cashTotal, setCashTotal] = useState<number>(0);
  const [upiTotal, setUpiTotal] = useState<number>(0);
  const [cardTotal, setCardTotal] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);

  // 3. Receipt Viewer State
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any | null>(null);

  // On client mount, initialize store business dates without triggering Next.js prerender errors
  useEffect(() => {
    const today = getStoreBusinessDate(new Date());
    setCustomFrom(today);
    setCustomTo(today);
    setAppliedCustom({ from: today, to: today });
    setMounted(true);
  }, []);

  // Resolve current active filter
  const currentFilter: DateRangeFilter = useMemo(() => {
    if (!mounted) {
      return {
        type: activeRangeType,
        label: 'Today',
        summaryLabel: 'Today',
        isValid: false,
      };
    }
    return resolveDateRange(activeRangeType, new Date(), appliedCustom);
  }, [mounted, activeRangeType, appliedCustom]);

  // Load sales ledger scoped server-side to business_date
  const loadSales = useCallback(async (filter: DateRangeFilter) => {
    if (!filter.isValid) return;
    setLoading(true);
    try {
      const res = await fetchSalesLedger({
        type: filter.type,
        from: filter.from,
        to: filter.to,
      });

      setOrders(res.orders);
      setGrossPaise(res.grossPaise);
      setCashTotal(res.cashPaise);
      setUpiTotal(res.upiPaise);
      setCardTotal(res.cardPaise);
    } catch (err) {
      console.warn('[OwnerSalesView] Error loading sales ledger:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch when mounted and range filter is valid
  useEffect(() => {
    if (mounted && currentFilter.isValid) {
      loadSales(currentFilter);
    }
  }, [mounted, currentFilter, loadSales]);

  // Realtime subscription: refetch on new order insert, update, or delete
  useEffect(() => {
    if (!mounted) return;

    const channel = supabase
      .channel('owner_sales_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          if (currentFilter.isValid) {
            loadSales(currentFilter);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payments' },
        () => {
          if (currentFilter.isValid) {
            loadSales(currentFilter);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mounted, currentFilter, loadSales]);

  // Handle Range Pill Click
  const handleRangeSelect = (type: SalesDateRangeType) => {
    setActiveRangeType(type);
    setCustomError(null);
    if (type === 'custom') {
      const today = getStoreBusinessDate(new Date());
      setCustomFrom(today);
      setCustomTo(today);
      setAppliedCustom({ from: today, to: today });
    }
  };

  // Handle Custom Apply
  const handleApplyCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const testFilter = resolveDateRange('custom', new Date(), { from: customFrom, to: customTo });
    if (!testFilter.isValid) {
      setCustomError(testFilter.error || 'Invalid date range');
      return;
    }
    setCustomError(null);
    setAppliedCustom({ from: customFrom, to: customTo });
  };

  return (
    <div className="space-y-6">
      {/* 1. Date Range Filter Controls */}
      <div className="bg-white rounded-xl border border-[#E8E3C3] p-4 shadow-xs space-y-3">
        {/* Segmented Pill Control */}
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Sales Date Range Filter">
          {RANGE_OPTIONS.map((opt) => {
            const isActive = activeRangeType === opt.type;
            return (
              <button
                key={opt.type}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleRangeSelect(opt.type)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border ${
                  isActive
                    ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-xs'
                    : 'bg-white text-[#777777] border-[#E8E3C3] hover:text-[#222222] hover:bg-[#FAF8E8]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Custom Range Drawer */}
        {activeRangeType === 'custom' && (
          <form
            onSubmit={handleApplyCustom}
            className="flex flex-wrap items-center gap-3 p-3 bg-[#FAF8E8]/70 rounded-xl border border-[#E8E3C3] text-xs"
          >
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#C43C1E] shrink-0" />
              <label htmlFor="custom-from" className="font-bold text-[#777777]">
                From:
              </label>
              <input
                id="custom-from"
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E8E3C3] bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
              />
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="custom-to" className="font-bold text-[#777777]">
                To:
              </label>
              <input
                id="custom-to"
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-[#E8E3C3] bg-white text-xs font-medium text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
              />
            </div>

            <button
              type="submit"
              className="px-4 py-1.5 rounded-lg bg-[#C43C1E] hover:bg-[#AB3419] text-white font-bold text-xs transition-colors shadow-xs cursor-pointer"
            >
              Apply
            </button>

            {customError && (
              <div className="flex items-center gap-1.5 text-red-600 font-bold text-xs ml-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{customError}</span>
              </div>
            )}
          </form>
        )}

        {/* 2. Summary Line */}
        <div className="text-xs font-bold text-[#555555] pt-1 border-t border-[#E8E3C3]/50">
          Showing {orders.length} {orders.length === 1 ? 'order' : 'orders'} • {formatPaise(grossPaise)} gross • {currentFilter.summaryLabel}
        </div>
      </div>

      {/* 3. Payment Tender Split Summary Cards (Recomputed from joined payments of in-range orders) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Cash Tender Card */}
        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-bold text-[#777777]">Cash Tendered</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">
              {loading ? (
                <div className="h-6 w-24 bg-zinc-200 animate-pulse rounded" />
              ) : (
                formatPaise(cashTotal)
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Banknote className="w-5 h-5" />
          </div>
        </div>

        {/* UPI Digital Card */}
        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-bold text-[#777777]">UPI / QR Digital</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">
              {loading ? (
                <div className="h-6 w-24 bg-zinc-200 animate-pulse rounded" />
              ) : (
                formatPaise(upiTotal)
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
        </div>

        {/* Card / EDC Machine Card */}
        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-bold text-[#777777]">Card / EDC Machine</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">
              {loading ? (
                <div className="h-6 w-24 bg-zinc-200 animate-pulse rounded" />
              ) : (
                formatPaise(cardTotal)
              )}
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. All Finalized Orders Table */}
      <div className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-[#222222]">All Finalized Orders (Supabase Records)</h3>
          <span className="text-[11px] font-bold text-[#777777] uppercase tracking-wider">
            {currentFilter.summaryLabel}
          </span>
        </div>

        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8E8] text-[#777777] font-bold border-b border-[#E8E3C3]">
                <tr>
                  <th className="p-2.5">Token</th>
                  <th className="p-2.5">Date & Time</th>
                  <th className="p-2.5">Subtotal</th>
                  <th className="p-2.5">Discount</th>
                  <th className="p-2.5">Tax (GST)</th>
                  <th className="p-2.5">Final Total</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3C3]/50">
                {[1, 2, 3].map((idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="p-2.5"><div className="h-4 w-12 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-28 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-14 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-12 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-12 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-16 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5"><div className="h-4 w-16 bg-zinc-200 rounded" /></td>
                    <td className="p-2.5 text-right"><div className="h-6 w-20 bg-zinc-200 rounded ml-auto" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : orders.length === 0 ? (
          <div className="text-center py-12 px-4">
            <div className="w-12 h-12 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mx-auto mb-3">
              <Receipt className="w-6 h-6 text-[#C43C1E]" />
            </div>
            <h4 className="text-sm font-bold text-[#222222]">No finalized orders in this range</h4>
            <p className="text-xs text-[#777777] mt-1 max-w-sm mx-auto">
              There are no completed sales recorded for {currentFilter.summaryLabel}. Try selecting another date range above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#FAF8E8] text-[#777777] font-bold border-b border-[#E8E3C3]">
                <tr>
                  <th className="p-2.5">Token</th>
                  <th className="p-2.5">Date & Time</th>
                  <th className="p-2.5">Subtotal</th>
                  <th className="p-2.5">Discount</th>
                  <th className="p-2.5">Tax (GST)</th>
                  <th className="p-2.5">Final Total</th>
                  <th className="p-2.5">Status</th>
                  <th className="p-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E8E3C3]/50">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-[#FAF8E8]/30">
                    <td className="p-2.5 font-bold text-[#C43C1E]">
                      {o.token_terminal ? `${o.token_terminal}-${o.token_seq.toString().padStart(3, '0')}` : `#${o.token_seq}`}
                    </td>
                    <td className="p-2.5 text-[#777777] whitespace-nowrap">
                      {new Date(o.client_completed_at || o.created_at).toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </td>
                    <td className="p-2.5 tabular-nums">{formatPaise(o.subtotal_paise)}</td>
                    <td className="p-2.5 tabular-nums text-amber-700">{formatPaise(o.discount_paise)}</td>
                    <td className="p-2.5 tabular-nums">{formatPaise(o.tax_paise)}</td>
                    <td className="p-2.5 font-black text-[#222222] tabular-nums">{formatPaise(o.total_paise)}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        o.status === 'COMPLETED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : o.status === 'REFUNDED'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelectedReceiptOrder(o)}
                        aria-label={`View receipt for order ${o.token_seq}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer shadow-2xs"
                        title="View Official Receipt"
                      >
                        <Receipt className="w-3.5 h-3.5 text-[#C43C1E]" />
                        <span>View receipt</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 5. Official Receipt Modal Preview (Read-Only) */}
      {selectedReceiptOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Receipt Order ${selectedReceiptOrder.token_terminal ? `${selectedReceiptOrder.token_terminal}-${selectedReceiptOrder.token_seq.toString().padStart(3, '0')}` : `#${selectedReceiptOrder.token_seq}`}`}
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-md shadow-2xl h-[90vh] max-h-[720px] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            <OrderReceiptView
              order={mapSupabaseOrderToPosOrder(selectedReceiptOrder)}
              onClose={() => setSelectedReceiptOrder(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
