/**
 * Everytime Creamery — Direct Supabase Order Service
 *
 * Persists completed POS orders through the authenticated server action
 * (`submitOrderAction` -> PostgreSQL `complete_pos_checkout` RPC) so cashier
 * identity, catalog pricing, GST calculation, and payment validation are
 * enforced atomically on the server.
 */

import { supabase } from '@/lib/supabase/client';
import {
  submitOrderAction,
  correctPaymentMethodAction,
  updateOrderAction,
  type SplitPaymentTenderInput,
} from '@/app/actions/orders';
import { PosOrder, PaymentMethod, OrderSyncErrorKind } from '@/lib/pos/order';

export interface PushOrderResult {
  success: boolean;
  orderId?: string;
  data?: any;
  error?: string;
}

export function classifySyncError(errorMessage?: string): OrderSyncErrorKind {
  const msg = (errorMessage || '').toLowerCase();
  if (
    msg.includes('billing session inactive') ||
    msg.includes('billing is currently stopped')
  ) {
    return 'validation';
  }
  if (
    msg.includes('authentication required') ||
    msg.includes('unauthorized') ||
    msg.includes('session') ||
    msg.includes('jwt') ||
    msg.includes('not signed in')
  ) {
    return 'auth_expired';
  }
  if (
    msg.includes('failed to fetch') ||
    msg.includes('network') ||
    msg.includes('offline') ||
    msg.includes('timeout') ||
    msg.includes('timed out') ||
    msg.includes('connection')
  ) {
    return 'network';
  }
  if (
    msg.includes('validation') ||
    msg.includes('price manipulation') ||
    msg.includes('total manipulation') ||
    msg.includes('archived') ||
    msg.includes('unavailable') ||
    msg.includes('does not exist') ||
    msg.includes('payment validation')
  ) {
    return 'validation';
  }
  return 'unknown';
}

/**
 * Pushes a completed POS order through the authenticated server-side checkout
 * pipeline (`submitOrderAction` -> `complete_pos_checkout` RPC).
 */
export async function pushOrderToDatabase(
  order: PosOrder,
  method: PaymentMethod,
  tenderedPaise?: number,
  changePaise?: number,
  payments?: SplitPaymentTenderInput[],
  options?: {
    terminalId?: string | null;
    staffMemberId?: string | null;
  }
): Promise<PushOrderResult> {
  try {
    const result = await submitOrderAction({
      order,
      method,
      tenderedPaise,
      changePaise,
      payments,
      ...(options?.terminalId !== undefined ? { terminalId: options.terminalId } : {}),
      ...(options?.staffMemberId !== undefined ? { staffMemberId: options.staffMemberId } : {}),
    });

    if (!result.success) {
      console.error('[pushOrderToDatabase] Server checkout error:', result.error);
      return { success: false, error: result.error };
    }

    return {
      success: true,
      orderId: result.data?.order_id || result.data?.orderId || order.id,
      data: result.data,
    };
  } catch (err: any) {
    console.error('[pushOrderToDatabase] Unexpected exception:', err);
    return {
      success: false,
      error: err?.message || 'Failed to push order to database',
    };
  }
}

/**
 * Fetches all completed orders directly from Supabase along with status metadata.
 */
