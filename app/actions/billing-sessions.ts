'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { requireOwner, requireStaff } from '@/lib/auth/rbac';
import { calculateTaxSplitPaise } from '@/lib/pos/calculations';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BillingSessionActionResult<T = any> {
  success: boolean;
  error?: string;
  data?: T;
}

export interface ActiveCashierOption {
  id: string;
  full_name: string;
  cashier_code: string;
  store_id: string;
  is_active: boolean;
}

export interface BillingSessionSummary {
  session_id: string;
  store_id: string;
  store_name?: string;
  terminal_id: string;
  terminal_number?: string;
  device_name?: string;
  staff_member_id: string | null;
  staff_member_name: string | null;
  cashier_code: string | null;
  started_at: string;
  stopped_at: string | null;
  started_by: string;
  started_by_name: string | null;
  stopped_by: string | null;
  stopped_by_name: string | null;
  status: 'ACTIVE' | 'STOPPED';
  stop_reason: string | null;
  duration_seconds: number;
  order_count: number;
  subtotal_paise: number;
  discount_paise: number;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  sales_total_paise: number;
  cash_paise: number;
  upi_paise: number;
  card_paise: number;
}

export interface TerminalBillingStatusSnapshot {
  server_now: string;
  store: {
    id: string;
    name: string;
  };
  terminal: {
    id: string;
    store_id: string;
    terminal_number: string;
    device_name: string | null;
  };
  actor: {
    id: string;
    full_name: string;
    role: 'staff' | 'owner';
    cashier_code: string | null;
  };
  active: boolean;
  active_session: {
    session_id: string;
    store_id: string;
    terminal_id: string;
    staff_member_id: string | null;
    staff_member_name: string | null;
    cashier_code: string | null;
    started_at: string;
    started_by: string;
    started_by_name: string | null;
    status: 'ACTIVE';
    order_count: number;
    sales_total_paise: number;
  } | null;
  previous_session: {
    session_id: string;
    store_id: string;
    terminal_id: string;
    staff_member_id: string | null;
    staff_member_name: string | null;
    cashier_code: string | null;
    started_at: string;
    stopped_at: string;
    started_by: string;
    started_by_name: string | null;
    stopped_by: string | null;
    stopped_by_name: string | null;
    stop_reason: string | null;
    status: 'STOPPED';
    order_count: number;
    sales_total_paise: number;
  } | null;
  active_cashiers: ActiveCashierOption[];
}

