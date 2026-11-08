'use client';

import React, { useState, useEffect } from 'react';
import { PosOrder, PaymentMethod } from '@/lib/pos/order';
import {
  formatPaise,
  calculateCashChangePaise,
  rupeesToPaise,
  paiseToRupees,
} from '@/lib/pos/calculations';
import {
  CreditCard,
  Banknote,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
} from 'lucide-react';

interface PaymentPreviewDialogProps {
  isOpen: boolean;
  order: PosOrder;
  onClose: () => void;
  onConfirmPayment: (
    method: PaymentMethod,
    tenderedPaise?: number,
    changePaise?: number
  ) => void;
}

function PaymentPreviewModal({
  order,
  onClose,
  onConfirmPayment,
}: Omit<PaymentPreviewDialogProps, 'isOpen'>) {
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod>(() =>
    order.paymentMethod ? order.paymentMethod : 'CASH'
  );
  const [tenderedInput, setTenderedInput] = useState<string>(() =>
    Math.ceil(paiseToRupees(order.totalPaise)).toString()
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const totalPaise = order.totalPaise;
  const tenderedRupees = parseFloat(tenderedInput) || 0;
  const tenderedPaise = rupeesToPaise(tenderedRupees);
  const changePaise = calculateCashChangePaise(tenderedPaise, totalPaise);

      const handleConfirm = () => {
        if (selectedMethod === 'CASH') {
          onConfirmPayment('CASH', tenderedPaise, changePaise);
        } else {
          onConfirmPayment(selectedMethod);
        }
      };

      const quickAmounts = [
        { label: 'Exact', rupees: Math.ceil(paiseToRupees(totalPaise)) },
        { label: '₹200', rupees: 200 },
        { label: '₹500', rupees: 500 },
        { label: '₹1000', rupees: 1000 },
        { label: '₹2000', rupees: 2000 },
      ].filter((btn) => btn.rupees >= Math.ceil(paiseToRupees(totalPaise)) || btn.label === 'Exact');

      return (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150 overflow-y-auto"
        >
            <div className="bg-white rounded-2xl border border-[#E8E3C3] w-full max-w-lg shadow-2xl overflow-hidden p-5 sm:p-6 animate-in zoom-in-95 duration-150 my-6 text-left">
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#FAF8E8]">
                <div>
                    <div className="flex items-center gap-2">
                      <h3 id="payment-dialog-title" className="text-base sm:text-lg font-bold text-[#222222]">
                        Payment Preview — Order {order.token}
                      </h3>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                        Order Payment
                      </span>
                    </div>
                    <p className="text-xs text-[#777777] mt-0.5">
                      Review order items and select payment method (Prototype)
                    </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close Payment Dialog"
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-[#777777] hover:text-[#222222] hover:bg-[#FAF8E8] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Prototype Disclaimer */}
                <div className="mt-3 mb-3.5 flex items-center gap-2 p-2.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Prototype Simulation:</strong> No actual payment gateway or real card terminal is connected.
                  </span>
                </div>

                {/* Order Items Preview */}
                    <div className="mb-3.5 bg-[#FAF8E8]/50 rounded-xl border border-[#E8E3C3] p-3 max-h-36 overflow-y-auto space-y-1.5">
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#777777] block mb-1">
                        Order Items ({order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'})
                      </span>
                        {
                          order.items.map((item) => (
                            <div key={item.lineId} className="flex justify-between items-center text-xs">
                              <span className="text-[#222222]">
                                <strong className="font-bold">{item.quantity}x</strong> {item.productName}
                                {item.variantLabel ? ` · ${item.variantLabel}` : ''}
                                {item.addOnLabel ? ` (+${item.addOnLabel})` : ''}
                              </span>
                              <span className="font-bold tabular-nums text-[#222222]">
                                {formatPaise(item.lineTotalPaise)}
                              </span>
                            </div>
                          ))
                        }
        </div>

                    {/* Pricing Summary Breakdown */}
                      <div className="space-y-1.5 text-xs text-[#777777] mb-3.5 pb-2.5 border-b border-[#FAF8E8]">
                        <div className="flex justify-between">
                          <span>Subtotal</span>
                          <span className="font-semibold text-[#222222] tabular-nums">
                            {formatPaise(order.subtotalPaise)}
                          </span>
                        </div>
                          {
                            order.discountPaise > 0 && (
                              <div className="flex justify-between text-[#C43C1E]">
                                <span>Discount ({order.discount.percent}%)</span>
                                <span className="font-semibold tabular-nums">
                                  -{formatPaise(order.discountPaise)}
                                </span>
                              </div>
                            )
                          }
                          < div className="flex justify-between">
                        <span>Tax preview (5% GST prototype)</span>
                        <span className="font-semibold text-[#222222] tabular-nums">
                          {formatPaise(order.taxPreviewPaise)}
                        </span>
                      </div>
                      <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline text-base font-extrabold text-[#222222]">
                        <span>Final Payable</span>
                        <span className="text-xl text-[#C43C1E] tabular-nums">
                          {formatPaise(order.totalPaise)}
                        </span>
                      </div>
                    </div>

                    {/* Payment Method Selector */}
                        <div className="mb-3.5">
                          <label className="block text-xs font-bold text-[#222222] mb-1.5">
                            Select Payment Method:
                          </label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
              onClick={() => setSelectedMethod('CASH')}
                              aria-pressed={selectedMethod === 'CASH'}
                              className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${selectedMethod === 'CASH'
                                  ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
                                  : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
            >
                            <Banknote className="w-4 h-4" />
                            <span>Cash</span>
                          </button>

                          <button
                            type="button"
              onClick={() => setSelectedMethod('UPI')}
                            aria-pressed={selectedMethod === 'UPI'}
                            className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${selectedMethod === 'UPI'
                                ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
                                : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
            >
                          <QrCode className="w-4 h-4" />
                          <span>UPI</span>
                        </button>

                        <button
                          type="button"
              onClick={() => setSelectedMethod('CARD')}
                          aria-pressed={selectedMethod === 'CARD'}
                          className={`h-11 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition-all cursor-pointer ${selectedMethod === 'CARD'
                              ? 'bg-[#C43C1E] text-white border-[#C43C1E] shadow-2xs'
                              : 'bg-white text-[#222222] border-[#E8E3C3] hover:bg-[#FAF8E8]'
              }`}
            >
                        <CreditCard className="w-4 h-4" />
                        <span>Card</span>
                      </button>
                    </div>
                </div>

                {/* Cash Tendered Calculator (if Cash is selected) */}
                    {selectedMethod === 'CASH' && (
                      <div className="p-3 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3] mb-3.5 space-y-2">
                        <div className="flex items-center justify-between">
                          <label htmlFor="tendered-cash-input" className="text-xs font-bold text-[#222222]">
                            Tendered Cash Amount (₹):
                          </label>
                          <input
                            id="tendered-cash-input"
                            type="number"
                            min={paiseToRupees(totalPaise)}
                            value={tenderedInput}
                            onChange={(e) => setTenderedInput(e.target.value)}
                            className="w-28 h-8 px-2 text-right text-xs font-bold rounded-lg border border-[#E8E3C3] bg-white focus:outline-none focus:border-[#C43C1E]"
                          />
                        </div>

                        {/* Quick cash amounts */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {quickAmounts.map((q) => (
                            <button
                              key={q.label}
                              type="button"
                              onClick={() => setTenderedInput(q.rupees.toString())}
                              className="px-2.5 py-1 rounded-lg bg-white border border-[#E8E3C3] text-[11px] font-bold text-[#222222] hover:bg-[#C43C1E] hover:text-white transition-colors cursor-pointer"
                            >
                              {q.label}
                            </button>
                          ))}
                        </div>

                        {/* Change Due */}
                        <div className="pt-2 border-t border-[#E8E3C3]/60 flex justify-between items-center text-xs">
                          <span className="font-bold text-[#777777]">Change to return:</span>
                          <span className="font-extrabold text-base text-[#222222] tabular-nums">
                            {formatPaise(changePaise)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* UPI / Card notice */}
                        {selectedMethod !== 'CASH' && (
                          <div className="p-2.5 bg-[#FAF8E8] rounded-xl border border-[#E8E3C3] mb-3.5 text-xs text-[#777777] flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>
                              Selected Mode: <strong>{selectedMethod}</strong>. Confirm below after verifying customer payment.
                            </span>
                          </div>
                        )}

                          {/* Action Buttons: Cancel or Explicit Payment Confirmation */}
                          <div className="flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={onClose}
                              className="flex-1 h-11 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-xs font-bold text-[#777777] hover:text-[#222222] transition-colors cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={handleConfirm}
                              className="flex-2 h-11 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Confirm Payment Received</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
}

                    export function PaymentPreviewDialog({
                      isOpen,
                      order,
                      onClose,
                      onConfirmPayment,
}: PaymentPreviewDialogProps) {
  if (!isOpen) return null;
                    return (
                    <PaymentPreviewModal
                      order={order}
                      onClose={onClose}
                      onConfirmPayment={onConfirmPayment}
                    />
                    );
}
