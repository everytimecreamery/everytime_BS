'use client';

import React from 'react';
import { PosOrder } from '@/lib/pos/order';
import { formatPaise } from '@/lib/pos/calculations';
import { calculatePaymentDifference } from '@/lib/pos/orderHistory';
import {
  CheckCircle2,
  ArrowLeft,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Calendar,
  Clock,
  Printer,
  Pencil,
  History,
  AlertCircle,
} from 'lucide-react';
import { BrandLogo } from '@/components/shared/BrandLogo';

interface OrderReceiptViewProps {
  order: PosOrder;
  onBack?: () => void;
  onClose?: () => void;
  onRetrySync?: () => Promise<void> | void;
  isRetryingSync?: boolean;
}

function formatFullDateTime(isoString?: string | null): { dateStr: string; timeStr: string } {
  if (!isoString) return { dateStr: '--', timeStr: '--:--' };
  try {
    const d = new Date(isoString);
    const dateStr = d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const timeStr = `${hours}:${minutes} ${ampm}`;
    return { dateStr, timeStr };
  } catch {
    return { dateStr: '--', timeStr: '--:--' };
  }
}

export function OrderReceiptView({
  order,
  onBack,
  onClose,
  onRetrySync,
  isRetryingSync,
}: OrderReceiptViewProps) {
  const { dateStr, timeStr } = formatFullDateTime(order.completedAt || order.createdAt);
  const paymentDiff = calculatePaymentDifference(order);
  const hasBeenModified =
    (order.modifications && order.modifications.length > 0) || paymentDiff.differencePaise !== 0;

  const paymentIcon = {
    CASH: <Banknote className="w-3.5 h-3.5" />,
    UPI: <QrCode className="w-3.5 h-3.5" />,
    CARD: <CreditCard className="w-3.5 h-3.5" />,
  }[order.paymentMethod || 'CASH'];

  return (
    <div
      aria-label={`Historical Receipt Order ${order.token}`}
      className="flex flex-col h-full bg-white rounded-2xl overflow-hidden select-none"
    >
      {/* 1. Header Bar with Back, Print, and Close */}
      <div className="px-4 sm:px-5 py-3 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="Back to Order History"
              className="h-8 px-2.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#222222] flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to History</span>
            </button>
          )}
          <span className="text-xs font-bold text-[#777777] hidden sm:inline">
            Official Receipt Preview (Read-Only)
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print Receipt"
            className="h-8 px-2.5 rounded-lg border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#C43C1E]" />
            <span className="hidden sm:inline">Print</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Receipt View"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 2. Scrollable Receipt Paper Body */}
      <div className="flex-1 overflow-y-auto p-5 sm:p-7 max-w-xl mx-auto w-full space-y-5">
        {/* Brand & Store Stamp */}
        <div className="text-center pb-4 border-b border-dashed border-[#E8E3C3] space-y-1">
          <div className="flex justify-center mb-1">
            <BrandLogo size="md" href="#" />
          </div>
          <p className="text-[11px] font-semibold text-[#777777] tracking-wider uppercase">
            Artisan Handcrafted Gelato & Desserts
          </p>
          <div className="pt-2 flex flex-col items-center justify-center gap-2">
            {order.syncStatus === 'SYNCED' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black tracking-wide uppercase">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>ORDER CONFIRMED & PAID</span>
              </span>
            ) : order.syncStatus === 'PENDING_SYNC' ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-black tracking-wide uppercase">
                <Clock className="w-3.5 h-3.5 text-amber-600" />
                <span>SAVED LOCALLY — SYNCING TO DATABASE</span>
              </span>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 text-red-800 border border-red-200 text-xs font-black tracking-wide uppercase">
                  <AlertCircle className="w-3.5 h-3.5 text-red-600" />
                  <span>LOCAL RECEIPT — NOT YET CONFIRMED IN DATABASE</span>
                </span>
                {order.syncError && (
                  <p className="text-[11px] text-red-700 font-medium">{order.syncError}</p>
                )}
                {onRetrySync && (
                  <button
                    type="button"
                    disabled={isRetryingSync}
                    onClick={() => void onRetrySync()}
                    className="px-3 py-1 rounded-lg bg-[#C43C1E] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    {isRetryingSync ? 'Syncing...' : 'Retry Sync'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Token, Date, Time & Payment Method Metadata */}
        <div className="grid grid-cols-2 gap-3 p-3.5 bg-[#FAF8E8]/70 rounded-xl border border-[#E8E3C3] text-xs">
          <div>
            <span className="text-[10.5px] uppercase font-bold text-[#777777] block">Order Token</span>
            <span className="text-xl font-black text-[#222222] tracking-tight">{order.token}</span>
          </div>
          <div className="text-right">
            <span className="text-[10.5px] uppercase font-bold text-[#777777] block">Payment Method</span>
            <span className="inline-flex items-center gap-1 font-extrabold text-[#C43C1E] uppercase mt-1">
              {paymentIcon}
              <span>{order.paymentMethod || 'CASH'}</span>
            </span>
          </div>

          <div className="pt-2 border-t border-[#E8E3C3]/60 flex items-center gap-1 text-[#777777]">
            <Calendar className="w-3 h-3 text-[#C43C1E]" />
            <span className="font-semibold text-[#222222]">{dateStr}</span>
          </div>
          <div className="pt-2 border-t border-[#E8E3C3]/60 text-right flex items-center justify-end gap-1 text-[#777777]">
            <Clock className="w-3 h-3 text-[#C43C1E]" />
            <span className="font-semibold text-[#222222] tabular-nums">{timeStr}</span>
          </div>
        </div>

        {/* Items Breakdown */}
        <div>
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xs font-extrabold text-[#222222] uppercase tracking-wider">
              Items Ordered ({order.totalQuantity})
            </span>
            <span className="text-[11px] font-bold text-[#777777]">Price</span>
          </div>

          <div className="divide-y divide-[#FAF8E8] border border-[#E8E3C3] rounded-xl overflow-hidden bg-white">
            {order.items.map((item) => (
              <div key={item.lineId} className="p-3 flex items-start justify-between gap-3 text-xs">
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-[#222222]">{item.productName}</span>
                    {item.variantLabel && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded bg-[#FAF8E8] text-[#C43C1E] border border-[#E8E3C3]">
                        {item.variantLabel}
                      </span>
                    )}
                    {item.addOnLabel && (
                      <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200">
                        + {item.addOnLabel}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-[#777777] mt-0.5">
                    {item.quantity} × {formatPaise(item.unitPricePaise)}
                  </div>
                </div>

                <span className="font-extrabold text-[#222222] tabular-nums pt-0.5">
                  {formatPaise(item.lineTotalPaise)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Summary */}
        <div className="p-4 bg-[#FAF8E8]/50 rounded-xl border border-[#E8E3C3] space-y-2 text-xs">
          <div className="flex justify-between text-[#777777]">
            <span>Subtotal</span>
            <span className="font-bold text-[#222222] tabular-nums">{formatPaise(order.subtotalPaise)}</span>
          </div>

          {order.discountPaise > 0 && (
            <div className="flex justify-between text-[#C43C1E]">
              <span>Discount ({order.discount.percent}%)</span>
              <span className="font-bold tabular-nums">-{formatPaise(order.discountPaise)}</span>
            </div>
          )}

          <div className="flex justify-between text-[#777777]">
            <span>Tax preview (5% GST prototype)</span>
            <span className="font-bold text-[#222222] tabular-nums">{formatPaise(order.taxPreviewPaise)}</span>
          </div>

          <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline">
            <span className="text-sm font-black text-[#222222]">Total Paid</span>
            <span className="text-2xl font-black text-[#C43C1E] tabular-nums">
              {formatPaise(order.totalPaise)}
            </span>
          </div>

          {/* Cash Payment Tendered / Change Returned (Only when Cash) */}
          {order.paymentMethod === 'CASH' && (
            <div className="pt-2 mt-2 border-t border-dashed border-[#E8E3C3] text-[11.5px] space-y-1 text-[#777777]">
              <div className="flex justify-between">
                <span>Cash Tendered</span>
                <span className="font-bold text-[#222222] tabular-nums">
                  {order.tenderedPaise ? formatPaise(order.tenderedPaise) : formatPaise(order.totalPaise)}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Change Returned</span>
                <span className="font-extrabold text-emerald-700 tabular-nums">
                  {order.changePaise ? formatPaise(order.changePaise) : '₹0.00'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payment Difference Reconciliation Banner */}
        {hasBeenModified && (
          <div
            aria-label="Payment Reconciliation"
            className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/80 text-xs space-y-2"
          >
            <div className="flex items-center gap-1.5 font-bold text-amber-950">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Payment Reconciliation</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11.5px]">
              <div>
                <span className="text-[#777777] block">Original Amount Paid:</span>
                <span className="font-bold text-[#222222] tabular-nums">
                  {formatPaise(paymentDiff.originalTotalPaise)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[#777777] block">Updated Order Total:</span>
                <span className="font-bold text-[#222222] tabular-nums">
                  {formatPaise(paymentDiff.currentTotalPaise)}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-amber-200/80 flex items-center justify-between text-xs font-black">
              <span>Difference:</span>
              <span
                className={
                  paymentDiff.differencePaise > 0
                    ? 'text-[#C43C1E]'
                    : paymentDiff.differencePaise < 0
                    ? 'text-blue-700'
                    : 'text-emerald-700'
                }
              >
                {paymentDiff.differencePaise > 0
                  ? `+${formatPaise(paymentDiff.differencePaise)} (Additional Amount Due)`
                  : paymentDiff.differencePaise < 0
                  ? `-${formatPaise(Math.abs(paymentDiff.differencePaise))} (Amount Requiring Refund)`
                  : `₹0.00 (No Price Difference)`}
              </span>
            </div>
            <p className="text-[10px] text-amber-900/80 italic pt-0.5">
              Original payment method ({order.paymentMethod || 'CASH'}) and initial transaction record remain preserved.
            </p>
          </div>
        )}

        {/* Modification History / Audit Trail Section */}
        {order.modifications && order.modifications.length > 0 && (
          <div
            aria-label="Modification History"
            className="p-3.5 bg-[#FAF8E8]/90 rounded-xl border border-[#E8E3C3] space-y-2.5 text-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-bold text-[#222222]">
                <History className="w-3.5 h-3.5 text-[#C43C1E]" />
                <span>Modification History ({order.modifications.length})</span>
              </div>
              <span className="text-[9.5px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 uppercase">
                {order.modifications.length} {order.modifications.length === 1 ? 'Edit' : 'Edits'}
              </span>
            </div>

            <div className="space-y-2">
              {order.modifications.map((mod, index) => {
                const { dateStr: modDate, timeStr: modTime } = formatFullDateTime(mod.modifiedAt);
                return (
                  <div
                    key={mod.id || index}
                    className="p-2.5 bg-white rounded-lg border border-[#E8E3C3] text-[11px] space-y-1"
                  >
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-[#222222]">Modification #{index + 1}</span>
                      <span className="text-[#777777] font-semibold text-[10.5px]">
                        {modDate} · {modTime}
                      </span>
                    </div>
                    <div className="flex justify-between text-[#777777]">
                      <span>
                        Previous: <span className="line-through">{formatPaise(mod.previousTotalPaise)}</span>
                      </span>
                      <span>
                        Updated: <span className="font-bold text-[#222222]">{formatPaise(mod.newTotalPaise)}</span>
                      </span>
                    </div>
                    <div className="flex justify-between text-[10.5px] pt-0.5 border-t border-[#FAF8E8]">
                      <span>Difference:</span>
                      <span
                        className={
                          mod.differencePaise > 0
                            ? 'font-bold text-[#C43C1E]'
                            : mod.differencePaise < 0
                            ? 'font-bold text-blue-700'
                            : 'font-bold text-emerald-700'
                        }
                      >
                        {mod.differencePaise > 0
                          ? `+${formatPaise(mod.differencePaise)} (Due)`
                          : mod.differencePaise < 0
                          ? `-${formatPaise(Math.abs(mod.differencePaise))} (Refund)`
                          : '₹0.00'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Read-Only Notice */}
        <div className="text-center text-[10.5px] text-[#777777] italic pb-2">
          {hasBeenModified
            ? 'Historical transaction audit trail is permanently maintained.'
            : 'Historical records are permanently locked and immutable.'}
        </div>
      </div>
    </div>
  );
}

