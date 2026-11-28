'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { createClient } from '@/utils/supabase/client';
import { formatPaise } from '@/lib/pos/calculations';
import {
  getOwnerBillingMonitoringAction,
  getBillingSessionDetailsAction,
  type OwnerBillingMonitoringPayload,
  type BillingSessionSummary,
  type BillingSessionDetailPayload,
  type BillingSessionEventRecord,
} from '@/app/actions/billing-sessions';
import {
  Clock,
  Store,
  UserCheck,
  ShoppingBag,
  IndianRupee,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Eye,
  X,
  Banknote,
  QrCode,
  CreditCard,
  Bell,
  History,
  Activity,
  Receipt,
} from 'lucide-react';

export function formatDurationSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  return `${pad(minutes)}m ${pad(seconds)}s`;
}

export function formatTimestampIST(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });
}

interface BillingMonitoringViewProps {
  pollIntervalMs?: number;
  enableSse?: boolean;
}

export function BillingMonitoringView({
  pollIntervalMs = 10000,
  enableSse = true,
}: BillingMonitoringViewProps) {
  const supabase = useMemo(() => createClient(), []);
  const [monitoring, setMonitoring] =
    useState<OwnerBillingMonitoringPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'STOPPED'>(
    'ALL'
  );
  const [liveNotifications, setLiveNotifications] = useState<
    Array<{ id: string; message: string; timestamp: string; type: 'start' | 'stop' | 'order' }>
  >([]);
  const [nowTickMs, setNowTickMs] = useState(() => Date.now());

  // Detail inspection drawer/modal state
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null
  );
  const [sessionDetail, setSessionDetail] =
    useState<BillingSessionDetailPayload | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const prevSnapshotRef = useRef<OwnerBillingMonitoringPayload | null>(null);
  const selectedSessionIdRef = useRef<string | null>(null);
  selectedSessionIdRef.current = selectedSessionId;

  // Tick every second so active session durations update live without waiting for network
  useEffect(() => {
    const timer = setInterval(() => {
      setNowTickMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const detectAndEmitNotifications = useCallback(
    (nextData: OwnerBillingMonitoringPayload) => {
      const prev = prevSnapshotRef.current;
      prevSnapshotRef.current = nextData;
      if (!prev) return;

      const newAlerts: Array<{
        id: string;
        message: string;
        timestamp: string;
        type: 'start' | 'stop' | 'order';
      }> = [];

      for (const nextTerm of nextData.terminals) {
        const prevTerm = prev.terminals.find(
          (t) => t.terminal_id === nextTerm.terminal_id
        );
        if (!prevTerm) continue;

        const termLabel = `${nextTerm.store_name} · Terminal #${nextTerm.terminal_number}`;

        if (!prevTerm.billing_active && nextTerm.billing_active && nextTerm.active_session) {
          const staff =
            nextTerm.active_session.staff_member_name ||
            nextTerm.active_session.started_by_name ||
            'Staff';
          newAlerts.push({
            id: `start-${nextTerm.active_session.session_id}-${Date.now()}`,
            type: 'start',
            timestamp: nextTerm.active_session.started_at,
            message: `Billing STARTED on ${termLabel} by ${staff}`,
          });
        } else if (prevTerm.billing_active && !nextTerm.billing_active) {
          const stoppedSess = nextTerm.last_session;
          const staff =
            stoppedSess?.stopped_by_name ||
            stoppedSess?.staff_member_name ||
            'Staff';
          newAlerts.push({
            id: `stop-${stoppedSess?.session_id || nextTerm.terminal_id}-${Date.now()}`,
            type: 'stop',
            timestamp: stoppedSess?.stopped_at || nextData.server_now,
            message: `Billing STOPPED on ${termLabel} by ${staff} (${stoppedSess?.order_count ?? 0} orders · ${formatPaise(stoppedSess?.sales_total_paise ?? 0)})`,
          });
        } else if (
          prevTerm.billing_active &&
          nextTerm.billing_active &&
          prevTerm.active_session &&
          nextTerm.active_session &&
          nextTerm.active_session.order_count >
            prevTerm.active_session.order_count
        ) {
          const diffOrders =
            nextTerm.active_session.order_count -
            prevTerm.active_session.order_count;
          newAlerts.push({
            id: `order-${nextTerm.active_session.session_id}-${nextTerm.active_session.order_count}`,
            type: 'order',
            timestamp: nextData.server_now,
            message: `${diffOrders} new order(s) completed on ${termLabel} — Session total now ${formatPaise(nextTerm.active_session.sales_total_paise)} (${nextTerm.active_session.order_count} orders)`,
          });
        }
      }

      if (newAlerts.length > 0) {
        setLiveNotifications((curr) => [...newAlerts, ...curr].slice(0, 8));
      }
    },
    []
  );

  const loadSessionDetail = useCallback(async (sessionId: string, silent = false) => {
    if (!silent) {
      setDetailLoading(true);
      setDetailError(null);
    }
    try {
      const res = await getBillingSessionDetailsAction(sessionId);
      if (!res.success || !res.data) {
        if (!silent) {
          setDetailError(res.error || 'Failed to load session order details.');
        }
        return;
      }
      setSessionDetail(res.data);
    } catch (err: any) {
      if (!silent) {
        setDetailError(err?.message || 'Unexpected error loading session details.');
      }
    } finally {
      if (!silent) {
        setDetailLoading(false);
      }
    }
  }, []);

  const fetchMonitoringSnapshot = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await getOwnerBillingMonitoringAction();
        if (!res.success || !res.data) {
          if (!silent) {
            setError(res.error || 'Failed to fetch billing monitoring data.');
          }
          return;
        }
        detectAndEmitNotifications(res.data);
        setMonitoring(res.data);
        setError(null);

        if (selectedSessionIdRef.current) {
          void loadSessionDetail(selectedSessionIdRef.current, true);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err?.message || 'Network error fetching billing monitoring data.');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [detectAndEmitNotifications, loadSessionDetail]
  );

  // Initial load
  useEffect(() => {
    void fetchMonitoringSnapshot(false);
  }, [fetchMonitoringSnapshot]);

  // 1. Server-Sent Events (SSE) BFF stream connection
  useEffect(() => {
    if (!enableSse || typeof window === 'undefined' || typeof EventSource === 'undefined') {
      return;
    }

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/owner/billing-stream');
      es.addEventListener('monitoring_update', (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data) as OwnerBillingMonitoringPayload;
          if (payload && Array.isArray(payload.terminals)) {
            detectAndEmitNotifications(payload);
            setMonitoring(payload);
            setLoading(false);
          }
        } catch {
          // ignore malformed event
        }
      });
    } catch {
      // fallback to realtime & polling
    }

    return () => {
      if (es) {
        es.close();
      }
    };
  }, [enableSse, detectAndEmitNotifications]);

  // 2. Supabase Realtime subscription on billing_sessions, billing_session_events, and orders
  useEffect(() => {
    const channel = (supabase as any)
      .channel('owner-billing-monitoring-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_sessions' },
        () => {
          void fetchMonitoringSnapshot(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'billing_session_events' },
        () => {
          void fetchMonitoringSnapshot(true);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          void fetchMonitoringSnapshot(true);
        }
      )
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [supabase, fetchMonitoringSnapshot]);

  // 3. Automatic Polling Fallback so owner sees changes even if WebSockets/SSE are blocked
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;
    const timer = setInterval(() => {
      void fetchMonitoringSnapshot(true);
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [pollIntervalMs, fetchMonitoringSnapshot]);

  const handleOpenSessionDetails = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setSessionDetail(null);
    void loadSessionDetail(sessionId, false);
  };

  const handleCloseSessionDetails = () => {
    setSelectedSessionId(null);
    setSessionDetail(null);
    setDetailError(null);
  };

  const filteredSessions = useMemo(() => {
    const all = monitoring?.historical_sessions || [];
    if (statusFilter === 'ALL') return all;
    return all.filter((s) => s.status === statusFilter);
  }, [monitoring, statusFilter]);

  const computeLiveDuration = (session: BillingSessionSummary): number => {
    if (session.status === 'STOPPED' || session.stopped_at) {
      return session.duration_seconds;
    }
    const startMs = new Date(session.started_at).getTime();
    if (Number.isNaN(startMs)) return session.duration_seconds;
    return Math.max(0, Math.floor((nowTickMs - startMs) / 1000));
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-5 rounded-xl border border-[#E8E3C3] shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-[#222222]">
              Live Billing Session Monitor
            </h2>
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              Live Auto-Sync
            </span>
          </div>
          <p className="text-xs text-[#777777] mt-1">
            Real-time counter billing ON/OFF status, employee attribution, session sales totals, and line-item order audits. Operating hours (11:00 AM – 2:00 AM) are informational; billing is manually controlled by counter staff.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchMonitoringSnapshot(false)}
          disabled={loading}
          aria-label="Refresh Billing Monitor"
          className="h-9 px-3.5 rounded-lg bg-[#FAF8E8] hover:bg-[#E8E3C3]/60 border border-[#E8E3C3] text-xs font-bold text-[#222222] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold flex items-center gap-2.5"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Instant Live Notification Banner Feed */}
      {liveNotifications.length > 0 && (
        <div
          role="region"
          aria-label="Live Billing Notifications"
          className="bg-white rounded-xl border border-[#C43C1E]/30 p-4 shadow-xs space-y-2"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[#C43C1E]">
              <Bell className="w-3.5 h-3.5" />
              <span>Instant Billing Notifications</span>
            </div>
            <button
              type="button"
              onClick={() => setLiveNotifications([])}
              className="text-[11px] font-bold text-[#777777] hover:text-[#222222] underline cursor-pointer"
            >
              Clear notifications
            </button>
          </div>
          <div className="space-y-1.5">
            {liveNotifications.map((item) => (
              <div
                key={item.id}
                role="status"
                className={`px-3 py-2 rounded-lg border text-xs font-bold flex flex-wrap items-center justify-between gap-2 ${
                  item.type === 'start'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : item.type === 'stop'
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-[#FAF8E8] border-[#E8E3C3] text-[#222222]'
                }`}
              >
                <span>{item.message}</span>
                <span className="text-[11px] font-medium opacity-75">
                  {formatTimestampIST(item.timestamp)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 1. Store & Terminal Current Billing Status Cards */}
      <section aria-label="Terminal Billing Status Overview" className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-[#222222] uppercase tracking-wider flex items-center gap-2">
            <Store className="w-4 h-4 text-[#C43C1E]" />
            <span>Current Status by Store & Terminal</span>
          </h3>
        </div>

        {loading && !monitoring ? (
          <div className="p-8 bg-white rounded-xl border border-[#E8E3C3] text-center text-xs text-[#777777]">
            Loading live terminal billing status...
          </div>
        ) : (monitoring?.terminals || []).length === 0 ? (
          <div className="p-8 bg-white rounded-xl border border-[#E8E3C3] text-center text-xs text-[#777777]">
            No registered terminals found.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {(monitoring?.terminals || []).map((term) => {
              const activeSess = term.active_session;
              const lastSess = term.last_session;
              const lastEvent = term.last_event;

              return (
                <article
                  key={term.terminal_id}
                  aria-label={`${term.store_name} Terminal #${term.terminal_number}`}
                  className={`rounded-xl border p-5 bg-white shadow-2xs transition-all ${
                    term.billing_active
                      ? 'border-emerald-300 ring-1 ring-emerald-200'
                      : 'border-[#E8E3C3]'
                  }`}
                >
                  {/* Card Top: Store, Terminal & ON/OFF Badge */}
                  <div className="flex items-start justify-between gap-3 pb-3.5 border-b border-[#FAF8E8]">
                    <div>
                      <div className="text-xs font-bold text-[#777777] uppercase tracking-wider">
                        {term.store_name}
                      </div>
                      <h4 className="text-base font-extrabold text-[#222222] mt-0.5">
                        Terminal #{term.terminal_number} ·{' '}
                        {term.device_name || 'Counter Terminal'}
                      </h4>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${
                        term.billing_active
                          ? 'bg-emerald-600 text-white border-emerald-700'
                          : 'bg-rose-700 text-white border-rose-800'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          term.billing_active
                            ? 'bg-white animate-pulse'
                            : 'bg-rose-200'
                        }`}
                      />
                      <span>BILLING {term.status}</span>
                    </span>
                  </div>

                  {/* Card Body: Active or Stopped Session Metrics */}
                  {term.billing_active && activeSess ? (
                    <div className="mt-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                          <span className="text-[10px] font-bold uppercase text-[#777777] block">
                            Staff Member
                          </span>
                          <span className="text-xs font-extrabold text-[#222222] mt-0.5 block">
                            {activeSess.staff_member_name ||
                              activeSess.started_by_name ||
                              'Counter Staff'}
                          </span>
                          {activeSess.cashier_code && (
                            <span className="text-[10px] font-bold text-emerald-800">
                              {activeSess.cashier_code}
                            </span>
                          )}
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                          <span className="text-[10px] font-bold uppercase text-[#777777] block">
                            Session Duration
                          </span>
                          <span className="text-xs font-black text-emerald-900 mt-0.5 block tabular-nums">
                            {formatDurationSeconds(computeLiveDuration(activeSess))}
                          </span>
                          <span className="text-[10px] text-[#777777] block">
                            Started {formatTimestampIST(activeSess.started_at)}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                          <span className="text-[10px] font-bold uppercase text-[#777777] block">
                            Session Orders
                          </span>
                          <span className="text-sm font-black text-[#222222] mt-0.5 block tabular-nums">
                            {activeSess.order_count}
                          </span>
                        </div>

                        <div className="p-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
                          <span className="text-[10px] font-bold uppercase text-[#777777] block">
                            Session Sales
                          </span>
                          <span className="text-sm font-black text-emerald-800 mt-0.5 block tabular-nums">
                            {formatPaise(activeSess.sales_total_paise)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#FAF8E8] text-xs">
                        <div className="text-[#555555]">
                          <span className="font-bold">Payment Split:</span> Cash{' '}
                          {formatPaise(activeSess.cash_paise)} · UPI{' '}
                          {formatPaise(activeSess.upi_paise)} · Card{' '}
                          {formatPaise(activeSess.card_paise)}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenSessionDetails(activeSess.session_id)
                          }
                          aria-label={`Inspect active session for Terminal #${term.terminal_number}`}
                          className="px-3 py-1.5 rounded-lg bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Inspect Active Session</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      <div className="p-3 rounded-lg bg-[#FAF8E8] border border-[#E8E3C3] text-xs">
                        <div className="font-bold text-[#222222]">
                          Billing is currently OFF on this terminal.
                        </div>
                        {lastSess ? (
                          <div className="text-[#555555] mt-1 space-y-0.5">
                            <div>
                              <strong>Last Session:</strong>{' '}
                              {formatTimestampIST(lastSess.started_at)} →{' '}
                              {formatTimestampIST(lastSess.stopped_at)} (
                              {formatDurationSeconds(lastSess.duration_seconds)})
                            </div>
                            <div>
                              <strong>Staff:</strong>{' '}
                              {lastSess.staff_member_name ||
                                lastSess.started_by_name ||
                                '—'}{' '}
                              {lastSess.cashier_code
                                ? `(${lastSess.cashier_code})`
                                : ''}{' '}
                              · <strong>Orders:</strong> {lastSess.order_count} ·{' '}
                              <strong>Sales:</strong>{' '}
                              {formatPaise(lastSess.sales_total_paise)}
                            </div>
                            {lastSess.stop_reason && (
                              <div>
                                <strong>Stop Reason:</strong>{' '}
                                {lastSess.stop_reason}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-[#777777] mt-1">
                            No historical billing sessions recorded yet.
                          </div>
                        )}
                      </div>

                      {lastSess && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() =>
                              handleOpenSessionDetails(lastSess.session_id)
                            }
                            aria-label={`Inspect last session for Terminal #${term.terminal_number}`}
                            className="px-3 py-1.5 rounded-lg bg-white hover:bg-[#FAF8E8] border border-[#E8E3C3] text-[#222222] text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#C43C1E]" />
                            <span>Inspect Last Session</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Last Start/Stop Event Audit Footer */}
                  {lastEvent && (
                    <div className="mt-3 pt-2.5 border-t border-[#FAF8E8] text-[11px] text-[#777777] flex flex-wrap items-center justify-between gap-2">
                      <span>
                        <strong>Last Event:</strong>{' '}
                        {lastEvent.event_type === 'SESSION_STARTED'
                          ? 'Billing Started'
                          : 'Billing Stopped'}{' '}
                        by{' '}
                        {lastEvent.staff_member_name ||
                          lastEvent.actor_name ||
                          'Staff'}
                        {lastEvent.reason ? ` (${lastEvent.reason})` : ''}
                      </span>
                      <span className="font-semibold">
                        {formatTimestampIST(lastEvent.created_at)}
                      </span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 2. Recent Billing Start / Stop Event Log */}
      {(monitoring?.recent_events || []).length > 0 && (
        <section
          aria-label="Recent Billing Start and Stop Events"
          className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-2xs space-y-3"
        >
          <h3 className="text-sm font-extrabold text-[#222222] uppercase tracking-wider flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#C43C1E]" />
            <span>Every Billing Start & Stop Event Log</span>
          </h3>

          <div className="divide-y divide-[#FAF8E8] max-h-56 overflow-y-auto">
            {(monitoring?.recent_events || []).slice(0, 12).map((ev) => (
              <div
                key={ev.id}
                className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                      ev.event_type === 'SESSION_STARTED'
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                        : 'bg-rose-100 text-rose-900 border border-rose-300'
                    }`}
                  >
                    {ev.event_type === 'SESSION_STARTED' ? 'START' : 'STOP'}
                  </span>
                  <span className="font-bold text-[#222222]">
                    {ev.store_name} · Terminal #{ev.terminal_number}
                  </span>
                  <span className="text-[#555555]">
                    Staff:{' '}
                    <strong>
                      {ev.staff_member_name || ev.actor_name || 'Staff'}
                    </strong>
                    {ev.cashier_code ? ` (${ev.cashier_code})` : ''}
                  </span>
                  {ev.reason && (
                    <span className="text-[#777777] italic">
                      Reason: &ldquo;{ev.reason}&rdquo;
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-[#777777] tabular-nums">
                  {formatTimestampIST(ev.created_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Historical & Active Billing Sessions Table */}
      <section
        aria-label="Billing Sessions History"
        className="bg-white rounded-xl border border-[#E8E3C3] p-5 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-[#222222] uppercase tracking-wider flex items-center gap-2">
              <History className="w-4 h-4 text-[#C43C1E]" />
              <span>Billing Sessions & Sales Totals</span>
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Select any active or historical session to inspect every order, item, variant, discount, tax, and payment breakdown.
            </p>
          </div>

          <div className="flex items-center gap-1.5">
            {(['ALL', 'ACTIVE', 'STOPPED'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? 'bg-[#C43C1E] text-white'
                    : 'bg-[#FAF8E8] text-[#222222] hover:bg-[#E8E3C3]/60'
                }`}
              >
                {st === 'ALL'
                  ? 'All Sessions'
                  : st === 'ACTIVE'
                    ? 'Active Only'
                    : 'Historical (Stopped)'}
              </button>
            ))}
          </div>
        </div>

        {filteredSessions.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#777777] bg-[#FAF8E8]/50 rounded-xl border border-[#E8E3C3]">
            No billing sessions match the current filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#E8E3C3] text-[11px] font-bold uppercase text-[#777777] bg-[#FAF8E8]/60">
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Store & Terminal</th>
                  <th className="py-3 px-3">Staff Member</th>
                  <th className="py-3 px-3">Started / Stopped (Server)</th>
                  <th className="py-3 px-3">Duration</th>
                  <th className="py-3 px-3 text-right">Orders</th>
                  <th className="py-3 px-3 text-right">Sales Total</th>
                  <th className="py-3 px-3">Payment Breakdown</th>
                  <th className="py-3 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#FAF8E8]">
                {filteredSessions.map((sess) => (
                  <tr
                    key={sess.session_id}
                    className="hover:bg-[#FAF8E8]/40 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase ${
                          sess.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-neutral-100 text-neutral-800 border border-neutral-300'
                        }`}
                      >
                        {sess.status}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#222222]">
                        {sess.store_name}
                      </div>
                      <div className="text-[11px] text-[#777777]">
                        Terminal #{sess.terminal_number}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#222222]">
                        {sess.staff_member_name ||
                          sess.started_by_name ||
                          'Counter Staff'}
                      </div>
                      {sess.cashier_code && (
                        <div className="text-[11px] font-mono text-[#777777]">
                          {sess.cashier_code}
                        </div>
                      )}
                      {sess.stop_reason && (
                        <div className="text-[11px] text-amber-800 mt-0.5">
                          Stop reason: {sess.stop_reason}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 tabular-nums">
                      <div>
                        <span className="text-[#777777]">Start:</span>{' '}
                        <span className="font-semibold text-[#222222]">
                          {formatTimestampIST(sess.started_at)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#777777]">Stop:</span>{' '}
                        <span className="font-semibold text-[#222222]">
                          {sess.stopped_at
                            ? formatTimestampIST(sess.stopped_at)
                            : 'Active Now'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 font-bold tabular-nums text-[#222222]">
                      {formatDurationSeconds(computeLiveDuration(sess))}
                    </td>
                    <td className="py-3 px-3 text-right font-extrabold tabular-nums text-[#222222]">
                      {sess.order_count}
                    </td>
                    <td className="py-3 px-3 text-right font-black tabular-nums text-[#C43C1E]">
                      {formatPaise(sess.sales_total_paise)}
                    </td>
                    <td className="py-3 px-3 text-[11px] text-[#555555] tabular-nums">
                      <div>Cash: {formatPaise(sess.cash_paise)}</div>
                      <div>UPI: {formatPaise(sess.upi_paise)}</div>
                      <div>Card: {formatPaise(sess.card_paise)}</div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleOpenSessionDetails(sess.session_id)}
                        aria-label={`View session orders for ${sess.session_id}`}
                        className="px-3 py-1.5 rounded-lg bg-[#FAF8E8] hover:bg-[#C43C1E] hover:text-white border border-[#E8E3C3] text-[#222222] text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Orders</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Detailed Session Orders & Financial Audit Modal */}
      {selectedSessionId && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="session-detail-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs overflow-y-auto"
        >
          <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-6">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#E8E3C3] flex items-center justify-between bg-[#FAF8E8]">
              <div>
                <div className="flex items-center gap-2">
                  <h3
                    id="session-detail-dialog-title"
                    className="text-base sm:text-lg font-extrabold text-[#222222]"
                  >
                    Billing Session Detailed Audit
                  </h3>
                  {sessionDetail?.session && (
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                        sessionDetail.session.status === 'ACTIVE'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-800 text-white'
                      }`}
                    >
                      {sessionDetail.session.status}
                    </span>
                  )}
                </div>
                {sessionDetail?.session && (
                  <p className="text-xs text-[#555555] mt-0.5">
                    {sessionDetail.session.store_name} · Terminal #
                    {sessionDetail.session.terminal_number} · Staff:{' '}
                    <strong>
                      {sessionDetail.session.staff_member_name ||
                        sessionDetail.session.started_by_name ||
                        'Staff'}
                    </strong>
                    {sessionDetail.session.cashier_code
                      ? ` (${sessionDetail.session.cashier_code})`
                      : ''}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handleCloseSessionDetails}
                aria-label="Close session details"
                className="w-8 h-8 rounded-lg bg-white border border-[#E8E3C3] flex items-center justify-center text-[#555555] hover:text-[#222222] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 flex-1">
              {detailLoading ? (
                <div className="p-8 text-center text-xs text-[#777777]">
                  Loading authoritative session orders and item breakdowns...
                </div>
              ) : detailError ? (
                <div
                  role="alert"
                  className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-semibold"
                >
                  {detailError}
                </div>
              ) : sessionDetail ? (
                <>
                  {/* Financial Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        Orders
                      </span>
                      <span className="text-sm font-black text-[#222222] mt-0.5 block">
                        {sessionDetail.session.order_count}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        Subtotal
                      </span>
                      <span className="text-sm font-extrabold text-[#222222] mt-0.5 block">
                        {formatPaise(sessionDetail.session.subtotal_paise)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        Discounts
                      </span>
                      <span className="text-sm font-extrabold text-amber-800 mt-0.5 block">
                        -{formatPaise(sessionDetail.session.discount_paise)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        GST (CGST + SGST)
                      </span>
                      <span className="text-sm font-extrabold text-[#222222] mt-0.5 block">
                        {formatPaise(sessionDetail.session.tax_paise)}
                      </span>
                      <span className="text-[10px] text-[#777777] block">
                        {formatPaise(sessionDetail.session.cgst_paise)} +{' '}
                        {formatPaise(sessionDetail.session.sgst_paise)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        Final Sales Total
                      </span>
                      <span className="text-sm font-black text-[#C43C1E] mt-0.5 block">
                        {formatPaise(sessionDetail.session.sales_total_paise)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-[#FAF8E8] border border-[#E8E3C3]">
                      <span className="text-[10px] font-bold uppercase text-[#777777] block">
                        Payment Methods
                      </span>
                      <div className="text-[11px] font-bold text-[#222222] mt-0.5 space-y-0.5">
                        <div>Cash: {formatPaise(sessionDetail.session.cash_paise)}</div>
                        <div>UPI: {formatPaise(sessionDetail.session.upi_paise)}</div>
                        <div>Card: {formatPaise(sessionDetail.session.card_paise)}</div>
                      </div>
                    </div>
                  </div>

                  {/* Session Timestamps & Metadata */}
                  <div className="p-3.5 rounded-xl bg-neutral-50 border border-neutral-200 text-xs flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong>Started At:</strong>{' '}
                      {formatTimestampIST(sessionDetail.session.started_at)} (by{' '}
                      {sessionDetail.session.started_by_name || 'Staff'})
                    </div>
                    <div>
                      <strong>Stopped At:</strong>{' '}
                      {sessionDetail.session.stopped_at
                        ? `${formatTimestampIST(sessionDetail.session.stopped_at)} (by ${sessionDetail.session.stopped_by_name || 'Staff'})`
                        : 'Currently Active'}
                    </div>
                    <div>
                      <strong>Duration:</strong>{' '}
                      {formatDurationSeconds(
                        computeLiveDuration(sessionDetail.session)
                      )}
                    </div>
                    {sessionDetail.session.stop_reason && (
                      <div>
                        <strong>Stop Reason:</strong>{' '}
                        {sessionDetail.session.stop_reason}
                      </div>
                    )}
                  </div>

                  {/* Individual Orders List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-extrabold uppercase tracking-wider text-[#222222] flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-[#C43C1E]" />
                      <span>
                        Complete Individual Orders ({sessionDetail.orders.length})
                      </span>
                    </h4>

                    {sessionDetail.orders.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#777777] bg-[#FAF8E8]/40 rounded-xl border border-[#E8E3C3]">
                        No completed orders were processed during this billing session.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {sessionDetail.orders.map((ord) => (
                          <div
                            key={ord.id}
                            aria-label={`Session Order ${ord.token}`}
                            className="rounded-xl border border-[#E8E3C3] bg-white p-4 space-y-3 shadow-2xs"
                          >
                            {/* Order Top Bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#FAF8E8]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="px-2.5 py-0.5 rounded-md bg-[#FAF8E8] border border-[#E8E3C3] text-xs font-black text-[#222222]">
                                  Order {ord.token}
                                </span>
                                <span className="text-xs text-[#555555]">
                                  Cashier Attribution:{' '}
                                  <strong>
                                    {ord.staff_member_name ||
                                      ord.cashier_profile_name ||
                                      'Staff'}
                                  </strong>
                                  {ord.cashier_code
                                    ? ` (${ord.cashier_code})`
                                    : ''}
                                </span>
                              </div>
                              <div className="text-[11px] text-[#777777] font-semibold">
                                Completed: {formatTimestampIST(ord.client_completed_at)} ·
                                Business Date: {ord.business_date}
                              </div>
                            </div>

                            {/* Line Items Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className="text-[10px] font-bold uppercase text-[#777777] border-b border-[#FAF8E8]">
                                    <th className="py-1.5 text-left">Item & Variant / Add-on</th>
                                    <th className="py-1.5 text-right">Qty</th>
                                    <th className="py-1.5 text-right">Unit Price</th>
                                    <th className="py-1.5 text-right">Line Total</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#FAF8E8]">
                                  {ord.items.map((item) => (
                                    <tr key={item.id}>
                                      <td className="py-2 pr-2">
                                        <span className="font-bold text-[#222222]">
                                          {item.product_name}
                                        </span>
                                        {item.variant_label && (
                                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-[#FAF8E8] text-[10px] font-bold text-[#555555]">
                                            {item.variant_label}
                                          </span>
                                        )}
                                        {item.addon_label && (
                                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-50 text-[10px] font-bold text-amber-900">
                                            + {item.addon_label}
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 text-right font-bold tabular-nums">
                                        {item.quantity}
                                      </td>
                                      <td className="py-2 px-2 text-right tabular-nums text-[#555555]">
                                        {formatPaise(item.effective_unit_price_paise)}
                                      </td>
                                      <td className="py-2 pl-2 text-right font-bold tabular-nums text-[#222222]">
                                        {formatPaise(item.total_price_paise)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>

                            {/* Order Totals & Payment Breakdown Footer */}
                            <div className="pt-2.5 border-t border-[#FAF8E8] flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-bold text-[#555555]">
                                  Payments:
                                </span>
                                {ord.payments.map((pay) => (
                                  <span
                                    key={pay.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-950 font-bold uppercase text-[11px]"
                                  >
                                    <span>{pay.method}</span>
                                    <span>{formatPaise(pay.amount_paise)}</span>
                                    {pay.upi_utr && (
                                      <span className="text-[10px] font-mono text-emerald-800">
                                        (UTR: {pay.upi_utr})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>

                              <div className="flex flex-wrap items-center gap-3 tabular-nums">
                                <span>
                                  Subtotal:{' '}
                                  <strong>{formatPaise(ord.subtotal_paise)}</strong>
                                </span>
                                {ord.discount_paise > 0 && (
                                  <span className="text-amber-800">
                                    Discount:{' '}
                                    <strong>-{formatPaise(ord.discount_paise)}</strong>
                                  </span>
                                )}
                                <span>
                                  Tax (CGST {formatPaise(ord.cgst_paise)} + SGST{' '}
                                  {formatPaise(ord.sgst_paise)}):{' '}
                                  <strong>{formatPaise(ord.tax_paise)}</strong>
                                </span>
                                <span className="text-sm font-black text-[#C43C1E]">
                                  Total: {formatPaise(ord.total_paise)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
