'use client';

import React, { useState, useEffect } from 'react';
import { formatPaise } from '@/lib/pos/calculations';
import {
  correctPaymentMethodAction,
  getPaymentCorrectionsAction,
  updateOrderAction,
} from '@/app/actions/orders';
import type { PaymentCorrectionEvent } from '@/lib/supabase/orders';
import {
  X,
  Pencil,
  AlertTriangle,
  CreditCard,
  Banknote,
  QrCode,
  ShieldCheck,
  History,
} from 'lucide-react';

interface OwnerOrderEditModalProps {
  isOpen: boolean;
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function OwnerOrderEditModal({
  isOpen,
  order,
  onClose,
  onSaved,
}: OwnerOrderEditModalProps) {
  const paymentsList: any[] = Array.isArray(order?.payments) ? order.payments : [];
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [correctionHistory, setCorrectionHistory] = useState<PaymentCorrectionEvent[]>([]);

  // For unpaid PROCESSING draft orders only
  const [draftCancelStatus, setDraftCancelStatus] = useState<'CANCELLED' | 'VOID'>('CANCELLED');
  const [cancelReason, setCancelReason] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!order) return;

    const firstPayment = Array.isArray(order.payments) && order.payments.length > 0 ? order.payments[0] : null;
    setSelectedPaymentId(firstPayment?.id || '');
    setPaymentMethod((firstPayment?.method || 'cash') as 'cash' | 'upi' | 'card');
    setCorrectionReason('');
    setCancelReason('');
    setErrorMessage(null);

