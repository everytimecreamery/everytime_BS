/**
 * Everytime Creamery — Direct Supabase Order Service
 *
 * Replaces offline outbox queue with immediate cloud persistence.
 * Pushes orders, items, and payments directly into Supabase so the
 * owner application and staff history see live data immediately.
 */

import { supabase } from '@/lib/supabase/client';
import { PosOrder, PaymentMethod } from '@/lib/pos/order';
import { generateUUID } from '@/lib/utils';

export interface PushOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
}

/**
 * Directly pushes a completed POS order to Supabase database.
 * Inserts order record, line items, and payment tender.
 */
export async function pushOrderToDatabase(
  order: PosOrder,
  method: PaymentMethod,
  tenderedPaise?: number,
  changePaise?: number
): Promise<PushOrderResult> {
  try {
    const seqParts = order.token.split('-');
    const seqNum = parseInt(
      seqParts.length > 1 ? seqParts[1] : order.token.replace(/\D/g, '') || '1',
      10
    );
    const taxPaise = order.taxPreviewPaise;
    const cgstPaise = order.cgstPaise ?? Math.round(taxPaise / 2);
    const sgstPaise = order.sgstPaise ?? (taxPaise - cgstPaise);
    const completedAt = order.completedAt || new Date().toISOString();
    const businessDate = order.businessDate || new Date().toISOString().split('T')[0];

    // 1. Insert order record into public.orders
    const { error: orderError } = await supabase.from('orders').upsert(
      {
        id: order.id,
        store_id: '00000000-0000-0000-0000-000000000001',
        terminal_id: '00000000-0000-0000-0000-000000000002',
        cashier_id: null,
        token_terminal: 'T1',
        token_seq: seqNum,
        status: 'COMPLETED',
        subtotal_paise: order.subtotalPaise,
        discount_paise: order.discountPaise,
        discount_type: order.discount?.percent ? 'PERCENTAGE' : null,
        discount_reason: null,
        discount_approved_by: null,
        tax_paise: taxPaise,
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        total_paise: order.totalPaise,
        client_completed_at: completedAt,
        business_date: businessDate,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    if (orderError) {
      console.error('[pushOrderToDatabase] Order error:', orderError);
      return { success: false, error: orderError.message };
    }

    // 2. Insert line items into public.order_items
    if (order.items && order.items.length > 0) {
      const itemsPayload = order.items.map((it) => ({
        id: generateUUID(),
        order_id: order.id,
        menu_item_id: it.productId || null,
        product_name: it.productName,
        variant_label: it.variantLabel || null,
        addon_label: it.addOnLabel || null,
        quantity: it.quantity,
        unit_price_paise: it.unitPricePaise,
        addon_price_paise: 0,
        total_price_paise: it.lineTotalPaise,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .upsert(itemsPayload, { onConflict: 'id', ignoreDuplicates: true });

      if (itemsError) {
        console.error('[pushOrderToDatabase] Items error:', itemsError);
      }
    }

    // 3. Insert payment tender into public.payments
    const paymentPayload = {
      id: generateUUID(),
      order_id: order.id,
      method: method.toLowerCase() as 'cash' | 'upi' | 'card',
      amount_paise: order.totalPaise,
      upi_utr: null,
      created_at: completedAt,
    };

    const { error: paymentError } = await supabase
      .from('payments')
      .upsert(paymentPayload, { onConflict: 'id', ignoreDuplicates: true });

    if (paymentError) {
      console.error('[pushOrderToDatabase] Payment error:', paymentError);
    }

    return { success: true, orderId: order.id };
  } catch (err: any) {
    console.error('[pushOrderToDatabase] Unexpected exception:', err);
    return { success: false, error: err?.message || 'Failed to push order to database' };
  }
}

/**
 * Fetches all completed orders directly from Supabase,
 * joined with order items and payment records.
 */
export async function fetchOrdersFromDatabase(): Promise<PosOrder[]> {
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

    if (error || !data) {
      console.warn('[fetchOrdersFromDatabase] Query error:', error);
      return [];
    }

    return data.map((rec: any) => ({
      id: rec.id,
      token: rec.token_terminal
        ? `${rec.token_terminal}-${rec.token_seq.toString().padStart(3, '0')}`
        : `#${rec.token_seq.toString().padStart(3, '0')}`,
      status: 'COMPLETED',
      items: (rec.order_items || []).map((it: any) => ({
        lineId: it.id,
        productId: it.menu_item_id || it.id,
        productName: it.product_name,
        variantId: it.variant_label || undefined,
        variantLabel: it.variant_label || undefined,
        addOnId: it.addon_label || undefined,
        addOnLabel: it.addon_label || undefined,
        unitPricePaise: it.unit_price_paise,
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
  } catch (err) {
    console.warn('[fetchOrdersFromDatabase] Exception:', err);
    return [];
  }
}

/**
 * Updates an existing order in Supabase (Owner action).
 * Supports editing status, discount, notes, and payment tender.
 */
export async function updateOrderInDatabase(
  orderId: string,
  updates: {
    status?: 'COMPLETED' | 'VOID' | 'REFUNDED' | 'CANCELLED' | 'MODIFIED';
    discount_paise?: number;
    discount_reason?: string | null;
    subtotal_paise?: number;
    tax_paise?: number;
    total_paise?: number;
    payment_method?: 'cash' | 'upi' | 'card';
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const orderFields: Record<string, any> = {};
    if (updates.status !== undefined) orderFields.status = updates.status;
    if (updates.discount_paise !== undefined) orderFields.discount_paise = updates.discount_paise;
    if (updates.discount_reason !== undefined) orderFields.discount_reason = updates.discount_reason;
    if (updates.subtotal_paise !== undefined) orderFields.subtotal_paise = updates.subtotal_paise;
    if (updates.tax_paise !== undefined) {
      orderFields.tax_paise = updates.tax_paise;
      orderFields.cgst_paise = Math.round(updates.tax_paise / 2);
      orderFields.sgst_paise = updates.tax_paise - orderFields.cgst_paise;
    }
    if (updates.total_paise !== undefined) orderFields.total_paise = updates.total_paise;

    if (Object.keys(orderFields).length > 0) {
      const { error: ordErr } = await (supabase as any)
        .from('orders')
        .update(orderFields)
        .eq('id', orderId);

      if (ordErr) {
        console.error('[updateOrderInDatabase] Error updating order:', ordErr);
        return { success: false, error: ordErr.message };
      }
    }

    if (updates.payment_method) {
      const { error: payErr } = await (supabase as any)
        .from('payments')
        .update({ method: updates.payment_method })
        .eq('order_id', orderId);

      if (payErr) {
        console.warn('[updateOrderInDatabase] Payment update warning:', payErr);
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('[updateOrderInDatabase] Exception:', err);
    return { success: false, error: err?.message || 'Failed to update order' };
  }
}

/**
 * Permanently deletes an order and cascaded records from Supabase (Owner action).
 */
export async function deleteOrderFromDatabase(
  orderId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('orders').delete().eq('id', orderId);
    if (error) {
      console.error('[deleteOrderFromDatabase] Error deleting order:', error);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('[deleteOrderFromDatabase] Exception:', err);
    return { success: false, error: err?.message || 'Failed to delete order' };
  }
}
