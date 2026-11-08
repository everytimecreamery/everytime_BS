'use client';

import React from 'react';
import { CompletedOrder } from '@/lib/pos/order';
import { formatPaise } from '@/lib/pos/calculations';
import { CheckCircle, PlusCircle } from 'lucide-react';

interface OrderConfirmationDialogProps {
  isOpen: boolean;
  order: CompletedOrder | null;
  onNewOrder: () => void;
}

export function OrderConfirmationDialog({
  isOpen,
  order,
  onNewOrder,
}: OrderConfirmationDialogProps) {
  if (!isOpen || !order) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="order-confirmed-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="bg-white rounded-3xl border border-[#E8E3C3] w-full max-w-md shadow-2xl overflow-hidden p-6 sm:p-8 text-center animate-in zoom-in-95 duration-150">
        {/* Success Icon */}
        <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center mx-auto mb-3 shadow-xs">
          <CheckCircle className="w-8 h-8" />
        </div>

        <span className="text-[11px] font-extrabold uppercase tracking-widest text-emerald-700 block">
          ORDER CONFIRMED
        </span>

        <h3 id="order-confirmed-title" className="text-xl font-black text-[#222222] mt-0.5">
          EVERYTIME CREAMERY
        </h3>

        {/* Token Box */}
        <div className="my-5 p-5 bg-[#FAF8E8] rounded-2xl border-2 border-dashed border-[#C43C1E]/40">
          <span className="text-xs font-bold uppercase tracking-wider text-[#777777] block">
            TOKEN NUMBER
          </span>
          <span className="text-4xl sm:text-5xl font-black text-[#C43C1E] tracking-tight block my-1">
            {order.tokenDisplay}
          </span>
          <span className="text-[11px] text-[#777777] font-medium">
            Keep token ready for pickup
          </span>
        </div>

        {/* Order Details */}
        <div className="bg-white rounded-xl border border-[#E8E3C3] p-4 text-xs text-[#777777] space-y-2 text-left mb-6">
          <div className="flex justify-between items-center pb-2 border-b border-[#FAF8E8]">
            <span>Order Total:</span>
            <span className="text-sm font-extrabold text-[#222222] tabular-nums">
              {formatPaise(order.totalPayablePaise)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>Service Type:</span>
            <span className="font-bold text-[#222222] uppercase tracking-wide">
              {order.serviceType === 'dine_in' ? 'Dine-in' : 'Parcel'}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span>Payment Mode:</span>
            <span className="font-bold text-[#222222] uppercase tracking-wide">
              {order.paymentMethod.toUpperCase()}
            </span>
          </div>

          {order.paymentMethod === 'cash' && order.changePaise !== undefined && order.changePaise > 0 && (
            <div className="flex justify-between items-center text-emerald-700 font-semibold pt-1 border-t border-[#FAF8E8]">
              <span>Change Returned:</span>
              <span className="tabular-nums font-bold">
                {formatPaise(order.changePaise)}
              </span>
            </div>
          )}

          {/* Items Summary list */}
          <div className="pt-2 border-t border-[#FAF8E8] space-y-1">
            <span className="text-[10px] font-bold text-[#777777] uppercase block">
              Items Ordered:
            </span>
            {order.items.map((item) => (
              <div key={item.lineId} className="flex justify-between text-[11px] text-[#222222]">
                <span>
                  {item.quantity}x {item.productName}
                  {item.variantLabel ? ` (${item.variantLabel})` : ''}
                  {item.addOnLabel ? ` + ${item.addOnLabel}` : ''}
                </span>
                <span className="tabular-nums font-semibold">
                  {formatPaise(item.lineTotalPaise)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* New Order Button */}
        <button
          type="button"
          onClick={onNewOrder}
          className="w-full h-13 rounded-2xl bg-[#C43C1E] hover:bg-[#AB3419] text-white font-extrabold text-sm transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>START NEW ORDER</span>
        </button>
      </div>
    </div>
  );
}
