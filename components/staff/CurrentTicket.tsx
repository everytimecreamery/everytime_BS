'use client';

import React, { useState } from 'react';
import { CartState } from '@/lib/cart/cart-types';
import { CartItem } from './CartItem';
import { CartSummary } from './CartSummary';
import { ClearCartDialog } from './ClearCartDialog';
import { ShoppingBag, Trash2, PauseCircle } from 'lucide-react';

interface CurrentTicketProps {
  cart: CartState;
  onIncrease: (lineId: string) => void;
  onDecrease: (lineId: string) => void;
  onRemove: (lineId: string) => void;
  onClearCart: () => void;
  onCheckout: () => void;
}

export function CurrentTicket({
  cart,
  onIncrease,
  onDecrease,
  onRemove,
  onClearCart,
  onCheckout,
}: CurrentTicketProps) {
  const [isClearDialogOpen, setIsClearDialogOpen] = useState(false);
  const isCartEmpty = cart.items.length === 0;

  return (
    <div
      aria-label="Current Order Ticket"
      className="flex flex-col h-full bg-white rounded-2xl border border-[#E8E3C3] shadow-xs overflow-hidden"
    >
      {/* Ticket Top Bar */}
      <div className="p-4 border-b border-[#E8E3C3] flex items-center justify-between bg-[#FAF8E8]/60">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#C43C1E]/10 flex items-center justify-center text-[#C43C1E]">
            <ShoppingBag className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#222222]">Current Ticket</h3>
              {!isCartEmpty && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#C43C1E] text-white">
                  {cart.totalItemQuantity}
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#777777]">Token Sequence: #001 (Preview)</p>
          </div>
        </div>

        {/* Quick Cart Actions */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled
            className="p-2 rounded-lg text-[#777777] bg-white border border-[#E8E3C3] opacity-40 cursor-not-allowed"
            title="Hold Ticket (Unlocks in Phase 4)"
          >
            <PauseCircle className="w-4 h-4" />
          </button>

          <button
            type="button"
            disabled={isCartEmpty}
            onClick={() => setIsClearDialogOpen(true)}
            className="p-2 rounded-lg text-[#C43C1E] bg-white border border-[#E8E3C3] hover:bg-[#C43C1E]/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            title="Clear Cart"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cart Items Area */}
      <div className="flex-1 p-3 sm:p-4 overflow-y-auto space-y-2.5">
        {isCartEmpty ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-6">
            <div className="w-14 h-14 rounded-full bg-[#FAF8E8] border border-[#E8E3C3] flex items-center justify-center text-[#777777] mb-3 shadow-2xs">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-[#222222]">Order Ticket Empty</h4>
            <p className="text-xs text-[#777777] max-w-[220px] mt-1.5 leading-relaxed">
              Select items from the menu grid to configure flavors and add them to this ticket.
            </p>
            <span className="mt-4 px-3 py-1 rounded-full bg-[#FAF8E8] text-[11px] font-semibold text-[#777777] border border-[#E8E3C3]">
              Ready for counter orders
            </span>
          </div>
        ) : (
          <div role="list" className="space-y-2">
            {cart.items.map((item) => (
              <CartItem
                key={item.id}
                item={item}
                onIncrease={onIncrease}
                onDecrease={onDecrease}
                onRemove={onRemove}
              />
            ))}
          </div>
        )}
      </div>

      {/* Summary and Pay Action */}
      <CartSummary
        subtotalPaise={cart.subtotalPaise}
        estimatedTaxPaise={cart.estimatedTaxPaise}
        totalPaise={cart.totalPaise}
        itemCount={cart.totalItemQuantity}
        onCheckout={onCheckout}
      />

      {/* Clear Confirmation Dialog */}
      <ClearCartDialog
        isOpen={isClearDialogOpen}
        onClose={() => setIsClearDialogOpen(false)}
        onConfirmClear={onClearCart}
      />
    </div>
  );
}