export interface BillingSessionEventRecord {
  id: string;
  session_id: string;
  store_id: string;
  store_name?: string;
  terminal_id: string;
  terminal_number?: string;
  device_name?: string | null;
  event_type: 'SESSION_STARTED' | 'SESSION_STOPPED';
  actor_id: string;
  actor_name: string | null;
  staff_member_id: string | null;
  staff_member_name: string | null;
  cashier_code: string | null;
  reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SessionOrderLineItemDetail {
  id: string;
  menu_item_id: string | null;
  product_name: string;
  variant_label: string | null;
  addon_label: string | null;
  quantity: number;
  unit_price_paise: number;
  addon_price_paise: number;
  effective_unit_price_paise: number;
  total_price_paise: number;
}

export interface SessionOrderPaymentDetail {
  id: string;
  method: 'cash' | 'upi' | 'card';
  amount_paise: number;
  upi_utr: string | null;
  created_at: string;
}

export interface SessionOrderDetail {
  id: string;
  token: string;
  token_terminal: string;
  token_seq: number;
  status: string;
  store_id: string;
  terminal_id: string;
  billing_session_id: string | null;
  cashier_id: string;
  cashier_profile_name: string | null;
  staff_member_id: string | null;
  staff_member_name: string | null;
  cashier_code: string | null;
  subtotal_paise: number;
  discount_paise: number;
  discount_type: string | null;
  discount_reason: string | null;
  tax_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  total_paise: number;
  total_quantity: number;
  client_completed_at: string;
  server_received_at: string;
  business_date: string;
  items: SessionOrderLineItemDetail[];
  payments: SessionOrderPaymentDetail[];
}

export interface BillingSessionDetailPayload {
  server_now: string;
  session: BillingSessionSummary;
  orders: SessionOrderDetail[];
  events: BillingSessionEventRecord[];
}

export interface OwnerTerminalMonitorCard {
  store_id: string;
  store_name: string;
  terminal_id: string;
  terminal_number: string;
  device_name: string | null;
  billing_active: boolean;
  status: 'ON' | 'OFF';
  active_session: BillingSessionSummary | null;
  last_session: BillingSessionSummary | null;
  last_event: BillingSessionEventRecord | null;
}

export interface OwnerBillingMonitoringPayload {
  server_now: string;
  terminals: OwnerTerminalMonitorCard[];
  active_sessions: BillingSessionSummary[];
  historical_sessions: BillingSessionSummary[];
  recent_events: BillingSessionEventRecord[];
}

function computeDurationSeconds(
  startedAt: string,
  stoppedAt: string | null,
  referenceNowMs: number
): number {
  const startMs = new Date(startedAt).getTime();
  const endMs = stoppedAt ? new Date(stoppedAt).getTime() : referenceNowMs;
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0;
  return Math.max(0, Math.floor((endMs - startMs) / 1000));
}

function aggregateOrdersForSession(orders: any[]) {
  let orderCount = 0;
  let subtotalPaise = 0;
  let discountPaise = 0;
  let taxPaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let salesTotalPaise = 0;
  let cashPaise = 0;
  let upiPaise = 0;
  let cardPaise = 0;

  for (const ord of orders) {
    if (ord.status !== 'COMPLETED') continue;
    orderCount += 1;
    subtotalPaise += Number(ord.subtotal_paise || 0);
    discountPaise += Number(ord.discount_paise || 0);
    const ordTax = Number(ord.tax_paise || 0);
    taxPaise += ordTax;

    if (ord.cgst_paise != null && ord.sgst_paise != null) {
      cgstPaise += Number(ord.cgst_paise);
      sgstPaise += Number(ord.sgst_paise);
    } else {
      const split = calculateTaxSplitPaise(ordTax);
      cgstPaise += split.cgstPaise;
      sgstPaise += split.sgstPaise;
    }

    salesTotalPaise += Number(ord.total_paise || 0);

    const payments = Array.isArray(ord.payments) ? ord.payments : [];
    if (payments.length > 0) {
      for (const p of payments) {
        const amt = Number(p.amount_paise || 0);
        const m = String(p.method || '').toLowerCase();
        if (m === 'cash') cashPaise += amt;
        else if (m === 'upi') upiPaise += amt;
        else if (m === 'card') cardPaise += amt;
      }
    }
  }

  return {
    order_count: orderCount,
    subtotal_paise: subtotalPaise,
    discount_paise: discountPaise,
    tax_paise: taxPaise,
    cgst_paise: cgstPaise,
    sgst_paise: sgstPaise,
    sales_total_paise: salesTotalPaise,
    cash_paise: cashPaise,
    upi_paise: upiPaise,
    card_paise: cardPaise,
  };
}

/**
 * 1. Start a manual billing session for a terminal.
 * Accessible by authenticated active Staff (for their store) or Owner.
 */
export async function startBillingSessionAction(input: {
  storeId?: string | null;
  terminalId?: string | null;
  staffMemberId?: string | null;
}): Promise<BillingSessionActionResult> {
  try {
    const { profile } = await requireStaff();

    const requestedStoreId = input.storeId ? input.storeId.trim() : null;
    if (requestedStoreId && !UUID_REGEX.test(requestedStoreId)) {
      return { success: false, error: 'Invalid store ID format.' };
    }

    if (
      profile.role === 'staff' &&
      requestedStoreId &&
      requestedStoreId !== profile.store_id
    ) {
      return {
        success: false,
        error: 'Unauthorized: Staff member cannot start billing for another store.',
      };
    }

    const effectiveStoreId =
      profile.role === 'staff'
        ? profile.store_id
        : requestedStoreId || profile.store_id;

    if (!effectiveStoreId) {
      return {
        success: false,
        error: 'Store assignment is required to start a billing session.',
      };
    }

    const requestedTerminalId = input.terminalId ? input.terminalId.trim() : null;
    if (requestedTerminalId && !UUID_REGEX.test(requestedTerminalId)) {
      return { success: false, error: 'Invalid terminal ID format.' };
    }

    const requestedStaffMemberId = input.staffMemberId
      ? input.staffMemberId.trim()
      : null;
    if (requestedStaffMemberId && !UUID_REGEX.test(requestedStaffMemberId)) {
      return { success: false, error: 'Invalid employee selection format.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let effectiveTerminalId = requestedTerminalId;
    if (!effectiveTerminalId) {
      const { data: termRow, error: termError } = await (supabase as any)
        .from('terminals')
        .select('id, store_id')
        .eq('store_id', effectiveStoreId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (termError) {
        return { success: false, error: termError.message };
      }
      if (!termRow?.id) {
        return {
          success: false,
          error: 'No counter terminal is registered for this store.',
        };
      }
      effectiveTerminalId = termRow.id;
    }

    const { data, error } = await (supabase as any).rpc('start_billing_session', {
      p_store_id: effectiveStoreId,
      p_terminal_id: effectiveTerminalId,
      p_staff_member_id: requestedStaffMemberId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to start billing session.',
    };
  }
}

/**
 * 2. Stop an active manual billing session.
 * Accessible by authenticated active Staff (for their store) or Owner.
 */
export async function stopBillingSessionAction(input: {
  sessionId: string;
  stopReason?: string | null;
}): Promise<BillingSessionActionResult> {
  try {
    await requireStaff();

    const sessionId = typeof input.sessionId === 'string' ? input.sessionId.trim() : '';
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      return { success: false, error: 'A valid billing session ID is required to stop billing.' };
    }

    const rawReason =
      typeof input.stopReason === 'string' ? input.stopReason.trim() : '';
    if (rawReason.length > 300) {
      return {
        success: false,
        error: 'Stop reason must be 300 characters or fewer.',
      };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await (supabase as any).rpc('stop_billing_session', {
      p_session_id: sessionId,
      p_stop_reason: rawReason || null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to stop billing session.',
    };
  }
}

/**
 * 3. Get authoritative current terminal billing status, previous session, and store active cashiers.
 */
export async function getCurrentBillingSessionAction(
  terminalId?: string | null
): Promise<BillingSessionActionResult<TerminalBillingStatusSnapshot>> {
  try {
    await requireStaff();

    const cleanTerminalId = terminalId ? terminalId.trim() : null;
    if (cleanTerminalId && !UUID_REGEX.test(cleanTerminalId)) {
      return { success: false, error: 'Invalid terminal ID format.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await (supabase as any).rpc(
      'get_terminal_billing_status',
      {
        p_terminal_id: cleanTerminalId,
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: data as TerminalBillingStatusSnapshot,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to fetch current billing session status.',
    };
  }
}

/**
 * 4. List active store employees for sticky cashier operational attribution.
 */
export async function listActiveStaffMembersAction(
  storeId?: string | null
): Promise<BillingSessionActionResult<ActiveCashierOption[]>> {
  try {
    const { profile } = await requireStaff();

    const cleanStoreId = storeId ? storeId.trim() : null;
    if (cleanStoreId && !UUID_REGEX.test(cleanStoreId)) {
      return { success: false, error: 'Invalid store ID format.' };
    }

    if (
      profile.role === 'staff' &&
      cleanStoreId &&
      cleanStoreId !== profile.store_id
    ) {
      return {
        success: false,
        error: 'Unauthorized: Cannot list employees for another store.',
      };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data, error } = await (supabase as any).rpc(
      'list_store_active_cashiers',
      {
        p_store_id: cleanStoreId || profile.store_id || null,
      }
    );

    if (error) {
      return { success: false, error: error.message };
    }

    return {
      success: true,
      data: (Array.isArray(data) ? data : []) as ActiveCashierOption[],
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to load active store employees.',
    };
  }
}

/**
 * 5. Get billing session history with session-wise sales summaries.
 */
export async function getBillingSessionHistoryAction(options?: {
  storeId?: string | null;
  terminalId?: string | null;
  limit?: number;
}): Promise<BillingSessionActionResult<BillingSessionSummary[]>> {
  try {
    const { profile } = await requireStaff();

    const requestedStoreId = options?.storeId ? options.storeId.trim() : null;
    if (requestedStoreId && !UUID_REGEX.test(requestedStoreId)) {
      return { success: false, error: 'Invalid store ID format.' };
    }

    if (
      profile.role === 'staff' &&
      requestedStoreId &&
      requestedStoreId !== profile.store_id
    ) {
      return {
        success: false,
        error: 'Unauthorized: Staff cannot access session history for another store.',
      };
    }

    const requestedTerminalId = options?.terminalId
      ? options.terminalId.trim()
      : null;
    if (requestedTerminalId && !UUID_REGEX.test(requestedTerminalId)) {
      return { success: false, error: 'Invalid terminal ID format.' };
    }

    const effectiveStoreId =
      profile.role === 'staff' ? profile.store_id : requestedStoreId;

    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let query = (supabase as any)
      .from('billing_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (effectiveStoreId) {
      query = query.eq('store_id', effectiveStoreId);
    }
    if (requestedTerminalId) {
      query = query.eq('terminal_id', requestedTerminalId);
    }

    const { data: sessions, error: sessionsError } = await query;
    if (sessionsError) {
      return { success: false, error: sessionsError.message };
    }

    if (!sessions || sessions.length === 0) {
      return { success: true, data: [] };
    }

    const sessionIds = sessions.map((s: any) => s.id);

    const [storesRes, terminalsRes, profilesRes, staffRes, ordersRes] =
      await Promise.all([
        (supabase as any).from('stores').select('id, name'),
        (supabase as any)
          .from('terminals')
          .select('id, store_id, terminal_number, device_name'),
        (supabase as any).from('profiles').select('id, full_name, cashier_code'),
        (supabase as any)
          .from('staff_members')
          .select('id, full_name, cashier_code'),
        (supabase as any)
          .from('orders')
          .select(
            'id, billing_session_id, status, subtotal_paise, discount_paise, tax_paise, cgst_paise, sgst_paise, total_paise, payments(*)'
          )
          .in('billing_session_id', sessionIds)
          .eq('status', 'COMPLETED'),
      ]);

    const storeMap = new Map<string, any>(
      (storesRes.data || []).map((s: any) => [s.id, s])
    );
    const terminalMap = new Map<string, any>(
      (terminalsRes.data || []).map((t: any) => [t.id, t])
    );
    const profileMap = new Map<string, any>(
      (profilesRes.data || []).map((p: any) => [p.id, p])
    );
    const staffMap = new Map<string, any>(
      (staffRes.data || []).map((sm: any) => [sm.id, sm])
    );

    const ordersBySession = new Map<string, any[]>();
    for (const ord of ordersRes.data || []) {
      if (!ord.billing_session_id) continue;
      const arr = ordersBySession.get(ord.billing_session_id) || [];
      arr.push(ord);
      ordersBySession.set(ord.billing_session_id, arr);
    }

    const nowMs = Date.now();
    const summaries: BillingSessionSummary[] = sessions.map((s: any) => {
      const store = storeMap.get(s.store_id);
      const terminal = terminalMap.get(s.terminal_id);
      const staffMember = s.staff_member_id
        ? staffMap.get(s.staff_member_id)
        : null;
      const starter = profileMap.get(s.started_by);
      const stopper = s.stopped_by ? profileMap.get(s.stopped_by) : null;
      const sessionOrders = ordersBySession.get(s.id) || [];
      const totals = aggregateOrdersForSession(sessionOrders);

      return {
        session_id: s.id,
        store_id: s.store_id,
        store_name: store?.name || 'Everytime Creamery',
        terminal_id: s.terminal_id,
        terminal_number: terminal?.terminal_number || '01',
        device_name: terminal?.device_name || 'Counter Terminal #01',
        staff_member_id: s.staff_member_id,
        staff_member_name:
          staffMember?.full_name || starter?.full_name || null,
        cashier_code:
          staffMember?.cashier_code || starter?.cashier_code || null,
        started_at: s.started_at,
        stopped_at: s.stopped_at,
        started_by: s.started_by,
        started_by_name: starter?.full_name || null,
        stopped_by: s.stopped_by,
        stopped_by_name: stopper?.full_name || null,
        status: s.status,
        stop_reason: s.stop_reason,
        duration_seconds: computeDurationSeconds(
          s.started_at,
          s.stopped_at,
          nowMs
        ),
        ...totals,
      };
    });

    return {
      success: true,
      data: summaries,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to load billing session history.',
    };
  }
}

/**
 * 6. Get complete individual order details, items, variants, taxes, payments, and events for a session.
 */
export async function getBillingSessionDetailsAction(
  sessionId: string
): Promise<BillingSessionActionResult<BillingSessionDetailPayload>> {
  try {
    const { profile } = await requireStaff();

    const cleanId = typeof sessionId === 'string' ? sessionId.trim() : '';
    if (!cleanId || !UUID_REGEX.test(cleanId)) {
      return { success: false, error: 'Valid billing session ID is required.' };
    }

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    const { data: sessionRow, error: sessionError } = await (supabase as any)
      .from('billing_sessions')
      .select('*')
      .eq('id', cleanId)
      .maybeSingle();

    if (sessionError) {
      return { success: false, error: sessionError.message };
    }
    if (!sessionRow) {
      return { success: false, error: 'Billing session not found.' };
    }

    if (
      profile.role === 'staff' &&
      sessionRow.store_id !== profile.store_id
    ) {
      return {
        success: false,
        error: 'Unauthorized: Cannot view billing session details for another store.',
      };
    }

    const [
      storeRes,
      terminalRes,
      profilesRes,
      staffRes,
      ordersRes,
      eventsRes,
    ] = await Promise.all([
      (supabase as any)
        .from('stores')
        .select('id, name')
        .eq('id', sessionRow.store_id)
        .maybeSingle(),
      (supabase as any)
        .from('terminals')
        .select('id, store_id, terminal_number, device_name')
        .eq('id', sessionRow.terminal_id)
        .maybeSingle(),
      (supabase as any).from('profiles').select('id, full_name, cashier_code'),
      (supabase as any)
        .from('staff_members')
        .select('id, full_name, cashier_code'),
      (supabase as any)
        .from('orders')
        .select('*, order_items(*), payments(*)')
        .eq('billing_session_id', cleanId)
        .eq('status', 'COMPLETED')
        .order('client_completed_at', { ascending: false }),
      (supabase as any)
        .from('billing_session_events')
        .select('*')
        .eq('session_id', cleanId)
        .order('created_at', { ascending: true }),
    ]);

    if (ordersRes.error) {
      return { success: false, error: ordersRes.error.message };
    }

    const profileMap = new Map<string, any>(
      (profilesRes.data || []).map((p: any) => [p.id, p])
    );
    const staffMap = new Map<string, any>(
      (staffRes.data || []).map((sm: any) => [sm.id, sm])
    );

    const store = storeRes.data;
    const terminal = terminalRes.data;
    const sessionStaff = sessionRow.staff_member_id
      ? staffMap.get(sessionRow.staff_member_id)
      : null;
    const starter = profileMap.get(sessionRow.started_by);
    const stopper = sessionRow.stopped_by
      ? profileMap.get(sessionRow.stopped_by)
      : null;

    const rawOrders = ordersRes.data || [];
    const totals = aggregateOrdersForSession(rawOrders);
    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    // Also pull staff name from event metadata if staff_members table is RLS-restricted for staff
    const startEventMeta =
      (eventsRes.data || []).find(
        (ev: any) => ev.event_type === 'SESSION_STARTED'
      )?.metadata || {};

    const sessionSummary: BillingSessionSummary = {
      session_id: sessionRow.id,
      store_id: sessionRow.store_id,
      store_name: store?.name || 'Everytime Creamery',
      terminal_id: sessionRow.terminal_id,
      terminal_number: terminal?.terminal_number || '01',
      device_name: terminal?.device_name || 'Counter Terminal #01',
      staff_member_id: sessionRow.staff_member_id,
      staff_member_name:
        sessionStaff?.full_name ||
        startEventMeta?.staff_name ||
        starter?.full_name ||
        null,
      cashier_code:
        sessionStaff?.cashier_code ||
        startEventMeta?.cashier_code ||
        starter?.cashier_code ||
        null,
      started_at: sessionRow.started_at,
      stopped_at: sessionRow.stopped_at,
      started_by: sessionRow.started_by,
      started_by_name:
        starter?.full_name || startEventMeta?.actor_name || null,
      stopped_by: sessionRow.stopped_by,
      stopped_by_name: stopper?.full_name || null,
      status: sessionRow.status,
      stop_reason: sessionRow.stop_reason,
      duration_seconds: computeDurationSeconds(
        sessionRow.started_at,
        sessionRow.stopped_at,
        nowMs
      ),
      ...totals,
    };

    const detailedOrders: SessionOrderDetail[] = rawOrders.map((rec: any) => {
      const cashierProfile = profileMap.get(rec.cashier_id);
      const orderStaff = rec.staff_member_id
        ? staffMap.get(rec.staff_member_id)
        : sessionStaff;

      const items: SessionOrderLineItemDetail[] = (rec.order_items || []).map(
        (it: any) => {
          const unitPrice = Number(it.unit_price_paise || 0);
          const addonPrice = Number(it.addon_price_paise || 0);
          return {
            id: it.id,
            menu_item_id: it.menu_item_id || null,
            product_name: it.product_name,
            variant_label: it.variant_label || null,
            addon_label: it.addon_label || null,
            quantity: Number(it.quantity || 0),
            unit_price_paise: unitPrice,
            addon_price_paise: addonPrice,
            effective_unit_price_paise: unitPrice + addonPrice,
            total_price_paise: Number(it.total_price_paise || 0),
          };
        }
      );

      const payments: SessionOrderPaymentDetail[] = (rec.payments || []).map(
        (p: any) => ({
          id: p.id,
          method: String(p.method || 'cash').toLowerCase() as
            | 'cash'
            | 'upi'
            | 'card',
          amount_paise: Number(p.amount_paise || 0),
          upi_utr: p.upi_utr || null,
          created_at: p.created_at,
        })
      );

      const taxPaise = Number(rec.tax_paise || 0);
      const split =
        rec.cgst_paise != null && rec.sgst_paise != null
          ? {
              cgstPaise: Number(rec.cgst_paise),
              sgstPaise: Number(rec.sgst_paise),
            }
          : calculateTaxSplitPaise(taxPaise);

      const seqStr = String(rec.token_seq ?? 1).padStart(3, '0');
      const token = rec.token_terminal
        ? `${rec.token_terminal}-${seqStr}`
        : `#${seqStr}`;

      return {
        id: rec.id,
        token,
        token_terminal: rec.token_terminal || 'T1',
        token_seq: Number(rec.token_seq || 1),
        status: rec.status,
        store_id: rec.store_id,
        terminal_id: rec.terminal_id,
        billing_session_id: rec.billing_session_id,
        cashier_id: rec.cashier_id,
        cashier_profile_name: cashierProfile?.full_name || null,
        staff_member_id: rec.staff_member_id || sessionRow.staff_member_id || null,
        staff_member_name:
          orderStaff?.full_name ||
          sessionSummary.staff_member_name ||
          cashierProfile?.full_name ||
          null,
        cashier_code:
          orderStaff?.cashier_code ||
          sessionSummary.cashier_code ||
          cashierProfile?.cashier_code ||
          null,
        subtotal_paise: Number(rec.subtotal_paise || 0),
        discount_paise: Number(rec.discount_paise || 0),
        discount_type: rec.discount_type || null,
        discount_reason: rec.discount_reason || null,
        tax_paise: taxPaise,
        cgst_paise: split.cgstPaise,
        sgst_paise: split.sgstPaise,
        total_paise: Number(rec.total_paise || 0),
        total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
        client_completed_at: rec.client_completed_at,
        server_received_at: rec.server_received_at || rec.client_completed_at,
        business_date: rec.business_date,
        items,
        payments,
      };
    });

    const events: BillingSessionEventRecord[] = (eventsRes.data || []).map(
      (ev: any) => {
        const actor = profileMap.get(ev.actor_id);
        const sm = ev.staff_member_id ? staffMap.get(ev.staff_member_id) : null;
        const meta =
          ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        return {
          id: ev.id,
          session_id: ev.session_id,
          store_id: ev.store_id,
          store_name: store?.name || 'Everytime Creamery',
          terminal_id: ev.terminal_id,
          terminal_number: terminal?.terminal_number || '01',
          device_name: terminal?.device_name || 'Counter Terminal #01',
          event_type: ev.event_type,
          actor_id: ev.actor_id,
          actor_name: actor?.full_name || meta.actor_name || null,
          staff_member_id: ev.staff_member_id,
          staff_member_name: sm?.full_name || meta.staff_name || null,
          cashier_code: sm?.cashier_code || meta.cashier_code || null,
          reason: ev.reason || null,
          metadata: meta,
          created_at: ev.created_at,
        };
      }
    );

    return {
      success: true,
      data: {
        server_now: nowIso,
        session: sessionSummary,
        orders: detailedOrders,
        events,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to fetch billing session details.',
    };
  }
}

/**
 * 7. Get live Owner monitoring dashboard data across all stores and terminals.
 * Strictly Owner-only.
 */
export async function getOwnerBillingMonitoringAction(options?: {
  storeId?: string | null;
  historyLimit?: number;
}): Promise<BillingSessionActionResult<OwnerBillingMonitoringPayload>> {
  try {
    await requireOwner();

    const requestedStoreId = options?.storeId ? options.storeId.trim() : null;
    if (requestedStoreId && !UUID_REGEX.test(requestedStoreId)) {
      return { success: false, error: 'Invalid store ID format.' };
    }

    const historyLimit = Math.min(Math.max(options?.historyLimit ?? 50, 1), 200);

    const cookieStore = await cookies();
    const supabase = createClient(cookieStore);

    let sessionsQuery = (supabase as any)
      .from('billing_sessions')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(historyLimit);

    let terminalsQuery = (supabase as any)
      .from('terminals')
      .select('*')
      .order('terminal_number', { ascending: true });

    let eventsQuery = (supabase as any)
      .from('billing_session_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40);

    if (requestedStoreId) {
      sessionsQuery = sessionsQuery.eq('store_id', requestedStoreId);
      terminalsQuery = terminalsQuery.eq('store_id', requestedStoreId);
      eventsQuery = eventsQuery.eq('store_id', requestedStoreId);
    }

    const [
      storesRes,
      terminalsRes,
      profilesRes,
      staffRes,
      sessionsRes,
      eventsRes,
    ] = await Promise.all([
      (supabase as any).from('stores').select('id, name').order('name'),
      terminalsQuery,
      (supabase as any).from('profiles').select('id, full_name, cashier_code'),
      (supabase as any)
        .from('staff_members')
        .select('id, full_name, cashier_code'),
      sessionsQuery,
      eventsQuery,
    ]);

    if (sessionsRes.error) {
      return { success: false, error: sessionsRes.error.message };
    }
    if (terminalsRes.error) {
      return { success: false, error: terminalsRes.error.message };
    }

    const stores = storesRes.data || [];
    const terminals = terminalsRes.data || [];
    const sessions = sessionsRes.data || [];
    const rawEvents = eventsRes.data || [];

    const storeMap = new Map<string, any>(stores.map((s: any) => [s.id, s]));
    const terminalMap = new Map<string, any>(
      terminals.map((t: any) => [t.id, t])
    );
    const profileMap = new Map<string, any>(
      (profilesRes.data || []).map((p: any) => [p.id, p])
    );
    const staffMap = new Map<string, any>(
      (staffRes.data || []).map((sm: any) => [sm.id, sm])
    );

    const sessionIds = sessions.map((s: any) => s.id);
    const ordersBySession = new Map<string, any[]>();

    if (sessionIds.length > 0) {
      const { data: sessionOrders, error: ordersError } = await (
        supabase as any
      )
        .from('orders')
        .select(
          'id, billing_session_id, status, subtotal_paise, discount_paise, tax_paise, cgst_paise, sgst_paise, total_paise, payments(*)'
        )
        .in('billing_session_id', sessionIds)
        .eq('status', 'COMPLETED');

      if (!ordersError && sessionOrders) {
        for (const ord of sessionOrders) {
          if (!ord.billing_session_id) continue;
          const arr = ordersBySession.get(ord.billing_session_id) || [];
          arr.push(ord);
          ordersBySession.set(ord.billing_session_id, arr);
        }
      }
    }

    const nowIso = new Date().toISOString();
    const nowMs = Date.now();

    const mappedSessions: BillingSessionSummary[] = sessions.map((s: any) => {
      const store = storeMap.get(s.store_id);
      const terminal = terminalMap.get(s.terminal_id);
      const staffMember = s.staff_member_id
        ? staffMap.get(s.staff_member_id)
        : null;
      const starter = profileMap.get(s.started_by);
      const stopper = s.stopped_by ? profileMap.get(s.stopped_by) : null;
      const sessionOrders = ordersBySession.get(s.id) || [];
      const totals = aggregateOrdersForSession(sessionOrders);

      return {
        session_id: s.id,
        store_id: s.store_id,
        store_name: store?.name || 'Everytime Creamery',
        terminal_id: s.terminal_id,
        terminal_number: terminal?.terminal_number || '01',
        device_name: terminal?.device_name || 'Counter Terminal #01',
        staff_member_id: s.staff_member_id,
        staff_member_name:
          staffMember?.full_name || starter?.full_name || null,
        cashier_code:
          staffMember?.cashier_code || starter?.cashier_code || null,
        started_at: s.started_at,
        stopped_at: s.stopped_at,
        started_by: s.started_by,
        started_by_name: starter?.full_name || null,
        stopped_by: s.stopped_by,
        stopped_by_name: stopper?.full_name || null,
        status: s.status,
        stop_reason: s.stop_reason,
        duration_seconds: computeDurationSeconds(
          s.started_at,
          s.stopped_at,
          nowMs
        ),
        ...totals,
      };
    });

    const mappedEvents: BillingSessionEventRecord[] = rawEvents.map(
      (ev: any) => {
        const store = storeMap.get(ev.store_id);
        const terminal = terminalMap.get(ev.terminal_id);
        const actor = profileMap.get(ev.actor_id);
        const sm = ev.staff_member_id ? staffMap.get(ev.staff_member_id) : null;
        const meta =
          ev.metadata && typeof ev.metadata === 'object' ? ev.metadata : {};
        return {
          id: ev.id,
          session_id: ev.session_id,
          store_id: ev.store_id,
          store_name: store?.name || 'Everytime Creamery',
          terminal_id: ev.terminal_id,
          terminal_number: terminal?.terminal_number || '01',
          device_name: terminal?.device_name || 'Counter Terminal #01',
          event_type: ev.event_type,
          actor_id: ev.actor_id,
          actor_name: actor?.full_name || meta.actor_name || null,
          staff_member_id: ev.staff_member_id,
          staff_member_name: sm?.full_name || meta.staff_name || null,
          cashier_code: sm?.cashier_code || meta.cashier_code || null,
          reason: ev.reason || null,
          metadata: meta,
          created_at: ev.created_at,
        };
      }
    );

    const terminalCards: OwnerTerminalMonitorCard[] = terminals.map(
      (term: any) => {
        const store = storeMap.get(term.store_id);
        const termSessions = mappedSessions.filter(
          (s) => s.terminal_id === term.id
        );
        const activeSession =
          termSessions.find((s) => s.status === 'ACTIVE') || null;
        const lastStoppedSession =
          termSessions.find((s) => s.status === 'STOPPED') || null;
        const lastEvent =
          mappedEvents.find((ev) => ev.terminal_id === term.id) || null;

        return {
          store_id: term.store_id,
          store_name: store?.name || 'Everytime Creamery',
          terminal_id: term.id,
          terminal_number: term.terminal_number || '01',
          device_name: term.device_name || `Counter Terminal #${term.terminal_number || '01'}`,
          billing_active: activeSession !== null,
          status: activeSession ? 'ON' : 'OFF',
          active_session: activeSession,
          last_session: lastStoppedSession,
          last_event: lastEvent,
        };
      }
    );

    return {
      success: true,
      data: {
        server_now: nowIso,
        terminals: terminalCards,
        active_sessions: mappedSessions.filter((s) => s.status === 'ACTIVE'),
        historical_sessions: mappedSessions,
        recent_events: mappedEvents,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to load owner billing monitoring data.',
    };
  }
}
