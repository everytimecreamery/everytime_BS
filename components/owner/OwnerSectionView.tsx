'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { formatPaise } from '@/lib/pos/calculations';
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
  Pencil,
  Trash2,
} from 'lucide-react';
import { OwnerOrderEditModal, OwnerOrderDeleteDialog } from './OwnerOrderActionModal';
import { OwnerMenuManagementView } from './menu/OwnerMenuManagementView';

interface OwnerSectionViewProps {
  sectionId: string;
}

export function OwnerSectionView({ sectionId }: OwnerSectionViewProps) {
  switch (sectionId) {
    case 'sales':
      return <SalesView />;
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
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(dateString).toLocaleDateString('en-IN');
}

// -----------------------------------------------------------------------------
// 1. DASHBOARD VIEW (LIVE SUPABASE READS & REALTIME ORDERS)
// -----------------------------------------------------------------------------
function DashboardView() {
  const [orders, setOrders] = useState<any[]>([]);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<any | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Fetch completed orders for today
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

    // Realtime subscription for orders (INSERT, UPDATE, DELETE)
    const channel = supabase
      .channel('owner_orders_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => [payload.new, ...prev]);
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
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${
                    isOnline
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-zinc-100 text-zinc-700 border-zinc-300'
                  }`}
                >
                  {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-600" /> : <WifiOff className="w-3.5 h-3.5 text-zinc-500" />}
                  <span>{term.terminal_number || 'T01'}:</span>
                  <span className="font-normal">{formatRelativeTime(term.last_synced_at)}</span>
                </div>
              );
            })
          )}

          <button
            type="button"
            onClick={fetchData}
            aria-label="Refresh Dashboard"
            className="w-7 h-7 rounded-lg border border-[#E8E3C3] flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-[#FAF8E8] transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-[#C43C1E]' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Gross Sales (Today)</span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] flex items-center justify-center text-[#C43C1E]">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-[#222222] tabular-nums tracking-tight">
              {formatPaise(grossRevenuePaise)}
            </div>
            <div className="text-[11px] text-[#777777] mt-1">Live Synced Orders</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Completed Orders</span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] flex items-center justify-center text-[#C43C1E]">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-[#222222] tabular-nums tracking-tight">
              {completedOrderCount}
            </div>
            <div className="text-[11px] text-[#777777] mt-1">Finalized counter tickets</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Average Ticket Size</span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] flex items-center justify-center text-[#C43C1E]">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-[#222222] tabular-nums tracking-tight">
              {formatPaise(avgTicketPaise)}
            </div>
            <div className="text-[11px] text-[#777777] mt-1">Per transaction</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#777777]">Active Cashier</span>
            <div className="w-8 h-8 rounded-lg bg-[#FAF8E8] flex items-center justify-center text-[#C43C1E]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black text-[#222222] tabular-nums tracking-tight">
              Alex M.
            </div>
            <div className="text-[11px] text-emerald-700 font-bold mt-1">Terminal #01 Active</div>
          </div>
        </div>
      </div>

      {/* Recent Synced Transactions Feed */}
      <div className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#222222] mb-3">Live Synced Orders Feed (Today)</h3>
        {orders.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#777777]">
            No orders recorded in Supabase yet today. Completed orders sync automatically from the counter.
          </div>
        ) : (
          <div className="divide-y divide-[#E8E3C3]/60">
            {orders.slice(0, 10).map((order) => (
              <div key={order.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="font-bold text-[#C43C1E] bg-[#FAF8E8] px-2 py-0.5 rounded border border-[#E8E3C3]">
                    {order.token_terminal ? `${order.token_terminal}-${order.token_seq.toString().padStart(3, '0')}` : `#${order.token_seq}`}
                  </span>
                  <span className="text-[#777777]">
                    {new Date(order.client_completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
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
                      onClick={() => setEditingOrder(order)}
                      aria-label="Edit Order"
                      className="p-1 rounded-md border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer"
                      title="Edit Order"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingOrder(order)}
                      aria-label="Delete Order"
                      className="p-1 rounded-md border border-red-200 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                      title="Delete Order"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <OwnerOrderEditModal
        isOpen={Boolean(editingOrder)}
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSaved={fetchData}
      />

      <OwnerOrderDeleteDialog
        isOpen={Boolean(deletingOrder)}
        order={deletingOrder}
        onClose={() => setDeletingOrder(null)}
        onDeleted={fetchData}
      />
    </div>
  );
}

// -----------------------------------------------------------------------------
// 2. SALES VIEW (TRANSACTION LEDGER & TENDER SPLIT)
// -----------------------------------------------------------------------------
function SalesView() {
  const [orders, setOrders] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState<any | null>(null);
  const [deletingOrder, setDeletingOrder] = useState<any | null>(null);

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const { data: oData } = await supabase
        .from('orders')
        .select('*, order_items(*), payments(*)')
        .order('client_completed_at', { ascending: false })
        .limit(100);

      if (oData) setOrders(oData);

      const { data: pData } = await supabase
        .from('payments')
        .select('*')
        .limit(200);

      if (pData) setPayments(pData);
    } catch (err) {
      console.warn('Sales fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSales();

    const channel = supabase
      .channel('owner_sales_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          setOrders((prev) => [payload.new, ...prev]);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadSales]);

  // Split payment totals
  const cashTotal = payments.filter((p) => p.method === 'cash').reduce((sum, p) => sum + p.amount_paise, 0);
  const upiTotal = payments.filter((p) => p.method === 'upi').reduce((sum, p) => sum + p.amount_paise, 0);
  const cardTotal = payments.filter((p) => p.method === 'card').reduce((sum, p) => sum + p.amount_paise, 0);

  return (
    <div className="space-y-6">
      {/* Payment Tender Split Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#777777]">Cash Tendered</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">{formatPaise(cashTotal)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Banknote className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#777777]">UPI / QR Digital</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">{formatPaise(upiTotal)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <QrCode className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#E8E3C3] flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-[#777777]">Card / EDC Machine</div>
            <div className="text-xl font-black text-[#222222] tabular-nums mt-1">{formatPaise(cardTotal)}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <CreditCard className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#222222] mb-3">All Finalized Orders (Supabase Records)</h3>
        {loading ? (
          <div className="text-center py-8 text-xs text-[#777777]">Loading sales ledger...</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-8 text-xs text-[#777777]">No finalized sales found.</div>
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
                    <td className="p-2.5 text-[#777777]">{new Date(o.client_completed_at).toLocaleString('en-IN')}</td>
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
                          : o.status === 'VOID'
                          ? 'bg-zinc-100 text-zinc-700 border-zinc-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditingOrder(o)}
                          aria-label={`Edit Order ${o.token_seq}`}
                          className="p-1.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#777777] hover:text-[#C43C1E] transition-colors cursor-pointer"
                          title="Edit Order"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeletingOrder(o)}
                          aria-label={`Delete Order ${o.token_seq}`}
                          className="p-1.5 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 transition-colors cursor-pointer"
                          title="Delete Order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OwnerOrderEditModal
        isOpen={Boolean(editingOrder)}
        order={editingOrder}
        onClose={() => setEditingOrder(null)}
        onSaved={loadSales}
      />

      <OwnerOrderDeleteDialog
        isOpen={Boolean(deletingOrder)}
        order={deletingOrder}
        onClose={() => setDeletingOrder(null)}
        onDeleted={loadSales}
      />
    </div>
  );
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