export async function fetchOrdersFromDatabaseWithStatus(): Promise<{
  orders: PosOrder[];
  error?: string;
  authExpired?: boolean;
}> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select(
        `
        *,
        order_items (*),
        payments (*)
      `
      )
      .eq('status', 'COMPLETED')
      .order('client_completed_at', { ascending: false });

    if (error) {
      console.warn('[fetchOrdersFromDatabase] Query error:', error);
      const kind = classifySyncError(error.message);
      return {
        orders: [],
        error: error.message,
        authExpired: kind === 'auth_expired',
      };
    }

    if (!data) {
      return { orders: [] };
    }

    const orders: PosOrder[] = data.map((rec: any) => ({
      id: rec.id,
      token: rec.token_terminal
        ? `${rec.token_terminal}-${rec.token_seq.toString().padStart(3, '0')}`
        : `#${rec.token_seq.toString().padStart(3, '0')}`,
      status: 'COMPLETED',
      syncStatus: 'SYNCED',
      syncError: null,
      syncRequiresAuth: false,
      syncedAt: rec.server_received_at || rec.client_completed_at,
      items: (rec.order_items || []).map((it: any) => ({
        lineId: it.id,
        productId: it.menu_item_id || it.id,
        productName: it.product_name,
        variantId: it.variant_label || undefined,
        variantLabel: it.variant_label || undefined,
        addOnId: it.addon_label || undefined,
        addOnLabel: it.addon_label || undefined,
        unitPricePaise: (it.unit_price_paise || 0) + (it.addon_price_paise || 0),
        quantity: it.quantity,
        lineTotalPaise: it.total_price_paise,
        totalPricePaise: it.total_price_paise,
      })),
      subtotalPaise: rec.subtotal_paise,
      discountPaise: rec.discount_paise,
      taxPreviewPaise: rec.tax_paise,
      cgstPaise: rec.cgst_paise,
      sgstPaise: rec.sgst_paise,
      totalPaise: rec.total_paise,
      totalPayablePaise: rec.total_paise,
      totalQuantity: (rec.order_items || []).reduce((sum: number, item: any) => sum + item.quantity, 0),
      discount: {
        type: (rec.discount_type?.toLowerCase() as any) || 'none',
        percent:
          rec.discount_type === 'PERCENTAGE'
            ? Math.round((rec.discount_paise / (rec.subtotal_paise || 1)) * 100)
            : 0,
      },
      taxConfig: { ratePercent: 5, isProvisional: true },
      paymentStatus: 'PAID',
      paymentMethod: (rec.payments?.[0]?.method?.toUpperCase() as any) || 'CASH',
      createdAt: rec.client_completed_at,
      updatedAt: rec.client_completed_at,
      completedAt: rec.client_completed_at,
      businessDate: rec.business_date,
    }));

    return { orders };
  } catch (err: any) {
    console.warn('[fetchOrdersFromDatabase] Exception:', err);
    return {
      orders: [],
      error: err?.message || 'Failed to fetch orders from database',
      authExpired: classifySyncError(err?.message) === 'auth_expired',
    };
  }
}

/**
 * Fetches all completed orders directly from Supabase,
 * joined with order items and payment records.
 */
export async function fetchOrdersFromDatabase(): Promise<PosOrder[]> {
  const res = await fetchOrdersFromDatabaseWithStatus();
  return res.orders;
}

export interface PaymentCorrectionEvent {
  id: string;
  payment_id: string;
  order_id: string;
  previous_method: 'cash' | 'upi' | 'card';
  new_method: 'cash' | 'upi' | 'card';
  amount_paise: number;
  reason: string;
  corrected_by: string;
  created_at: string;
}

/**
 * Controlled Owner-only payment method correction via database RPC.
 * Amount, order association, and creation timestamp remain strictly immutable;
 * records an append-only event in public.payment_corrections.
 */
export async function correctPaymentMethodInDatabase(
  paymentId: string,
  newMethod: 'cash' | 'upi' | 'card',
  reason: string
): Promise<{ success: boolean; data?: PaymentCorrectionEvent; error?: string }> {
  return correctPaymentMethodAction({
    paymentId,
    newMethod,
    reason,
  });
}

/**
 * Fetches the append-only payment method correction history for an order (Owner only).
 */
export async function fetchPaymentCorrectionsForOrder(
  orderId: string
): Promise<PaymentCorrectionEvent[]> {
  try {
    const { data, error } = await (supabase as any)
      .from('payment_corrections')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false });

    if (error || !data) {
      return [];
    }

    return data as PaymentCorrectionEvent[];
  } catch {
    return [];
  }
}

/**
 * Cancels or voids an unpaid pre-completion draft order with a mandatory reason.
 * Completed orders and orders with recorded payments are rejected by the database.
 */
export async function cancelUnpaidOrderInDatabase(
  orderId: string,
  status: 'CANCELLED' | 'VOID',
  reason: string
): Promise<{ success: boolean; error?: string }> {
  return updateOrderAction(orderId, {
    status,
    cancelled_reason: reason,
  });
}
