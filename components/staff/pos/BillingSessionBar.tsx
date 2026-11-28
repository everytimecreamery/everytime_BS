'use client';

import React, { useState, useEffect } from 'react';
import { formatPaise } from '@/lib/pos/calculations';
import type {
  ActiveCashierOption,
  TerminalBillingStatusSnapshot,
} from '@/app/actions/billing-sessions';
import {
  Play,
  Square,
  Clock,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShoppingBag,
  IndianRupee,
  History,
} from 'lucide-react';

export function formatDurationHms(totalSeconds: number): string {
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

export function formatTimeShort(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}

interface BillingSessionBarProps {
  billingStatus: TerminalBillingStatusSnapshot | null;
  isLoading: boolean;
  isActionPending: boolean;
  selectedStaffMemberId: string;
  onSelectStaffMember: (staffMemberId: string) => void;
  onStartBilling: () => Promise<void>;
  onStopBilling: (stopReason?: string) => Promise<void>;
  feedback: { type: 'success' | 'error'; message: string } | null;
  onClearFeedback: () => void;
}

export function BillingSessionBar({
  billingStatus,
  isLoading,
  isActionPending,
  selectedStaffMemberId,
  onSelectStaffMember,
  onStartBilling,
  onStopBilling,
  feedback,
  onClearFeedback,
}: BillingSessionBarProps) {
  const [stopReason, setStopReason] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const isActive = Boolean(billingStatus?.active && billingStatus?.active_session);
  const activeSession = billingStatus?.active_session || null;
  const previousSession = billingStatus?.previous_session || null;
  const activeCashiers: ActiveCashierOption[] = billingStatus?.active_cashiers || [];

  // Live duration timer when billing is ON
  useEffect(() => {
    if (!isActive || !activeSession?.started_at) {
      setElapsedSeconds(0);
      return;
    }

    const startMs = new Date(activeSession.started_at).getTime();
    const updateElapsed = () => {
      if (Number.isNaN(startMs)) return;
      const diffSec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSeconds(diffSec);
    };

    updateElapsed();
    const timer = setInterval(updateElapsed, 1000);
    return () => clearInterval(timer);
  }, [isActive, activeSession?.started_at]);

  const selectedCashier = activeCashiers.find(
    (c) => c.id === selectedStaffMemberId
  );

  const displayedEmployeeLabel = selectedCashier
    ? `${selectedCashier.full_name} (${selectedCashier.cashier_code})`
    : activeSession?.staff_member_name
      ? `${activeSession.staff_member_name}${
          activeSession.cashier_code ? ` (${activeSession.cashier_code})` : ''
        }`
      : billingStatus?.actor?.full_name
        ? `${billingStatus.actor.full_name}${
            billingStatus.actor.cashier_code
              ? ` (${billingStatus.actor.cashier_code})`
              : ''
          }`
        : 'Counter Cashier';

  const handleStopClick = async () => {
    const reasonToSend = stopReason.trim();
    await onStopBilling(reasonToSend || undefined);
    setStopReason('');
  };

  return (
    <section
      aria-label="Manual Billing Session Controls"
      className={`mx-3 sm:mx-5 mt-1.5 rounded-xl border px-3.5 py-2.5 transition-colors shrink-0 ${
        isActive
          ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
          : 'bg-amber-50/90 border-amber-300 text-amber-950'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        {/* Left: Current Billing Status & Session Details */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Badge */}
          <div
            role="status"
            aria-label={isActive ? 'Billing Status: ON' : 'Billing Status: OFF'}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border ${
              isActive
                ? 'bg-emerald-600 text-white border-emerald-700'
                : 'bg-rose-700 text-white border-rose-800'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isActive ? 'bg-white animate-pulse' : 'bg-rose-200'
              }`}
            />
            <span>{isActive ? 'BILLING ON' : 'BILLING OFF'}</span>
          </div>

          {isActive && activeSession ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 font-bold text-emerald-950 bg-white/90 px-2.5 py-1 rounded-lg border border-emerald-200">
                <Clock className="w-3.5 h-3.5 text-emerald-700" />
                <span>Started: {formatTimeShort(activeSession.started_at)}</span>
              </span>

              <span
                aria-label="Current session duration"
                className="inline-flex items-center gap-1 font-black text-emerald-900 bg-white/90 px-2.5 py-1 rounded-lg border border-emerald-200"
              >
                <span>Duration: {formatDurationHms(elapsedSeconds)}</span>
              </span>

              <span
                aria-label="Session order count"
                className="inline-flex items-center gap-1 font-bold text-emerald-950 bg-white/90 px-2.5 py-1 rounded-lg border border-emerald-200"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-emerald-700" />
                <span>{activeSession.order_count} orders</span>
              </span>

              <span
                aria-label="Session sales total"
                className="inline-flex items-center gap-1 font-black text-emerald-950 bg-white/90 px-2.5 py-1 rounded-lg border border-emerald-200"
              >
                <IndianRupee className="w-3.5 h-3.5 text-emerald-700" />
                <span>{formatPaise(activeSession.sales_total_paise || 0)}</span>
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-amber-950">
                Billing is currently stopped. Start billing to enable counter checkouts.
              </span>
              {previousSession && (
                <span
                  aria-label="Previous billing session summary"
                  className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#555555] bg-white/90 px-2.5 py-1 rounded-lg border border-amber-200"
                >
                  <History className="w-3.5 h-3.5 text-[#C43C1E]" />
                  <span>
                    Last session: {formatTimeShort(previousSession.started_at)}–
                    {formatTimeShort(previousSession.stopped_at)} ·{' '}
                    {previousSession.order_count} orders (
                    {formatPaise(previousSession.sales_total_paise || 0)})
                    {previousSession.staff_member_name
                      ? ` · ${previousSession.staff_member_name}`
                      : ''}
                    {previousSession.stop_reason
                      ? ` (${previousSession.stop_reason})`
                      : ''}
                  </span>
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right: Employee Attribution Selector & START / STOP Action */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Selected Employee Operational Attribution */}
          <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-[#E8E3C3] text-xs">
            <UserCheck className="w-3.5 h-3.5 text-[#C43C1E] shrink-0" />
            <label
              htmlFor="pos-cashier-select"
              className="text-[11px] font-bold text-[#777777] whitespace-nowrap"
            >
              Employee:
            </label>
            {activeCashiers.length > 0 ? (
              <select
                id="pos-cashier-select"
                aria-label="Selected Employee"
                value={selectedStaffMemberId}
                onChange={(e) => onSelectStaffMember(e.target.value)}
                disabled={isActionPending}
                className="text-xs font-bold text-[#222222] bg-transparent focus:outline-none cursor-pointer pr-1"
              >
                {activeCashiers.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.full_name} ({emp.cashier_code})
                  </option>
                ))}
              </select>
            ) : (
              <span
                id="pos-cashier-select"
                className="text-xs font-bold text-[#222222]"
              >
                {displayedEmployeeLabel}
              </span>
            )}
          </div>

          {/* Action Controls */}
          {isActive ? (
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                aria-label="Optional stop billing reason"
                placeholder="Stop reason (optional)"
                value={stopReason}
                onChange={(e) => setStopReason(e.target.value)}
                disabled={isActionPending}
                maxLength={120}
                className="h-8 px-2.5 rounded-lg bg-white border border-emerald-300 text-xs text-[#222222] placeholder:text-[#888888] focus:outline-none focus:ring-2 focus:ring-rose-600 w-36 sm:w-44"
              />
              <button
                type="button"
                onClick={handleStopClick}
                disabled={isActionPending || isLoading}
                aria-label="STOP BILLING"
                className="h-8 px-3.5 rounded-lg bg-rose-700 hover:bg-rose-800 disabled:opacity-60 text-white text-xs font-black tracking-wide inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                {isActionPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Square className="w-3.5 h-3.5 fill-current" />
                )}
                <span>{isActionPending ? 'STOPPING...' : 'STOP BILLING'}</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onStartBilling}
              disabled={isActionPending || isLoading}
              aria-label="START BILLING"
              className="h-8 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-black tracking-wide inline-flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              {isActionPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{isActionPending ? 'STARTING...' : 'START BILLING'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmed Server Feedback Banner */}
      {feedback && (
        <div
          role={feedback.type === 'error' ? 'alert' : 'status'}
          className={`mt-2 px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-rose-100 border-rose-300 text-rose-900'
              : 'bg-emerald-100 border-emerald-300 text-emerald-900'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={onClearFeedback}
            className="text-[11px] font-black underline hover:no-underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}
    </section>
  );
}