    if (isOpen && order.id) {
      getPaymentCorrectionsAction(order.id).then((res) => {
        setCorrectionHistory(res.success && Array.isArray(res.data) ? res.data : []);
      });
    } else {
      setCorrectionHistory([]);
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const tokenLabel = order.token_terminal
    ? `${order.token_terminal}-${order.token_seq.toString().padStart(3, '0')}`
    : `#${order.token_seq || ''}`;

  const isCompleted = order.status === 'COMPLETED';
  const isDraftProcessing = order.status === 'PROCESSING';
  const isClosed = order.status === 'CANCELLED' || order.status === 'VOID';
  const isUnpaidDraft = isDraftProcessing && paymentsList.length === 0;

  const selectedPayment = paymentsList.find((p) => p.id === selectedPaymentId) || paymentsList[0] || null;
  const methodChanged = Boolean(selectedPayment && selectedPayment.method !== paymentMethod);

  const handleSelectPayment = (payment: any) => {
    setSelectedPaymentId(payment.id);
    setPaymentMethod(payment.method);
    setErrorMessage(null);
  };

  const handleCorrectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPayment) {
      setErrorMessage('No recorded payment found for this order.');
      return;
    }
    if (!methodChanged) {
      setErrorMessage('Select a different payment method to record a correction.');
      return;
    }
    if (!correctionReason.trim()) {
      setErrorMessage('A correction reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await correctPaymentMethodAction({
        paymentId: selectedPayment.id,
        newMethod: paymentMethod,
        reason: correctionReason.trim(),
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to record payment method correction');
        setIsSubmitting(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error while correcting payment method');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelUnpaidDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelReason.trim()) {
      setErrorMessage('Cancellation or void reason is mandatory.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await updateOrderAction(order.id, {
        status: draftCancelStatus,
        cancelled_reason: cancelReason.trim(),
      });
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to cancel unpaid order');
        setIsSubmitting(false);
        return;
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error while cancelling unpaid order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Order Audit & Tender Correction ${tokenLabel}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-lg shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E8E3C3] bg-[#FAF8E8]/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#C43C1E] text-white flex items-center justify-center shadow-xs">
              <Pencil className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#222222] tracking-tight">
                Order {tokenLabel} — Audit & Tender Correction
              </h2>
              <p className="text-xs text-[#777777]">
                ID: {order.id.slice(0, 8)}... • {new Date(order.client_completed_at).toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-zinc-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Items Preview */}
          {order.order_items && order.order_items.length > 0 && (
            <div className="p-3 rounded-xl bg-[#FAF8E8]/50 border border-[#E8E3C3]">
              <div className="text-[11px] font-bold text-[#777777] uppercase tracking-wider mb-1.5">
                Order Items ({order.order_items.length})
              </div>
              <div className="space-y-1 text-xs">
                {order.order_items.map((it: any) => (
                  <div key={it.id || it.product_name} className="flex justify-between text-[#222222]">
                    <span>
                      {it.quantity}x {it.product_name} {it.variant_label ? `(${it.variant_label})` : ''}
                    </span>
                    <span className="font-semibold tabular-nums">{formatPaise(it.total_price_paise)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Immutable Financial Breakdown */}
          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 pb-1 border-b border-zinc-200">
              <span className="flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Status: {order.status}</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider text-[#777777]">
                {isCompleted ? 'Totals Locked' : isClosed ? 'Closed' : 'Unpaid Draft'}
              </span>
            </div>
            <div className="flex justify-between text-[#777777]">
              <span>Subtotal:</span>
              <span className="tabular-nums font-semibold">{formatPaise(order.subtotal_paise || 0)}</span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Discount:</span>
              <span className="tabular-nums font-semibold">-{formatPaise(order.discount_paise || 0)}</span>
            </div>
            <div className="flex justify-between text-[#777777]">
              <span>GST Tax (5%):</span>
              <span className="tabular-nums font-semibold">+{formatPaise(order.tax_paise || 0)}</span>
            </div>
            <div className="pt-1.5 border-t border-zinc-200 flex justify-between font-black text-sm text-[#222222]">
              <span>Recorded Order Total:</span>
              <span className="text-[#C43C1E] tabular-nums">{formatPaise(order.total_paise || 0)}</span>
            </div>
          </div>

          {/* Controlled Payment Method Correction (for orders with recorded payments) */}
          {paymentsList.length > 0 && (
            <form onSubmit={handleCorrectPayment} className="space-y-3 pt-1 border-t border-[#E8E3C3]">
              <div className="text-xs font-bold text-[#222222]">
                Controlled Payment Method Correction
              </div>
              <p className="text-[11px] text-[#777777] leading-relaxed">
                Payment amount ({formatPaise(selectedPayment?.amount_paise || 0)}) and order association remain immutable. Every tender change is permanently logged.
              </p>

              {paymentsList.length > 1 && (
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold text-[#777777] uppercase">
                    Select Payment Record ({paymentsList.length} tenders)
                  </label>
                  <div className="grid grid-cols-1 gap-1.5">
                    {paymentsList.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPayment(p)}
                        className={`p-2 rounded-xl border text-xs flex items-center justify-between cursor-pointer ${
                          selectedPayment?.id === p.id
                            ? 'border-[#C43C1E] bg-[#FAF8E8] font-bold text-[#222222]'
                            : 'border-[#E8E3C3] bg-white text-[#777777]'
                        }`}
                      >
                        <span className="uppercase">{p.method}</span>
                        <span className="tabular-nums font-bold">{formatPaise(p.amount_paise)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-[#222222] mb-1">
                  Corrected Payment Tender
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'upi', 'card'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                        paymentMethod === m
                          ? 'border-[#C43C1E] bg-[#FAF8E8] text-[#C43C1E]'
                          : 'border-[#E8E3C3] bg-white text-[#777777] hover:bg-[#FAF8E8]/50'
                      }`}
                    >
                      {m === 'cash' && <Banknote className="w-3.5 h-3.5" />}
                      {m === 'upi' && <QrCode className="w-3.5 h-3.5" />}
                      {m === 'card' && <CreditCard className="w-3.5 h-3.5" />}
                      <span className="capitalize">{m}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="payment-correction-reason" className="block text-xs font-bold text-[#222222] mb-1">
                  Mandatory Correction Reason <span className="text-red-600">*</span>
                </label>
                <input
                  id="payment-correction-reason"
                  type="text"
                  required
                  placeholder="e.g. Customer paid via UPI QR; cashier tapped Cash"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
                />
              </div>

              <div className="pt-1 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !methodChanged || !correctionReason.trim()}
                  className="px-5 py-2 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Recording Correction...' : 'Record Payment Correction'}
                </button>
              </div>
            </form>
          )}

          {/* Unpaid Draft Order Cancellation (only when PROCESSING with 0 payments) */}
          {isUnpaidDraft && (
            <form onSubmit={handleCancelUnpaidDraft} className="space-y-3 pt-1 border-t border-[#E8E3C3]">
              <div className="text-xs font-bold text-[#222222]">
                Cancel / Void Unpaid Draft Order
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(['CANCELLED', 'VOID'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setDraftCancelStatus(st)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                      draftCancelStatus === st
                        ? 'border-[#C43C1E] bg-[#FAF8E8] text-[#C43C1E]'
                        : 'border-[#E8E3C3] bg-white text-[#777777]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="draft-cancel-reason" className="block text-xs font-bold text-[#222222] mb-1">
                  Mandatory Reason <span className="text-red-600">*</span>
                </label>
                <input
                  id="draft-cancel-reason"
                  type="text"
                  required
                  placeholder="e.g. Customer cancelled unpaid order"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
                />
              </div>
              <div className="pt-1 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !cancelReason.trim()}
                  className="px-5 py-2 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Updating...' : `Mark ${draftCancelStatus}`}
                </button>
              </div>
            </form>
          )}

          {/* Append-Only Payment Correction Audit History */}
          {correctionHistory.length > 0 && (
            <div className="pt-2 border-t border-[#E8E3C3] space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#222222]">
                <History className="w-3.5 h-3.5 text-[#C43C1E]" />
                <span>Payment Method Correction Audit Trail ({correctionHistory.length})</span>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {correctionHistory.map((ev) => (
                  <div key={ev.id} className="p-2.5 rounded-xl bg-[#FAF8E8]/70 border border-[#E8E3C3] text-[11px] space-y-0.5">
                    <div className="flex items-center justify-between font-bold text-[#222222]">
                      <span className="uppercase">
                        {ev.previous_method} → {ev.new_method} ({formatPaise(ev.amount_paise)})
                      </span>
                      <span className="text-[10px] text-[#777777] font-normal">
                        {new Date(ev.created_at).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-[#555555]">Reason: {ev.reason}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {paymentsList.length === 0 && !isUnpaidDraft && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] cursor-pointer"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
