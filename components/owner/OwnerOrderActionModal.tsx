'use client';

import React, { useState, useEffect } from 'react';
import {
  formatPaise,
  paiseToRupees,
  rupeesToPaise,
  formatSignedRoundOffPaise,
  calculateOrderFinancialBreakdown,
} from '@/lib/pos/calculations';
import { updateOrderInDatabase, deleteOrderFromDatabase } from '@/lib/supabase/orders';
import {
  X,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Banknote,
  QrCode,
  Receipt,
} from 'lucide-react';

interface OwnerOrderEditModalProps {
  isOpen: boolean;
  order: any | null;
  onClose: () => void;
  onSaved: () => void;
}

interface OwnerOrderDeleteDialogProps {
  isOpen: boolean;
  order: any | null;
  onClose: () => void;
  onDeleted: () => void;
}

export function OwnerOrderEditModal({
  isOpen,
  order,
  onClose,
  onSaved,
}: OwnerOrderEditModalProps) {
  const [status, setStatus] = useState<string>('COMPLETED');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [discountRupees, setDiscountRupees] = useState<string>('0');
  const [discountReason, setDiscountReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (order) {
      setStatus(order.status || 'COMPLETED');
      const currentMethod =
        order.payments?.[0]?.method || (order.paymentMethod ? order.paymentMethod.toLowerCase() : 'cash');
      setPaymentMethod(currentMethod);
      setDiscountRupees(String(paiseToRupees(order.discount_paise || 0)));
      setDiscountReason(order.discount_reason || '');
      setErrorMessage(null);
    }
  }, [order]);

  if (!isOpen || !order) return null;

  const tokenLabel = order.token_terminal
    ? `${order.token_terminal}-${order.token_seq.toString().padStart(3, '0')}`
    : `#${order.token_seq || ''}`;

  const subtotalPaise = order.subtotal_paise || 0;
  const numDiscountRupees = Math.max(0, parseFloat(discountRupees) || 0);
  const newDiscountPaise = Math.min(subtotalPaise, rupeesToPaise(numDiscountRupees));
  const discountedSubtotalPaise = Math.max(0, subtotalPaise - newDiscountPaise);
  // Standard 5% GST on ice cream / bakery
  const newTaxPaise = Math.round(discountedSubtotalPaise * 0.05);
  const breakdown = calculateOrderFinancialBreakdown(subtotalPaise, newDiscountPaise, newTaxPaise);
  const newRoundOffPaise = breakdown.roundOffPaise;
  const newTotalPaise = breakdown.finalPayablePaise;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await updateOrderInDatabase(order.id, {
        status: status as any,
        discount_paise: newDiscountPaise,
        discount_reason: discountReason || undefined,
        tax_paise: newTaxPaise,
        round_off_paise: newRoundOffPaise,
        total_paise: newTotalPaise,
        payment_method: paymentMethod,
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to update order');
        setIsSubmitting(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error while updating order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit Order ${tokenLabel}`}
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
                Edit Order {tokenLabel}
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
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

          {/* Status Selection */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">Order Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30 cursor-pointer"
            >
              <option value="COMPLETED">COMPLETED (Valid Paid Order)</option>
              <option value="REFUNDED">REFUNDED (Money Returned)</option>
              <option value="CANCELLED">CANCELLED (Order Annulled)</option>
              <option value="VOID">VOID (Accidental Ticket)</option>
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label className="block text-xs font-bold text-[#222222] mb-1">Payment Tender</label>
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

          {/* Discount Adjustment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">Discount (₹ Rupees)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={discountRupees}
                onChange={(e) => setDiscountRupees(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs font-bold text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-[#222222] mb-1">Reason / Note</label>
              <input
                type="text"
                placeholder="e.g. Owner courtesy, Correction"
                value={discountReason}
                onChange={(e) => setDiscountReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#E8E3C3] bg-white text-xs text-[#222222] focus:outline-none focus:ring-2 focus:ring-[#C43C1E]/30"
              />
            </div>
          </div>

          {/* Financial Recalculation Summary */}
          <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 space-y-1.5 text-xs">
            <div className="flex justify-between text-[#777777]">
              <span>Subtotal:</span>
              <span className="tabular-nums font-semibold">{formatPaise(subtotalPaise)}</span>
            </div>
            <div className="flex justify-between text-amber-700">
              <span>Adjusted Discount:</span>
              <span className="tabular-nums font-semibold">-{formatPaise(newDiscountPaise)}</span>
            </div>
            <div className="flex justify-between text-[#777777]">
              <span>GST Tax (5%):</span>
              <span className="tabular-nums font-semibold">+{formatPaise(newTaxPaise)}</span>
            </div>
            <div className="flex justify-between text-[#777777]">
              <span>Round Off:</span>
              <span className="tabular-nums font-semibold">{formatSignedRoundOffPaise(newRoundOffPaise)}</span>
            </div>
            <div className="pt-1.5 border-t border-zinc-200 flex justify-between font-black text-sm text-[#222222]">
              <span>Updated Total Payable:</span>
              <span className="text-[#C43C1E] tabular-nums">{formatPaise(newTotalPaise)}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'Saving Changes...' : 'Save Order Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OwnerOrderDeleteDialog({
  isOpen,
  order,
  onClose,
  onDeleted,
}: OwnerOrderDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !order) return null;

  const tokenLabel = order.token_terminal
    ? `${order.token_terminal}-${order.token_seq.toString().padStart(3, '0')}`
    : `#${order.token_seq || ''}`;

  const handleDelete = async () => {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await deleteOrderFromDatabase(order.id);
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to delete order from Supabase');
        setIsDeleting(false);
        return;
      }
      onDeleted();
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected exception during deletion');
      setIsDeleting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Confirm Delete Order ${tokenLabel}`}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-red-200 w-full max-w-md shadow-2xl p-5 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-200">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black text-[#222222]">
              Permanently Delete Order {tokenLabel}?
            </h3>
            <p className="text-xs text-[#777777] mt-0.5">
              Total: {formatPaise(order.total_paise || 0)} • {new Date(order.client_completed_at).toLocaleDateString('en-IN')}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs">
            {errorMessage}
          </div>
        )}

        <div className="text-xs text-[#555555] bg-red-50/60 p-3.5 rounded-xl border border-red-100 leading-relaxed">
          <strong className="text-red-900 block mb-1">Warning: Irreversible Action</strong>
          Deleting this order permanently removes the transaction record, line items, and payment tender from the Supabase database.
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isDeleting ? 'Deleting...' : 'Delete Permanently'}
          </button>
        </div>
      </div>
    </div>
  );
}
