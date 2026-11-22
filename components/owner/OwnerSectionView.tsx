'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/pos/calculations';
import { getStoreBusinessDate } from '@/lib/pos/dateRange';
import { mapSupabaseOrderToPosOrder } from '@/lib/supabase/orders';
import { OrderReceiptView } from '@/components/staff/pos/OrderReceiptView';
import { OwnerSalesView } from './sales/OwnerSalesView';
import { OwnerMenuManagementView } from './menu/OwnerMenuManagementView';
import {
  TrendingUp,
  CreditCard,
  ShoppingBag,
  Users,
  FileSpreadsheet,
  Layers,
  Settings2,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Banknote,
  QrCode,
  Store,
  Wifi,
  WifiOff,
  Receipt,
} from 'lucide-react';

interface OwnerSectionViewProps {
  sectionId: string;
}

export function OwnerSectionView({ sectionId }: OwnerSectionViewProps) {
  switch (sectionId) {
    case 'sales':
      return <OwnerSalesView />;
    case 'reports':
      return <ReportsView />;
    case 'menu':
      return <OwnerMenuManagementView />;
    case 'staff-management':
      return <StaffManagementView />;
    case 'settings':
      return <SettingsView />;
    case 'dashboard':
    default:
      return <DashboardView />;
  }
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Never synced';
  const diffMs = Math.max(0, Date.now() - new Date(dateString).getTime());
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(dateString).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' });
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD VIEW (LIVE SUPABASE READS & REALTIME ORDERS)
// -----------------------------------------------------------------------------
function DashboardView() {
  const [orders, setOrders] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<any | null>(null);
  const [activeBusinessDate, setActiveBusinessDate] = useState<string>('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = getStoreBusinessDate(new Date());
      setActiveBusinessDate(today);

      // 1. Fetch completed orders for today's business date
      const { data: ordersData } = await supabase
        .from('orders')
        .select('*, order_items(*), payments(*)')
        .eq('status', 'COMPLETED')
        .eq('business_date', today)
        .order('client_completed_at', { ascending: false });

      if (ordersData) setOrders(ordersData);

      // 2. Fetch terminals for staleness badge
      const { data: termData } = await supabase
        .from('terminals')
        .select('*');

      if (termData) setTerminals(termData);
    } catch (err) {
      console.warn('Dashboard fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();

    // Realtime subscription for orders and terminals
    const channel = supabase
      .channel('owner_orders_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => [payload.new, ...prev]);
          // Refresh terminals to reflect updated last_synced_at
          supabase.from('terminals').select('*').then(({ data }) => {
            if (data) setTerminals(data);
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => prev.map((o) => (o.id === payload.new.id ? { ...o, ...payload.new } : o)));
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => prev.filter((o) => o.id !== (payload.old as any).id));
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'terminals' },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setTerminals((prev) =>
              prev.map((t) => (t.id === payload.new.id ? { ...t, ...payload.new } : t))
            );
          } else {
            supabase.from('terminals').select('*').then(({ data }) => {
              if (data) setTerminals(data);
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  // Aggregate metrics
  const grossRevenuePaise = useMemo(
    () => orders.reduce((sum, o) => sum + (o.total_paise || 0), 0),
    [orders]
  );
  const completedOrderCount = orders.length;
  const avgTicketPaise = completedOrderCount > 0 ? Math.round(grossRevenuePaise / completedOrderCount) : 0;

  return (
    <div className="space-y-6">
      {/* Staleness / Terminal Status Bar */}
      <div className="bg-white p-3 sm:px-4 sm:py-3 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Store className="w-4 h-4 text-[#C43C1E]" />
          <span className="text-xs font-bold text-[#222222]">Terminal Sync Monitoring:</span>
        </div>

        <div className="flex items-center gap-3">
          {terminals.length === 0 ? (
            <span className="text-xs text-[#777777] italic">No terminals registered</span>
          ) : (
            terminals.map((term) => {
              const diffMs = term.last_synced_at ? Date.now() - new Date(term.last_synced_at).getTime() : Infinity;
              const isOnline = diffMs < 120_000; // online if synced in last 2 mins

              return (
                <div
                  key={term.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${
                    isOnline
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>{term.device_name || term.name || 'Counter Terminal'} ({term.terminal_number ? `T${term.terminal_number}` : term.terminal_code || 'T1'})</span>
                  <span className="text-[#777777] font-normal">•</span>
                  <span className="font-normal">{formatRelativeTime(term.last_synced_at)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* KPI Cards (Today-Scoped) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Gross Sales (Today)</span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] text-[#C43C1E] flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#222222] tabular-nums mt-2">
            {formatPaise(grossRevenuePaise)}
          </div>
          <div className="text-[11px] text-[#777777] mt-1">Live Synced Orders</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Completed Orders</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#222222] tabular-nums mt-2">
            {completedOrderCount}
          </div>
          <div className="text-[11px] text-[#777777] mt-1">Tickets Settled Today</div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Average Ticket</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#222222] tabular-nums mt-2">
            {formatPaise(avgTicketPaise)}
          </div>
          <div className="text-[11px] text-[#777777] mt-1">Per Paid Transaction</div>
        </div>
      </div>

      {/* Quick Nav / System Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#C43C1E]" />
            <h3 className="text-sm font-bold text-[#222222]">Direct Supabase Sync Status</h3>
          </div>
          <p className="text-xs text-[#777777] leading-relaxed">
            Staff POS terminal transactions push straight into the Postgres cloud backend. Realtime websockets immediately broadcast new tickets to this portal.
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Database Pipeline Live & Synchronized</span>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-[#C43C1E]" />
            <h3 className="text-sm font-bold text-[#222222]">Store Business Day Cutoff</h3>
          </div>
          <p className="text-xs text-[#777777] leading-relaxed">
            The business day rolls over at 04:00 AM IST daily. Late-night sales belong to the previous operating date to ensure cash drawer and Z-report accuracy.
          </p>
          <div className="mt-4 flex items-center justify-between text-xs font-bold text-[#222222] bg-[#FAF8E8] p-2.5 rounded-lg border border-[#E8E3C3]">
            <span>Active Business Date:</span>
            <span className="text-[#C43C1E]">{activeBusinessDate || 'Current Business Day'}</span>
          </div>
        </div>
      </div>

      {/* Recent Synced Transactions Feed */}
      <div className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#222222] mb-3">Live Synced Orders Feed (Today)</h3>
        {loading ? (
          <div className="text-center py-8 text-xs text-[#777777]">Loading synced transactions...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#777777]">
            No orders recorded in Supabase yet today. Completed orders sync automatically from the counter.
          </div>
        ) : (
          <div className="divide-y divide-[#E8E3C3]/50">
            {orders.slice(0, 10).map((order) => (
              <div key={order.id} className="py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-bold text-[#222222] flex items-center gap-2">
                    <span className="text-[#C43C1E]">
                      {order.token_terminal ? `${order.token_terminal}-${order.token_seq.toString().padStart(3, '0')}` : `#${order.token_seq}`}
                    </span>
                    <span className="text-[#777777] font-normal">•</span>
                    <span className="text-[#777777] font-normal">
                      {new Date(order.client_completed_at || order.created_at).toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true,
                      })}
                    </span>
                  </div>
                  <div className="text-[11px] text-[#777777] mt-0.5">
                    {order.order_items?.length || 0} items • {order.payments?.[0]?.method?.toUpperCase() || 'CASH'}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-[#222222] tabular-nums">
                    {formatPaise(order.total_paise)}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                    order.status === 'COMPLETED'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : order.status === 'REFUNDED'
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {order.status}
                  </span>

                  <div className="flex items-center gap-1 pl-1 border-l border-[#E8E3C3]">
                    <button
                      type="button"
                      onClick={() => setSelectedReceiptOrder(order)}
                      aria-label={`View receipt for order ${order.token_seq}`}
                      className="p-1 rounded-md border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer"
                      title="View Official Receipt"
                    >
                      <Receipt className="w-3.5 h-3.5 text-[#C43C1E]" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Official Receipt Modal Preview (Read-Only) */}
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

// -----------------------------------------------------------------------------
// 2. SALES VIEW (DELEGATED TO DEDICATED OWNER SALES VIEW)
// -----------------------------------------------------------------------------
export function SalesView() {
  return <OwnerSalesView />;
}

// -----------------------------------------------------------------------------
// 3. REPORTS VIEW (Z-REPORT DAILY CLOSURE)
// -----------------------------------------------------------------------------
function ReportsView() {
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadZReports() {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('z_reports')
          .select('*')
          .order('shift_date', { ascending: false });

        if (data) setReports(data);
      } catch (err) {
        console.warn('Z-report fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadZReports();
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-8 text-center shadow-xs">
      <div className="w-14 h-14 rounded-2xl bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#C43C1E] mx-auto mb-4">
        <FileSpreadsheet className="w-7 h-7" />
      </div>
      <h3 className="text-lg font-bold text-[#222222]">Z-Report & Daily Register Closure</h3>
      <p className="text-sm text-[#777777] max-w-lg mx-auto mt-2 leading-relaxed">
        End-of-day register closure, expected cash vs actual counted cash audit, product mix breakdown, and printable Z-reports for store accounting.
      </p>

      {reports.length === 0 ? (
        <div className="mt-6 text-xs text-[#777777] italic">
          No past Z-reports generated yet. The first daily closure will generate at the 04:00 AM cutoff.
        </div>
      ) : (
        <div className="mt-6 text-left max-w-xl mx-auto divide-y divide-[#E8E3C3]">
          {reports.map((r) => (
            <div key={r.id} className="py-3 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-[#222222]">Date: {r.shift_date}</span>
                <span className="text-[#777777] block text-[11px]">{r.total_orders} Orders</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-[#C43C1E] text-sm tabular-nums">{formatPaise(r.gross_sales_paise)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// 5. STAFF MANAGEMENT VIEW
// -----------------------------------------------------------------------------
function StaffManagementView() {
  const [profiles, setProfiles] = useState<any[]>([]);

  useEffect(() => {
    async function loadProfiles() {
      try {
        const { data } = await supabase.from('profiles').select('*');
        if (data) setProfiles(data);
      } catch (err) {
        console.warn('Profiles load error:', err);
      }
    }
    loadProfiles();
  }, []);

  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-xs">
      <h3 className="text-sm font-bold text-[#222222] mb-3">Staff Accounts & Counter Cashiers</h3>
      <div className="space-y-2">
        {profiles.length === 0 ? (
          <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3] text-xs flex items-center justify-between">
            <span className="font-bold text-[#222222]">Alex M. (Terminal #01 Cashier)</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Staff Active</span>
          </div>
        ) : (
          profiles.map((p) => (
            <div key={p.id} className="p-3 bg-white rounded-xl border border-[#E8E3C3] text-xs flex items-center justify-between">
              <div>
                <span className="font-bold text-[#222222] block">{p.full_name}</span>
                <span className="text-[11px] text-[#777777]">Code: {p.cashier_code || 'C01'}</span>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                {p.role}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// 6. SETTINGS VIEW
// -----------------------------------------------------------------------------
function SettingsView() {
  return (
    <div className="bg-white rounded-xl border border-[#E8E3C3] p-6 shadow-xs max-w-2xl space-y-4">
      <h3 className="text-sm font-bold text-[#222222]">Store Settings & Hardware Parameters</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3]">
          <span className="text-[#777777] block text-[10px] font-bold uppercase">Store Name</span>
          <span className="font-bold text-[#222222] text-sm">Everytime Creamery</span>
        </div>
        <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3]">
          <span className="text-[#777777] block text-[10px] font-bold uppercase">Tax Configuration</span>
          <span className="font-bold text-[#222222] text-sm">5% GST (2.5% CGST + 2.5% SGST)</span>
        </div>
        <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3]">
          <span className="text-[#777777] block text-[10px] font-bold uppercase">Business Day Cutoff</span>
          <span className="font-bold text-[#222222] text-sm">04:00 AM Daily</span>
        </div>
        <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3]">
          <span className="text-[#777777] block text-[10px] font-bold uppercase">Thermal Printer Width</span>
          <span className="font-bold text-[#222222] text-sm">80mm ESC/POS Roll</span>
        </div>
      </div>
    </div>
  );
}

export default OwnerSectionView;
