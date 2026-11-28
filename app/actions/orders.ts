'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireOwner, requireStaff } from '@/lib/auth/rbac';
import { PosOrder, PaymentMethod } from '@/lib/pos/order';

export interface ActionResponse {
  success: boolean;
  error?: string;
  data?: any;
}

export interface SplitPaymentTenderInput {
  method: 'cash' | 'upi' | 'card' | PaymentMethod;
  amountPaise: number;
  upiUtr?: string | null;
}

export async function submitOrderAction(payload: {
  order: PosOrder;
  method: PaymentMethod;
  tenderedPaise?: number;
  changePaise?: number;
  payments?: SplitPaymentTenderInput[];
  terminalId?: string | null;
  cashierId?: string | null;
  staffMemberId?: string | null;
}): Promise<ActionResponse> {
  try {
    // 1. Staff or Owner permitted; cashier identity strictly derived from SSR session
    const { user, profile } = await requireStaff();

    // Prevent explicit cashier impersonation attempts
    if (payload.cashierId && payload.cashierId !== user.id) {
      return {
        success: false,
        error: 'Unauthorized: Cashier impersonation is prohibited.',
      };
    }

    const { order, method } = payload;
    if (!order || !order.id) {
      return { success: false, error: 'Order ID is required.' };
    }

    if (!Array.isArray(order.items) || order.items.length === 0) {
      return { success: false, error: 'Checkout requires at least one order item.' };
    }

    for (const item of order.items) {
      if (!item.productId) {
        return { success: false, error: 'Each order item must reference a menu item ID.' };
      }
      if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
        return { success: false, error: 'Each order item must have a positive integer quantity.' };
      }
      if (!Number.isInteger(item.unitPricePaise) || item.unitPricePaise < 0) {
        return { success: false, error: 'Invalid item unit price.' };
      }
    }

    const discountPercent = order.discount?.percent ?? 0;
    if (!Number.isFinite(discountPercent) || discountPercent < 0) {
      return { success: false, error: 'Discount percentage must be 0 or greater.' };
    }
    if (discountPercent >= 100) {
      return {
        success: false,
        error:
          '100% discounts (complimentary orders) are not currently supported. Discount must be less than 100%.',
      };
    }

    if (!Number.isInteger(order.totalPaise) || order.totalPaise <= 0) {
      return {
        success: false,
        error: 'Order total must be greater than ₹0. Complimentary orders are not supported.',
      };
    }

    const rawPayments: SplitPaymentTenderInput[] =
      Array.isArray(payload.payments) && payload.payments.length > 0
        ? payload.payments
        : [{ method: method.toLowerCase() as 'cash' | 'upi' | 'card', amountPaise: order.totalPaise, upiUtr: null }];

    const normalizedPayments = [];
    let paymentSumPaise = 0;

    for (const p of rawPayments) {
      const normalizedMethod = String(p.method || '').trim().toLowerCase();
      if (!['cash', 'upi', 'card'].includes(normalizedMethod)) {
        return { success: false, error: `Invalid payment method: ${p.method}` };
      }
      if (!Number.isInteger(p.amountPaise) || p.amountPaise <= 0) {
        return { success: false, error: 'Each payment tender must be a positive integer in paise.' };
      }
      paymentSumPaise += p.amountPaise;
      normalizedPayments.push({
        method: normalizedMethod,
        amount_paise: p.amountPaise,
        upi_utr: p.upiUtr || null,
      });
    }

    if (paymentSumPaise !== order.totalPaise) {
      return {
        success: false,
        error: `Payment total (${paymentSumPaise} paise) does not match order total (${order.totalPaise} paise).`,
      };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const seqParts = (order.token || '').split('-');
    const seqNum = parseInt(
      seqParts.length > 1 ? seqParts[1] : (order.token || '').replace(/\D/g, '') || '1',
      10
    );
    const completedAt = order.completedAt || new Date().toISOString();
    const businessDate = order.businessDate || completedAt.split('T')[0];

    const rpcItems = order.items.map((it) => ({
      menu_item_id: it.productId,
      variant_id: it.variantId || null,
      addon_id: it.addOnId || null,
      quantity: it.quantity,
      expected_unit_price_paise: it.unitPricePaise,
    }));

    const rpcArgs: Record<string, unknown> = {
      p_order_id: order.id,
      p_terminal_id: payload.terminalId ?? null,
      p_token_terminal: 'T1',
      p_token_seq: Number.isFinite(seqNum) && seqNum > 0 ? seqNum : null,
      p_items: rpcItems,
      p_discount_percent: discountPercent,
      p_discount_type: discountPercent > 0 ? 'PERCENTAGE' : null,
      p_discount_reason: null,
      p_payments: normalizedPayments,
      p_client_completed_at: completedAt,
      p_business_date: businessDate,
      p_cashier_id: user.id,
      p_expected_subtotal_paise: order.subtotalPaise,
      p_expected_total_paise: order.totalPaise,
    };

    if (payload.staffMemberId !== undefined) {
      rpcArgs.p_staff_member_id = payload.staffMemberId ?? null;
    }

    const { data, error: rpcError } = await (supabase as any).rpc('complete_pos_checkout', rpcArgs);

    if (rpcError) {
      return { success: false, error: rpcError.message };
    }

    return {
      success: true,
      data: data || { orderId: order.id, cashierId: user.id, storeId: profile.store_id },
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit order.' };
  }
}

export async function updateOrderAction(
  orderId: string,
  updates: {
    status?: 'PROCESSING' | 'COMPLETED' | 'CANCELLED' | 'VOID';
    discount_paise?: number;
    discount_reason?: string | null;
    total_paise?: number;
    cancelled_reason?: string | null;
  }
): Promise<ActionResponse> {
  try {
    // Owner only
    await requireOwner();

    if ((updates.status as string) === 'REFUNDED') {
      return { success: false, error: 'Refund status transitions are not supported.' };
    }

    // Explicit field allowlist to prevent mass-assignment
    const sanitizedUpdates: Record<string, unknown> = {};
    if (updates.status !== undefined) sanitizedUpdates.status = updates.status;
    if (updates.discount_paise !== undefined) sanitizedUpdates.discount_paise = updates.discount_paise;
    if (updates.discount_reason !== undefined) sanitizedUpdates.discount_reason = updates.discount_reason;
    if (updates.total_paise !== undefined) sanitizedUpdates.total_paise = updates.total_paise;

    if (updates.status === 'CANCELLED' || updates.status === 'VOID') {
      const reason = updates.cancelled_reason?.trim() || updates.discount_reason?.trim() || '';
      if (!reason) {
        return { success: false, error: 'Cancellation or void reason is mandatory.' };
      }
      sanitizedUpdates.cancelled_reason = reason;
    } else if (updates.cancelled_reason !== undefined) {
      sanitizedUpdates.cancelled_reason = updates.cancelled_reason;
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { error } = await (supabase as any)
      .from('orders')
      .update(sanitizedUpdates)
      .eq('id', orderId);

    if (error) return { success: false, error: error.message };

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update order.' };
  }
}

export async function getPaymentCorrectionsAction(
  orderId: string
): Promise<ActionResponse> {
  try {
    await requireOwner();

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await (supabase as any)
      .from('payment_corrections')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to load payment corrections.' };
  }
}

export async function correctPaymentMethodAction(payload: {
  paymentId: string;
  newMethod: 'cash' | 'upi' | 'card';
  reason: string;
}): Promise<ActionResponse> {
  try {
    await requireOwner();

    const trimmedReason = payload.reason?.trim() || '';
    if (!trimmedReason) {
      return { success: false, error: 'A correction reason is mandatory.' };
    }

    if (!['cash', 'upi', 'card'].includes(payload.newMethod)) {
      return { success: false, error: 'Invalid payment method. Allowed: cash, upi, card.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await (supabase as any).rpc('correct_payment_method', {
      p_payment_id: payload.paymentId,
      p_new_method: payload.newMethod,
      p_reason: trimmedReason,
    });

    if (error) return { success: false, error: error.message };

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to correct payment method.' };
  }
}

export async function deleteOrderAction(
  _orderId: string
): Promise<ActionResponse> {
  try {
    // Owner only check preserved for RBAC boundary
    await requireOwner();

    // Financial audit policy: orders and payment history cannot be deleted
    return {
      success: false,
      error: 'Financial audit policy: Completed and recorded orders cannot be deleted.',
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to delete order.' };
  }
}
