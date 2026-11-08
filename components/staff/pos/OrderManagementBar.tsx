'use client';

import React from 'react';
import { PosOrder } from '@/lib/pos/order';
import { formatPaise } from '@/lib/pos/calculations';

interface OrderManagementBarProps {
  orders: PosOrder[];
  activeOrderId: string;
  onSelectOrder: (orderId: string) => void;
  onRefreshCompleted?: () => void;
}

function formatOrderTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    let hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
  } catch {
    return '--:--';
  }
}

interface OrderCardProps {
  order: PosOrder;
  isActive: boolean;
  onSelect: () => void;
}

function OrderCard({ order, isActive, onSelect }: OrderCardProps) {
  const statusStyles = {
    PROCESSING: 'bg-amber-100 text-amber-900 border-amber-300',
    COMPLETED: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  }[order.status] || 'bg-amber-100 text-amber-900 border-amber-300';

  const paymentStyles =
    order.paymentStatus === 'PAID'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : 'bg-zinc-100 text-zinc-600 border-zinc-200';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Order ${order.token} ${order.status} ${order.totalQuantity} items ${formatPaise(order.totalPaise)}`}
      aria-pressed={isActive}
      className={`relative shrink-0 text-left px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer select-none min-w-[170px] ${
        isActive
          ? 'bg-[#FAF8E8] border-[#C43C1E] shadow-xs ring-2 ring-[#C43C1E]/30'
          : 'bg-white border-[#E8E3C3] hover:border-[#C43C1E]/40 hover:bg-[#FAF8E8]/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5">
          <span className="font-black text-xs text-[#222222] tracking-tight">
            {order.token}
          </span>
          {isActive && (
            <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-[#C43C1E] text-white">
              ACTIVE
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className={`text-[8.5px] font-bold uppercase px-1.5 py-0.2 rounded border ${statusStyles}`}>
            {order.status}
          </span>
          <span className={`text-[8.5px] font-bold uppercase px-1 py-0.2 rounded border ${paymentStyles}`}>
            {order.paymentStatus}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        <span className="font-bold text-[#222222] tabular-nums">
          {order.totalQuantity} {order.totalQuantity === 1 ? 'item' : 'items'} · {formatPaise(order.totalPaise)}
        </span>
        <span className="text-[10px] text-[#777777] tabular-nums">
          {formatOrderTime(order.createdAt)}
        </span>
      </div>
    </button>
  );
}

export function OrderManagementBar({
  orders,
  activeOrderId,
  onSelectOrder,
}: OrderManagementBarProps) {
  const processingOrders = orders.filter((o) => o.status === 'PROCESSING');

  return (
    <section
      aria-label="Active Customer Orders Queue"
      className="bg-white rounded-2xl border border-[#E8E3C3] p-2 sm:px-3 sm:py-2 shadow-2xs shrink-0 max-h-[86px] overflow-hidden"
    >
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-1.5 px-0.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#222222]">
            Processing
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-amber-100 text-amber-900">
            {processingOrders.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
          {processingOrders.length === 0 ? (
            <span className="text-[11px] text-[#777777] italic py-1 px-1">
              No active orders
            </span>
          ) : (
            processingOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                isActive={order.id === activeOrderId}
                onSelect={() => onSelectOrder(order.id)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
