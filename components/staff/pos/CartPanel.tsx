'use client';

import React from 'react';
import { PosOrder } from '@/lib/pos/order';
import { formatPaise, formatSignedRoundOffPaise } from '@/lib/pos/calculations';
import { CartItem } from './CartItem';
import {
  ShoppingBag,
  Trash2,
  Tag,
  CheckCircle2,
  PlusCircle,
  CreditCard,
} from 'lucide-react';

interface CartPanelProps {
  order: PosOrder;
  onIncrease: (lineId: string) => void;
  onDecrease: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onRequestClearCart: () => void;
  onOpenDiscountDialog: () => void;
  onMoveToAwaitingPayment?: () => void;
  onOpenPaymentPreview: () => void;
  onStartNextOrder: () => void;
}

export function CartPanel({
  order,
  onIncrease,
  onDecrease,
  onRemove,
  onRequestClearCart,
  onOpenDiscountDialog,
  onOpenPaymentPreview,
  onStartNextOrder,
}: CartPanelProps) {
  const isCartEmpty = order.items.length === 0;
  const isCompleted = order.status === 'COMPLETED';

  const discountLabel =
  order.discount.type === 'none'
    ? 'Add Discount'
      : order.discount.type === 'percent_5'
    ? '5% applied'
      : order.discount.type === 'percent_10'
    ? '10% applied'
      : `${order.discount.percent}% applied`;

  const statusConfig = {
    PROCESSING: {
      label: 'PROCESSING',
      classes: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    COMPLETED: {
      label: 'COMPLETED',
      classes: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    },
  }[order.status] || {
    label: 'PROCESSING',
    classes: 'bg-amber-100 text-amber-900 border-amber-300',
  };

  return (
    <div
      aria-label="Order Cart"
      className="flex flex-col h-full bg-white rounded-2xl border border-[#E8E3C3] shadow-xs overflow-hidden select-none"
    >
        {/* 1. Cart Top Header (Fixed) */}
        <div className="p-3 sm:p-3.5 border-b border-[#E8E3C3] flex items-center justify-between bg-[#FAF8E8]/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#C43C1E]/10 flex items-center justify-center text-[#C43C1E]">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#222222]">
                  Order {order.token}
                </h3>
                {!isCartEmpty && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C43C1E] text-white">
                    {order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span
                  className={`text-[9.5px] font-extrabold uppercase px-1.5 py-0.2 rounded border ${statusConfig.classes}`}
                >
                  {statusConfig.label}
                </span>
                {order.paymentStatus === 'PAID' && (
                  <span className="text-[9.5px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                    PAID ({order.paymentMethod})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Clear Cart Button (Disabled if empty or completed) */}
          {!isCompleted && (
            <button
              type="button"
              disabled={isCartEmpty}
              onClick={onRequestClearCart}
              className="p-2 rounded-lg text-[#C43C1E] bg-white border border-[#E8E3C3] hover:bg-[#C43C1E]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              title="Clear Cart"
              aria-label="Clear Cart"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

          {/* 2. Cart Items Scrollable Area */}
          <div className="flex-1 min-h-0 p-3 overflow-y-auto space-y-2">
            {isCompleted && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <span className="font-bold">ORDER CONFIRMED & PAID</span>
                  <p className="text-[11px] text-emerald-800">
                    Method: {order.paymentMethod} · Read-only view
                  </p>
                </div>
              </div>
            )}

            {isCartEmpty ? (
                  <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mb-2 shadow-2xs">
                      <ShoppingBag className="w-5 h-5 text-[#C43C1E]" />
                    </div>
                      <h4 className="text-sm font-bold text-[#222222]">Your cart is empty</h4>
                      <p className="text-[11px] text-[#777777] max-w-[200px] mt-1 leading-relaxed">
                        Select products from the menu to start an order.
                      </p>
                  </div>
                  ) : (
                    <div role="list" className="space-y-1.5">
                      {order.items.map((item) =>
                        isCompleted ? (
                          // Read-only item card for completed orders
                          <div
                            key={item.lineId}
                            role="listitem"
                            className="p-2 rounded-xl border border-[#E8E3C3] bg-[#FAF8E8]/40 flex items-center justify-between text-xs"
                          >
                            <div className="flex flex-col">
                              <span className="font-bold text-[#222222]">
                                {item.quantity}x {item.productName}
                              </span>
                              {(item.variantLabel || item.addOnLabel) && (
                                <span className="text-[11px] text-[#777777]">
                                  {item.variantLabel ? item.variantLabel : ''}
                                  {item.addOnLabel ? ` (+${item.addOnLabel})` : ''}
                                </span>
                              )}
                            </div>
                            <span className="font-bold tabular-nums text-[#222222]">
                              {formatPaise(item.lineTotalPaise)}
                            </span>
                          </div>
                        ) : (
                          <CartItem
                            key={item.lineId}
                            item={item}
                            onIncrease={onIncrease}
                            onDecrease={onDecrease}
                            onRemove={onRemove}
                          />
                        )
                      )}
                    </div>
        )}
                  </div>

                    {/* 3. Cart Summary & Action Area (Fixed at bottom) */}
                    <div className="p-3 sm:p-3.5 bg-[#FAF8E8]/90 border-t border-[#E8E3C3] space-y-2 shrink-0">
                      {/* Subtotal */}
                      <div className="flex justify-between text-xs text-[#777777]">
                        <span>Subtotal</span>
                        <span className="font-semibold text-[#222222] tabular-nums">
                          {formatPaise(order.subtotalPaise)}
                        </span>
                      </div>

                      {/* Discount Row */}
                      <div className="flex justify-between items-center text-xs text-[#777777]">
                        {isCompleted ? (
                          <span className="flex items-center gap-1.5 text-xs text-[#777777]">
                            <Tag className="w-3.5 h-3.5" />
                            <span>Discount ({discountLabel})</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={onOpenDiscountDialog}
                            disabled={isCartEmpty}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[#C43C1E] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
                          >
                            <Tag className="w-3.5 h-3.5" />
                            <span>Discount ({discountLabel})</span>
                          </button>
                        )}
                        <span className="font-semibold text-[#222222] tabular-nums">
                          {order.discountPaise > 0 ? `-${formatPaise(order.discountPaise)}` : '₹0.00'}
                        </span>
                      </div>

                      {/* Tax Preview (provisional) */}
                      <div className="flex justify-between text-xs text-[#777777]">
                        <span>Tax preview (5% GST prototype)</span>
                        <span className="font-semibold text-[#222222] tabular-nums">
                          {formatPaise(order.taxPreviewPaise)}
                        </span>
                      </div>

                      {/* Round Off */}
                      <div className="flex justify-between text-xs text-[#777777]">
                        <span>Round Off</span>
                        <span className="font-semibold text-[#222222] tabular-nums">
                          {formatSignedRoundOffPaise(order.roundOffPaise ?? 0)}
                        </span>
                      </div>

                      {/* Total Payable */}
                      <div className="pt-2 border-t border-[#E8E3C3] flex justify-between items-baseline">
                        <div>
                          <span className="text-sm font-bold text-[#222222]">
                            {isCompleted ? 'Total Paid' : 'Total'}
                          </span>
                          <span className="text-[10px] text-[#777777] block font-normal">
                            ({order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'})
                          </span>
                        </div>
                          <span className="text-xl sm:text-2xl font-black text-[#C43C1E] tabular-nums">
                            {formatPaise(order.totalPaise)}
                          </span>
                      </div>

                        {/* Action Buttons: State-dependent */}
                        {isCompleted ? (
                          <button
                            type="button"
                            onClick={onStartNextOrder}
                            aria-label="START NEW ORDER"
                            className="w-full h-11 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                          >
                            <PlusCircle className="w-4 h-4" />
                            <span>START NEW ORDER</span>
                          </button>
                        ) : (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              disabled={isCartEmpty}
                              onClick={onRequestClearCart}
                              className="h-11 px-3 rounded-xl border border-[#E8E3C3] bg-white hover:bg-[#FAF8E8] text-[#C43C1E] text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                              CLEAR CART
                            </button>
                            <button
                              type="button"
                              disabled={isCartEmpty}
                              onClick={onOpenPaymentPreview}
                              aria-label="PROCEED TO PAYMENT / CONTINUE"
                              className="flex-1 h-11 rounded-xl bg-[#C43C1E] hover:bg-[#AB3419] text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                            >
                              <CreditCard className="w-4 h-4" />
                              <span>PROCEED TO PAYMENT</span>
                            </button>
                          </div>
                        )}
                    </div>
                  </div>
                  );
}
