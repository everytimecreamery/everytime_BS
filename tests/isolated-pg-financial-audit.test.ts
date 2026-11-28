import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 — Isolated PostgreSQL Financial Audit & RBAC Security (No Refunds)', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022';

  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_STORE1_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_STORE2_ID = '33333333-3333-3333-3333-333333333333';

  const ORDER_COMPLETED_ID = '00000000-0000-0000-0000-000000001001';
  const ORDER_SPLIT_ID = '00000000-0000-0000-0000-000000001002';
  const ORDER_MULTI_CORR_ID = '00000000-0000-0000-0000-000000001003';
  const ORDER_DRAFT_ID = '00000000-0000-0000-0000-000000001004';
  const ORDER_CANCEL_ID = '00000000-0000-0000-0000-000000001005';

  let completedPaymentId: string;
  let multiCorrPaymentId: string;

  const cleanSql = (sql: string) => {
    return sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');
  };

  async function asAnon() {
    await db.exec(`
      SET ROLE anon;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = 'anon';
    `);
  }

  async function asStaffStore1() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_STORE1_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asStaffStore2() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_STORE2_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asOwner() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${OWNER_USER_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asOwnerNoUid() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asServiceRole() {
    await db.exec(`
      SET ROLE service_role;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = 'service_role';
    `);
  }

  async function asAdmin() {
    await db.exec(`
      SET ROLE postgres;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = '';
    `);
  }

  beforeAll(async () => {
    db = new PGlite();

    // 1. Setup Supabase auth mock schema and roles
    await db.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        ELSE
          ALTER ROLE service_role BYPASSRLS;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE,
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb
      );

      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
      $$ LANGUAGE sql STABLE;

      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$
        SELECT nullif(current_setting('request.jwt.claim.role', true), '')::text;
      $$ LANGUAGE sql STABLE;

      GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
      GRANT SELECT ON auth.users TO anon, authenticated, service_role;
    `);

    // 2. Load migrations 00, 02, 03, and 04
    const m0 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000000_init_billing_schema.sql'), 'utf-8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000002_menu_management_columns.sql'), 'utf-8');
    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');
    const m4 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000004_financial_audit_security.sql'), 'utf-8');

    await db.exec(cleanSql(m0));
    await db.exec(cleanSql(m2));

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    await db.exec(cleanSql(m3));
    await db.exec(cleanSql(m4));

    // 3. Seed stores, terminals, users, and baseline order + payment
    await asAdmin();
    await db.exec(`
      INSERT INTO public.stores (id, name, address, phone, gstin)
      VALUES ('${STORE_2_ID}', 'Second Scoop Shop', 'South Station Road', '+91 99999 88888', '29BBBBB1111B2Z6')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
      VALUES ('${TERMINAL_2_ID}', '${STORE_2_ID}', '01', 'Store 2 Counter Terminal')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO auth.users (id, email)
      VALUES
        ('${OWNER_USER_ID}', 'owner@everytimecreamery.com'),
        ('${STAFF_STORE1_ID}', 'staff1@everytimecreamery.com'),
        ('${STAFF_STORE2_ID}', 'staff2@everytimecreamery.com')
      ON CONFLICT (id) DO NOTHING;

      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');

      UPDATE public.profiles SET store_id = '${STORE_1_ID}' WHERE id = '${STAFF_STORE1_ID}';
      UPDATE public.profiles SET store_id = '${STORE_2_ID}' WHERE id = '${STAFF_STORE2_ID}';
    `);

    // Create a completed order and payment as Staff 1
    await asStaffStore1();
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, discount_paise, tax_paise, cgst_paise, sgst_paise, total_paise,
        client_completed_at, business_date
      ) VALUES (
        '${ORDER_COMPLETED_ID}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 501, 'COMPLETED', 10000, 0, 500, 250, 250, 10500, now(), CURRENT_DATE
      );
    `);
    await db.query<any>(`
      INSERT INTO public.order_items (
        id, order_id, menu_item_id, product_name, quantity, unit_price_paise, total_price_paise
      ) VALUES (
        '${crypto.randomUUID()}', '${ORDER_COMPLETED_ID}', 'gelato-classic-vanilla', 'Classic Vanilla', 1, 10000, 10000
      );
    `);
    const payRes = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_COMPLETED_ID}', 'cash', 10500)
      RETURNING id;
    `);
    completedPaymentId = payRes.rows[0].id as string;
  });

  afterAll(async () => {
    await db.close();
  });

  // ===========================================================================
  // PAYMENT IMMUTABILITY & DELETION PROTECTIONS (Requirements 1-6)
  // ===========================================================================

  it('1. Payment amount cannot be changed by owners', async () => {
    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.payments SET amount_paise = 8000 WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|immutable|Financial audit violation/i);

    // Even service_role cannot mutate payment amount_paise
    await asServiceRole();
    await expect(
      db.query<any>(`UPDATE public.payments SET amount_paise = 8000 WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/Financial audit violation: Payment amount is immutable/i);

    await asOwner();
    const check = await db.query<any>(`SELECT amount_paise FROM public.payments WHERE id = '${completedPaymentId}';`);
    expect(Number(check.rows[0].amount_paise)).toBe(10500);
  });

  it('2. Payment amount cannot be changed by staff', async () => {
    await asStaffStore1();
    await expect(
      db.query<any>(`UPDATE public.payments SET amount_paise = 5000 WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|violates row-level security|immutable/i);

    const check = await db.query<any>(`SELECT amount_paise FROM public.payments WHERE id = '${completedPaymentId}';`);
    expect(Number(check.rows[0].amount_paise)).toBe(10500);
  });

  it('3. Payment order association cannot be changed', async () => {
    await asStaffStore1();
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${ORDER_MULTI_CORR_ID}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 503, 'COMPLETED', 20000, 20000, now(), CURRENT_DATE
      );
    `);

    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.payments SET order_id = '${ORDER_MULTI_CORR_ID}' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|order association is immutable|Financial audit violation/i);

    await asServiceRole();
    await expect(
      db.query<any>(`UPDATE public.payments SET order_id = '${ORDER_MULTI_CORR_ID}' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/Financial audit violation: Payment order association is immutable/i);
  });

  it('4. Payment primary key cannot be changed', async () => {
    const newUuid = crypto.randomUUID();
    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.payments SET id = '${newUuid}' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|primary key is immutable|Financial audit violation/i);

    await asServiceRole();
    await expect(
      db.query<any>(`UPDATE public.payments SET id = '${newUuid}' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/Financial audit violation: Payment primary key is immutable/i);
  });

  it('5. Payment creation timestamp cannot be altered', async () => {
    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.payments SET created_at = '2020-01-01T00:00:00Z' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|timestamp is immutable|Financial audit violation/i);

    await asServiceRole();
    await expect(
      db.query<any>(`UPDATE public.payments SET created_at = '2020-01-01T00:00:00Z' WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/Financial audit violation: Payment creation timestamp is immutable/i);
  });

  it('6. Payment physical deletion is rejected for staff, owner, anon, and service_role', async () => {
    await asAnon();
    await expect(
      db.query<any>(`DELETE FROM public.payments WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|Physical deletion of payment records/i);

    await asStaffStore1();
    await expect(
      db.query<any>(`DELETE FROM public.payments WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|Physical deletion of payment records/i);

    await asOwner();
    await expect(
      db.query<any>(`DELETE FROM public.payments WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|Physical deletion of payment records/i);

    await asServiceRole();
    await expect(
      db.query<any>(`DELETE FROM public.payments WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/Physical deletion of payment records is strictly prohibited/i);

    await asOwner();
    const check = await db.query<any>(`SELECT COUNT(*) AS c FROM public.payments WHERE id = '${completedPaymentId}';`);
    expect(Number(check.rows[0].c)).toBe(1);
  });

  // ===========================================================================
  // ORDER PRESERVATION & PRE-COMPLETION WORKFLOW (Requirements 7-10)
  // ===========================================================================

  it('7. Completed orders cannot be deleted (and cannot be transitioned to CANCELLED/VOID or REFUNDED)', async () => {
    await asStaffStore1();
    const staffDel = await db.query<any>(`DELETE FROM public.orders WHERE id = '${ORDER_COMPLETED_ID}';`);
    expect(staffDel.affectedRows).toBe(0);

    await asOwner();
    await expect(
      db.query<any>(`DELETE FROM public.orders WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Cannot delete completed, closed, or paid orders/i);

    await expect(
      db.query<any>(`UPDATE public.orders SET status = 'CANCELLED', cancelled_reason = 'Attempt void paid' WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Completed orders cannot change status/i);

    await expect(
      db.query<any>(`UPDATE public.orders SET status = 'REFUNDED' WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/check constraint|Completed orders cannot change status/i);
  });

  it('8. Orders containing payment records cannot be deleted (even if PROCESSING) and FK is ON DELETE RESTRICT', async () => {
    const paidProcessingOrderId = '00000000-0000-0000-0000-000000001008';
    await asStaffStore1();
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${paidProcessingOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 508, 'PROCESSING', 10000, 10000, now(), CURRENT_DATE
      );
    `);
    await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${paidProcessingOrderId}', 'upi', 5000);
    `);

    await asOwner();
    await expect(
      db.query<any>(`DELETE FROM public.orders WHERE id = '${paidProcessingOrderId}';`)
    ).rejects.toThrow(/Cannot delete completed, closed, or paid orders|violates foreign key constraint/i);

    // Also cannot void/cancel an order that already has a payment
    await expect(
      db.query<any>(`UPDATE public.orders SET status = 'CANCELLED', cancelled_reason = 'Cancel paid draft' WHERE id = '${paidProcessingOrderId}';`)
    ).rejects.toThrow(/Only unpaid orders can be cancelled or voided/i);

    // Verify FK delete_rule on payments.order_id is RESTRICT ('r')
    await asAdmin();
    const fkRes = await db.query<any>(`
      SELECT confdeltype FROM pg_constraint
      WHERE conname = 'payments_order_id_fkey' AND conrelid = 'public.payments'::regclass;
    `);
    expect(fkRes.rows[0].confdeltype).toBe('r');
  });

  it('9. Finalized order totals and line items cannot be arbitrarily modified', async () => {
    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.orders SET total_paise = 5000 WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Finalized order totals and core attributes are immutable/i);

    await expect(
      db.query<any>(`UPDATE public.orders SET subtotal_paise = 5000 WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Finalized order totals and core attributes are immutable/i);

    await expect(
      db.query<any>(`UPDATE public.orders SET discount_paise = 2000 WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Finalized order totals and core attributes are immutable/i);

    await expect(
      db.query<any>(`UPDATE public.orders SET tax_paise = 100, cgst_paise = 50, sgst_paise = 50 WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Finalized order totals and core attributes are immutable/i);

    // Finalized order metadata (discount_reason) and items cannot be modified or inserted post-payment
    await expect(
      db.query<any>(`UPDATE public.orders SET discount_reason = 'Tampered reason' WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Finalized order totals and core attributes are immutable/i);

    await expect(
      db.query<any>(`
        INSERT INTO public.order_items (
          id, order_id, menu_item_id, product_name, quantity, unit_price_paise, total_price_paise
        ) VALUES (
          '${crypto.randomUUID()}', '${ORDER_COMPLETED_ID}', 'extra-wafer-cone', 'Injected Item', 1, 1500, 1500
        );
      `)
    ).rejects.toThrow(/Cannot add line items to an order that already has recorded payments/i);

    // Finalized order items cannot be modified or deleted
    await expect(
      db.query<any>(`UPDATE public.order_items SET quantity = 5 WHERE order_id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Line items of finalized or closed orders cannot be modified or deleted/i);

    await expect(
      db.query<any>(`DELETE FROM public.order_items WHERE order_id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Line items of finalized or closed orders cannot be modified or deleted/i);
  });

  it('10. Eligible unpaid draft orders preserve pre-completion editing and controlled unpaid cancellation', async () => {
    await asStaffStore1();
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, discount_paise, tax_paise, cgst_paise, sgst_paise, total_paise,
        client_completed_at, business_date
      ) VALUES (
        '${ORDER_DRAFT_ID}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 504, 'PROCESSING', 10000, 0, 500, 250, 250, 10500, now(), CURRENT_DATE
      );
    `);

    // Staff can edit pre-completion draft totals in their store
    const draftEdit = await db.query<any>(`
      UPDATE public.orders
      SET subtotal_paise = 20000, tax_paise = 1000, cgst_paise = 500, sgst_paise = 500, total_paise = 21000
      WHERE id = '${ORDER_DRAFT_ID}'
      RETURNING total_paise, status;
    `);
    expect(Number(draftEdit.rows[0].total_paise)).toBe(21000);
    expect(draftEdit.rows[0].status).toBe('PROCESSING');

    // Unpaid draft order can be cancelled by owner ONLY with a mandatory reason
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${ORDER_CANCEL_ID}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 505, 'PROCESSING', 5000, 5000, now(), CURRENT_DATE
      );
    `);

    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.orders SET status = 'CANCELLED' WHERE id = '${ORDER_CANCEL_ID}';`)
    ).rejects.toThrow(/Cancellation or void reason is mandatory/i);

    const cancelOk = await db.query<any>(`
      UPDATE public.orders
      SET status = 'CANCELLED', cancelled_reason = 'Customer left before paying'
      WHERE id = '${ORDER_CANCEL_ID}'
      RETURNING status, cancelled_reason, cancelled_by, cancelled_at;
    `);
    expect(cancelOk.rows[0].status).toBe('CANCELLED');
    expect(cancelOk.rows[0].cancelled_by).toBe(OWNER_USER_ID);
    expect(cancelOk.rows[0].cancelled_at).toBeTruthy();

    // Staff can complete their unpaid draft and record payment
    await asStaffStore1();
    await db.query<any>(`UPDATE public.orders SET status = 'COMPLETED' WHERE id = '${ORDER_DRAFT_ID}';`);
    const draftPay = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_DRAFT_ID}', 'cash', 21000)
      RETURNING id;
    `);
    expect(draftPay.rows.length).toBe(1);
  });

  // ===========================================================================
  // PAYMENT METHOD CORRECTIONS & APPEND-ONLY AUDIT LEDGER (Requirements 11-17)
  // ===========================================================================

  it('11. Owner payment method correction succeeds with a valid reason and preserves amount and order', async () => {
    await asOwner();
    const res = await db.query<any>(`
      SELECT * FROM public.correct_payment_method(
        '${completedPaymentId}',
        'card',
        'Customer paid via EDC card terminal; cashier pressed cash'
      );
    `);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].previous_method).toBe('cash');
    expect(res.rows[0].new_method).toBe('card');
    expect(Number(res.rows[0].amount_paise)).toBe(10500);
    expect(res.rows[0].corrected_by).toBe(OWNER_USER_ID);
    expect(res.rows[0].reason).toBe('Customer paid via EDC card terminal; cashier pressed cash');

    const payCheck = await db.query<any>(`SELECT method, amount_paise, order_id FROM public.payments WHERE id = '${completedPaymentId}';`);
    expect(payCheck.rows[0].method).toBe('card');
    expect(Number(payCheck.rows[0].amount_paise)).toBe(10500);
    expect(payCheck.rows[0].order_id).toBe(ORDER_COMPLETED_ID);
  });

  it('12. Staff payment method correction is rejected', async () => {
    await asStaffStore1();
    await expect(
      db.query<any>(`
        SELECT * FROM public.correct_payment_method(
          '${completedPaymentId}',
          'upi',
          'Staff trying to alter payment method'
        );
      `)
    ).rejects.toThrow(/Unauthorized: Only owners are authorized to correct payment methods/i);

    await asAnon();
    await expect(
      db.query<any>(`
        SELECT * FROM public.correct_payment_method(
          '${completedPaymentId}',
          'upi',
          'Anon trying to alter payment method'
        );
      `)
    ).rejects.toThrow(/permission denied|Unauthorized/i);
  });

  it('13. Missing or blank correction reason is rejected', async () => {
    await asOwner();
    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', '');`)
    ).rejects.toThrow(/correction reason is mandatory/i);

    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', '   ');`)
    ).rejects.toThrow(/correction reason is mandatory/i);

    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', NULL);`)
    ).rejects.toThrow(/correction reason is mandatory/i);
  });

  it('14. Invalid or missing actor attribution is rejected (no arbitrary owner fallback)', async () => {
    await asOwnerNoUid();
    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', 'Valid reason without auth uid');`)
    ).rejects.toThrow(/Unauthorized: Payment correction requires a valid authenticated owner session/i);

    await asServiceRole();
    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', 'Service role without user session');`)
    ).rejects.toThrow(/permission denied|Unauthorized: Payment correction requires a valid authenticated owner session/i);

    await asAdmin();
    await expect(
      db.query<any>(`SELECT * FROM public.correct_payment_method('${completedPaymentId}', 'upi', 'Postgres session without user uid');`)
    ).rejects.toThrow(/Unauthorized: Payment correction requires a valid authenticated owner session/i);
  });

  it('15. Every correction produces a separate append-only audit event', async () => {
    await asStaffStore1();
    const pRes = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_MULTI_CORR_ID}', 'cash', 20000)
      RETURNING id;
    `);
    const payId = pRes.rows[0].id as string;

    await asOwner();
    await db.query<any>(`SELECT * FROM public.correct_payment_method('${payId}', 'upi', 'First correction: cash -> upi');`);
    await db.query<any>(`SELECT * FROM public.correct_payment_method('${payId}', 'card', 'Second correction: upi -> card');`);

    const events = await db.query<any>(`
      SELECT previous_method, new_method, reason, corrected_by
      FROM public.payment_corrections
      WHERE payment_id = '${payId}'
      ORDER BY created_at ASC, id ASC;
    `);
    expect(events.rows.length).toBe(2);
    expect(events.rows[0].previous_method).toBe('cash');
    expect(events.rows[0].new_method).toBe('upi');
    expect(events.rows[1].previous_method).toBe('upi');
    expect(events.rows[1].new_method).toBe('card');
    expect(events.rows[0].corrected_by).toBe(OWNER_USER_ID);
    expect(events.rows[1].corrected_by).toBe(OWNER_USER_ID);
    multiCorrPaymentId = payId;
  });

  it('16. Direct client insertion into payment_corrections is rejected', async () => {
    await asOwner();
    await expect(
      db.query<any>(`
        INSERT INTO public.payment_corrections (
          payment_id, order_id, previous_method, new_method, amount_paise, reason, corrected_by
        ) VALUES (
          '${completedPaymentId}', '${ORDER_COMPLETED_ID}', 'card', 'cash', 10500, 'Fabricated entry', '${STAFF_STORE1_ID}'
        );
      `)
    ).rejects.toThrow(/permission denied|Direct insertion into payment_corrections is prohibited/i);

    await asStaffStore1();
    await expect(
      db.query<any>(`
        INSERT INTO public.payment_corrections (
          payment_id, order_id, previous_method, new_method, amount_paise, reason, corrected_by
        ) VALUES (
          '${completedPaymentId}', '${ORDER_COMPLETED_ID}', 'card', 'cash', 10500, 'Staff fabricated entry', '${OWNER_USER_ID}'
        );
      `)
    ).rejects.toThrow(/permission denied|Direct insertion into payment_corrections is prohibited/i);

    await asServiceRole();
    await expect(
      db.query<any>(`
        INSERT INTO public.payment_corrections (
          payment_id, order_id, previous_method, new_method, amount_paise, reason, corrected_by
        ) VALUES (
          '${completedPaymentId}', '${ORDER_COMPLETED_ID}', 'card', 'cash', 10500, 'Bypass attempt', '${OWNER_USER_ID}'
        );
      `)
    ).rejects.toThrow(/permission denied|Direct insertion into payment_corrections is prohibited/i);

    await asAdmin();
    await expect(
      db.query<any>(`
        INSERT INTO public.payment_corrections (
          payment_id, order_id, previous_method, new_method, amount_paise, reason, corrected_by
        ) VALUES (
          '${completedPaymentId}', '${ORDER_COMPLETED_ID}', 'card', 'cash', 10500, 'Admin bypass attempt', '${OWNER_USER_ID}'
        );
      `)
    ).rejects.toThrow(/Direct insertion into payment_corrections is prohibited/i);
  });

  it('17. Correction history cannot be modified or deleted by application users', async () => {
    await asOwner();
    await expect(
      db.query<any>(`UPDATE public.payment_corrections SET reason = 'Tampered reason' WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|append-only and cannot be modified or deleted/i);

    await expect(
      db.query<any>(`DELETE FROM public.payment_corrections WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|append-only and cannot be modified or deleted/i);

    await asServiceRole();
    await expect(
      db.query<any>(`UPDATE public.payment_corrections SET reason = 'Tampered reason' WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|append-only and cannot be modified or deleted/i);

    await expect(
      db.query<any>(`DELETE FROM public.payment_corrections WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|append-only and cannot be modified or deleted/i);

    await asAdmin();
    await expect(
      db.query<any>(`UPDATE public.payment_corrections SET reason = 'Tampered reason' WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/append-only and cannot be modified or deleted/i);

    await expect(
      db.query<any>(`DELETE FROM public.payment_corrections WHERE payment_id = '${completedPaymentId}';`)
    ).rejects.toThrow(/append-only and cannot be modified or deleted/i);
  });

  // ===========================================================================
  // NORMAL BILLING, SPLIT PAYMENTS, REPORTING, RBAC & CATALOG (Requirements 18-21)
  // ===========================================================================

  it('18. Cash, UPI, and Card payments continue working and reporting reflects corrected tender', async () => {
    await asStaffStore1();
    const cashOrder = '00000000-0000-0000-0000-000000002001';
    const upiOrder = '00000000-0000-0000-0000-000000002002';
    const cardOrder = '00000000-0000-0000-0000-000000002003';

    for (const [idx, [oid, method, amt]] of [
      [cashOrder, 'cash', 10000],
      [upiOrder, 'upi', 15000],
      [cardOrder, 'card', 25000],
    ].entries()) {
      await db.query<any>(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${oid}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
          'T1', ${600 + idx}, 'COMPLETED', ${amt}, ${amt}, now(), CURRENT_DATE
        );
      `);
      await db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${oid}', '${method}', ${amt});
      `);
    }

    await asOwner();
    const totals = await db.query<any>(`
      SELECT
        COALESCE(SUM(amount_paise) FILTER (WHERE method = 'cash'), 0) AS cash_total,
        COALESCE(SUM(amount_paise) FILTER (WHERE method = 'upi'), 0) AS upi_total,
        COALESCE(SUM(amount_paise) FILTER (WHERE method = 'card'), 0) AS card_total
      FROM public.payments
      WHERE order_id IN ('${cashOrder}', '${upiOrder}', '${cardOrder}', '${multiCorrPaymentId ? ORDER_MULTI_CORR_ID : ORDER_COMPLETED_ID}');
    `);
    expect(Number(totals.rows[0].cash_total)).toBe(10000);
    expect(Number(totals.rows[0].upi_total)).toBe(15000);
    // 25000 cardOrder + 20000 ORDER_MULTI_CORR_ID (corrected cash -> upi -> card)
    expect(Number(totals.rows[0].card_total)).toBe(45000);
  });

  it('19. Split-payment checkout continues working', async () => {
    await asStaffStore1();
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${ORDER_SPLIT_ID}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 502, 'COMPLETED', 30000, 30000, now(), CURRENT_DATE
      );
    `);

    await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_SPLIT_ID}', 'cash', 12000);
    `);
    await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_SPLIT_ID}', 'upi', 10000);
    `);
    await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${ORDER_SPLIT_ID}', 'card', 8000);
    `);

    const splitRes = await db.query<any>(`
      SELECT COUNT(*) AS cnt, SUM(amount_paise) AS total
      FROM public.payments WHERE order_id = '${ORDER_SPLIT_ID}';
    `);
    expect(Number(splitRes.rows[0].cnt)).toBe(3);
    expect(Number(splitRes.rows[0].total)).toBe(30000);

    // Overpayment beyond split total is still rejected
    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${ORDER_SPLIT_ID}', 'cash', 1);
      `)
    ).rejects.toThrow(/exceeds remaining order balance|violates row-level security/i);
  });

  it('20. Cross-store isolation and RBAC protections remain intact', async () => {
    await asStaffStore2();
    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${ORDER_COMPLETED_ID}', 'cash', 100);
      `)
    ).rejects.toThrow(/violates row-level security|Cannot record payment for another store/i);

    await asStaffStore1();
    await expect(
      db.query<any>(`UPDATE public.profiles SET role = 'owner' WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/only owners can modify user roles/i);
  });

  it('21. Catalog security protections continue working (staff and anon cannot mutate catalog)', async () => {
    await asAnon();
    await expect(
      db.query<any>(`INSERT INTO public.categories (id, label, icon_name) VALUES ('hack_cat', 'Hack', 'Alert');`)
    ).rejects.toThrow(/violates row-level security|permission denied/i);

    await asStaffStore1();
    await expect(
      db.query<any>(`INSERT INTO public.menu_items (id, category_id, name, base_price_paise) VALUES ('hack_item', 'gelato', 'Hack', 100);`)
    ).rejects.toThrow(/violates row-level security|permission denied/i);

    await asOwner();
    const ok = await db.query<any>(`
      INSERT INTO public.categories (id, label, icon_name, sort_order)
      VALUES ('audit_test_cat', 'Audit Test', 'Sparkles', 98)
      RETURNING id;
    `);
    expect(ok.rows[0].id).toBe('audit_test_cat');
  });

  // ===========================================================================
  // MIGRATION IDEMPOTENCY & SECURE ROLLBACK (Requirement 22)
  // ===========================================================================

  it('22. Migration 04 is idempotent and rollback disables RPC without restoring dangerous deletion behavior', async () => {
    await asAdmin();
    const m4 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000004_financial_audit_security.sql'), 'utf-8');
    const m4Rollback = fs.readFileSync(path.join(process.cwd(), 'supabase/rollbacks/20261122000004_financial_audit_security_rollback.sql'), 'utf-8');

    // Re-running migration 04 is idempotent
    await expect(db.exec(cleanSql(m4))).resolves.not.toThrow();

    // Executing rollback succeeds
    await expect(db.exec(cleanSql(m4Rollback))).resolves.not.toThrow();

    // RPC correct_payment_method is removed by rollback
    const rpcRes = await db.query<any>(`SELECT proname FROM pg_proc WHERE proname = 'correct_payment_method';`);
    expect(rpcRes.rows.length).toBe(0);

    // CRITICAL: Rollback does NOT restore dangerous payment or completed order deletion!
    await asOwner();
    await expect(
      db.query<any>(`DELETE FROM public.payments WHERE id = '${completedPaymentId}';`)
    ).rejects.toThrow(/permission denied|Physical deletion of payment records/i);

    await expect(
      db.query<any>(`DELETE FROM public.orders WHERE id = '${ORDER_COMPLETED_ID}';`)
    ).rejects.toThrow(/Cannot delete completed, closed, or paid orders/i);

    // CRITICAL: Existing correction history remains intact and immutable
    const histRes = await db.query<any>(`SELECT COUNT(*) AS c FROM public.payment_corrections WHERE payment_id = '${completedPaymentId}';`);
    expect(Number(histRes.rows[0].c)).toBe(1);

    // Re-applying migration 04 after rollback succeeds cleanly
    await asAdmin();
    await expect(db.exec(cleanSql(m4))).resolves.not.toThrow();
    const rpcRestored = await db.query<any>(`SELECT proname FROM pg_proc WHERE proname = 'correct_payment_method';`);
    expect(rpcRestored.rows.length).toBe(1);
  });
});
