import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Comprehensive Isolated PostgreSQL RBAC, Concurrency & Rollback Verification', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002'; // Seeded Store 1 Terminal
  const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022'; // Store 2 Terminal
  const FAKE_TERMINAL_ID = '00000000-0000-0000-0000-999999999999';

  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_STORE1_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_STORE2_ID = '33333333-3333-3333-3333-333333333333';
  const UNPRIVILEGED_USER_ID = '44444444-4444-4444-4444-444444444444';

  const cleanSql = (sql: string) => {
    return sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');
  };

  // Session switch helpers
  async function asAnon() {
    await db.exec(`
      SET ROLE anon;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = 'anon';
    `);
  }

  async function asAnonNullRole() {
    await db.exec(`
      SET ROLE anon;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = '';
    `);
  }

  async function asStaffStore1() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_STORE1_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asStaffNullRole() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_STORE1_ID}';
      SET request.jwt.claim.role = '';
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

  async function asServiceRole() {
    await db.exec(`
      SET ROLE service_role;
      SET request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';
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

    // 1. Setup Supabase auth mock schema and roles in PostgreSQL
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
          CREATE ROLE service_role NOLOGIN;
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

    // 2. Load and execute baseline migrations 00, 02
    const m0 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000000_init_billing_schema.sql'), 'utf-8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000002_menu_management_columns.sql'), 'utf-8');

    await db.exec(cleanSql(m0));
    await db.exec(cleanSql(m2));

    // 3. Grant schema usage and table permissions to standard roles
    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    // 4. Load the corrected migration 03
    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');
    await db.exec(cleanSql(m3));

    // 5. Seed test data as admin (Stores, Terminals, Users, Profiles)
    await asAdmin();

    await db.exec(`
      INSERT INTO public.stores (id, name, address, phone, gstin)
      VALUES ('${STORE_2_ID}', 'Second Scoop Shop', 'South Station Road', '+91 99999 88888', '29BBBBB1111B2Z6')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
      VALUES ('${TERMINAL_2_ID}', '${STORE_2_ID}', '01', 'Store 2 Counter Terminal')
      ON CONFLICT (id) DO NOTHING;

      -- Create auth users (triggers handle_new_user which creates staff profiles)
      INSERT INTO auth.users (id, email)
      VALUES
        ('${OWNER_USER_ID}', 'owner@everytimecreamery.com'),
        ('${STAFF_STORE1_ID}', 'staff1@everytimecreamery.com'),
        ('${STAFF_STORE2_ID}', 'staff2@everytimecreamery.com'),
        ('${UNPRIVILEGED_USER_ID}', 'staff3@everytimecreamery.com')
      ON CONFLICT (id) DO NOTHING;

      -- Elevate first owner using official administrative bootstrap function
      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');

      -- Assign staff2 to Store 2
      UPDATE public.profiles
      SET store_id = '${STORE_2_ID}'
      WHERE id = '${STAFF_STORE2_ID}';
    `);
  });

  // ===========================================================================
  // PART 1: MASTER CATALOG PROTECTION & BASIC RLS
  // ===========================================================================

  it('1. Anonymous catalog modification is rejected', async () => {
    await asAnon();

    await expect(
      db.query<any>(`INSERT INTO public.categories (id, label, icon_name) VALUES ('anon_cat', 'Anon Category', 'AlertCircle');`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    const updateRes = await db.query<any>(`UPDATE public.categories SET label = 'Hacked Label' WHERE id = 'gelato';`);
    expect(updateRes.affectedRows).toBe(0);

    const deleteRes = await db.query<any>(`DELETE FROM public.categories WHERE id = 'gelato';`);
    expect(deleteRes.affectedRows).toBe(0);

    await expect(
      db.query<any>(`INSERT INTO public.menu_items (id, category_id, name, base_price_paise) VALUES ('item_hack', 'gelato', 'Hacked', 100);`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    await asStaffStore1();
    const checkRes = await db.query<any>(`SELECT label FROM public.categories WHERE id = 'gelato';`);
    expect(checkRes.rows[0].label).toBe('Gelato');
  });

  it('2. Staff catalog modification is rejected', async () => {
    await asStaffStore1();

    await expect(
      db.query<any>(`INSERT INTO public.categories (id, label, icon_name) VALUES ('staff_cat', 'Staff Category', 'AlertCircle');`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    const updateRes = await db.query<any>(`UPDATE public.categories SET label = 'Staff Renamed' WHERE id = 'gelato';`);
    expect(updateRes.affectedRows).toBe(0);

    const deleteRes = await db.query<any>(`DELETE FROM public.categories WHERE id = 'gelato';`);
    expect(deleteRes.affectedRows).toBe(0);

    await expect(
      db.query<any>(`INSERT INTO public.menu_items (id, category_id, name, base_price_paise) VALUES ('staff_item', 'gelato', 'Staff Item', 100);`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    const checkRes = await db.query<any>(`SELECT label FROM public.categories WHERE id = 'gelato';`);
    expect(checkRes.rows[0].label).toBe('Gelato');
  });

  it('3. Owner catalog modification succeeds', async () => {
    await asOwner();

    const insertRes = await db.query<any>(`
      INSERT INTO public.categories (id, label, icon_name, sort_order)
      VALUES ('seasonal_treats', 'Seasonal Treats', 'Sparkles', 99)
      RETURNING id, label;
    `);
    expect(insertRes.rows.length).toBe(1);
    expect(insertRes.rows[0].id).toBe('seasonal_treats');

    const updateRes = await db.query<any>(`
      UPDATE public.categories
      SET label = 'Seasonal Gelato Specials'
      WHERE id = 'seasonal_treats'
      RETURNING id, label;
    `);
    expect(updateRes.rows.length).toBe(1);
    expect(updateRes.rows[0].label).toBe('Seasonal Gelato Specials');

    const deleteRes = await db.query<any>(`
      DELETE FROM public.categories WHERE id = 'seasonal_treats' RETURNING id;
    `);
    expect(deleteRes.rows.length).toBe(1);
  });

  // ===========================================================================
  // PART 2: ORDERS & STORE ISOLATION
  // ===========================================================================

  it('4. Staff cross-store order insertion is rejected', async () => {
    await asStaffStore1();

    const crossStoreOrderId = '00000000-0000-0000-0000-000000000101';
    await expect(
      db.query<any>(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${crossStoreOrderId}', '${STORE_2_ID}', '${TERMINAL_2_ID}', '${STAFF_STORE1_ID}',
          'T1', 1, 'COMPLETED', 10000, 10000, now(), CURRENT_DATE
        );
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);
  });

  it('5. Staff same-store order insertion succeeds', async () => {
    await asStaffStore1();

    const sameStoreOrderId = '00000000-0000-0000-0000-000000000102';
    const orderRes = await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${sameStoreOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 10, 'COMPLETED', 20000, 20000, now(), CURRENT_DATE
      ) RETURNING id, status;
    `);
    expect(orderRes.rows.length).toBe(1);
    expect(orderRes.rows[0].id).toBe(sameStoreOrderId);

    // Terminal-scoped order with NULL cashier_id
    const terminalScopedOrderId = '00000000-0000-0000-0000-000000000103';
    const termOrderRes = await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${terminalScopedOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', NULL,
        'T1', 11, 'COMPLETED', 15000, 15000, now(), CURRENT_DATE
      ) RETURNING id, cashier_id;
    `);
    expect(termOrderRes.rows.length).toBe(1);
    expect(termOrderRes.rows[0].cashier_id).toBeNull();
  });

  it("6. Staff cannot attach order items or payments to another store's orders", async () => {
    await asStaffStore2();
    const store2OrderId = '00000000-0000-0000-0000-000000000201';
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${store2OrderId}', '${STORE_2_ID}', '${TERMINAL_2_ID}', '${STAFF_STORE2_ID}',
        'T2', 1, 'COMPLETED', 50000, 50000, now(), CURRENT_DATE
      );
    `);

    // Staff 1 (Store 1) attempts to attach order_items to Store 2 order
    await asStaffStore1();
    await expect(
      db.query<any>(`
        INSERT INTO public.order_items (
          id, order_id, product_name, quantity, unit_price_paise, total_price_paise
        ) VALUES (
          '${crypto.randomUUID()}', '${store2OrderId}', 'Rogue Sundae', 1, 50000, 50000
        );
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    // Staff 1 attempts to attach payment to Store 2 order
    await expect(
      db.query<any>(`
        INSERT INTO public.payments (
          id, order_id, method, amount_paise
        ) VALUES (
          '${crypto.randomUUID()}', '${store2OrderId}', 'cash', 50000
        );
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied|Payment rejected/i);
  });

  it('7. Invalid terminal IDs are rejected', async () => {
    await asStaffStore1();

    await expect(
      db.query<any>(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${crypto.randomUUID()}', '${STORE_1_ID}', '${FAKE_TERMINAL_ID}', '${STAFF_STORE1_ID}',
          'T1', 20, 'COMPLETED', 10000, 10000, now(), CURRENT_DATE
        );
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    // Terminal 2 belongs to Store 2
    await expect(
      db.query<any>(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${crypto.randomUUID()}', '${STORE_1_ID}', '${TERMINAL_2_ID}', '${STAFF_STORE1_ID}',
          'T1', 21, 'COMPLETED', 10000, 10000, now(), CURRENT_DATE
        );
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);
  });

  it('8. Owner operations continue to work across all stores', async () => {
    await asOwner();

    const allOrders = await db.query<any>(`SELECT id, store_id FROM public.orders;`);
    expect(allOrders.rows.length).toBeGreaterThanOrEqual(3);

    const updateRes = await db.query<any>(`
      UPDATE public.orders
      SET discount_reason = 'Owner Courtesy Discount'
      WHERE id = '00000000-0000-0000-0000-000000000102'
      RETURNING id, discount_reason;
    `);
    expect(updateRes.rows.length).toBe(1);
    expect(updateRes.rows[0].discount_reason).toBe('Owner Courtesy Discount');

    await asStaffStore1();
    const staff1Orders = await db.query<any>(`SELECT id, store_id FROM public.orders;`);
    const hasStore2Order = staff1Orders.rows.some((o: any) => o.store_id === STORE_2_ID);
    expect(hasStore2Order).toBe(false);
  });

  // ===========================================================================
  // PART 3: PAYMENT CONCURRENCY & FINANCIAL INTEGRITY
  // ===========================================================================

  it('9. get_order_paid_paise enforces strict store isolation against arbitrary RPC calls', async () => {
    const store1OrderId = '00000000-0000-0000-0000-000000000102';
    const store2OrderId = '00000000-0000-0000-0000-000000000201';

    // Staff 1 calling get_order_paid_paise for own store order succeeds
    await asStaffStore1();
    const staff1Res = await db.query<any>(`SELECT public.get_order_paid_paise('${store1OrderId}') AS paid;`);
    expect(Number(staff1Res.rows[0].paid)).toBeGreaterThanOrEqual(0);

    // Staff 1 calling get_order_paid_paise for Store 2 order is strictly REJECTED
    await expect(
      db.query<any>(`SELECT public.get_order_paid_paise('${store2OrderId}') AS paid;`)
    ).rejects.toThrow(/Access denied: cannot query payments for an order outside your assigned store/i);

    // Owner calling get_order_paid_paise for Store 2 order succeeds
    await asOwner();
    const ownerRes = await db.query<any>(`SELECT public.get_order_paid_paise('${store2OrderId}') AS paid;`);
    expect(Number(ownerRes.rows[0].paid)).toBe(0);

    // Anonymous calling get_order_paid_paise is REJECTED (permission revoked)
    await asAnon();
    await expect(
      db.query<any>(`SELECT public.get_order_paid_paise('${store1OrderId}') AS paid;`)
    ).rejects.toThrow(/permission denied/i);
  });

  it('10. Payment integrity trigger rejects single payment exceeding order total', async () => {
    await asStaffStore1();
    const testOrderId = '00000000-0000-0000-0000-000000000301';

    // Create a 10000 paise order (₹100)
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${testOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 30, 'COMPLETED', 10000, 10000, now(), CURRENT_DATE
      );
    `);

    // Attempt to insert payment of 15000 paise (> 10000 total)
    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', 15000);
      `)
    ).rejects.toThrow(/Payment rejected: Payment of 15000 paise exceeds remaining order balance/i);
  });

  it('11. Payment integrity trigger rejects zero or negative amounts', async () => {
    await asStaffStore1();
    const testOrderId = '00000000-0000-0000-0000-000000000301';

    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', 0);
      `)
    ).rejects.toThrow(/Payment rejected: Payment amount must be greater than zero|check constraint/i);

    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', -500);
      `)
    ).rejects.toThrow(/Payment rejected: Payment amount must be greater than zero|check constraint/i);
  });

  it('12. Valid split payments succeed up to total, and excess is rejected', async () => {
    await asStaffStore1();
    const testOrderId = '00000000-0000-0000-0000-000000000301'; // total 10000 paise

    // Split Payment 1: 6000 paise (cash)
    const pay1 = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', 6000)
      RETURNING id, amount_paise;
    `);
    expect(pay1.rows.length).toBe(1);

    // Split Payment 2: 4000 paise (upi)
    const pay2 = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'upi', 4000)
      RETURNING id, amount_paise;
    `);
    expect(pay2.rows.length).toBe(1);

    // Attempt Payment 3: 1 paisa (order is fully paid)
    await expect(
      db.query<any>(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'card', 1);
      `)
    ).rejects.toThrow(/Payment rejected: Payment of 1 paise exceeds remaining order balance|violates row-level security policy/i);

    // Verify total paid equals exactly 10000
    const totalPaidRes = await db.query<any>(`SELECT public.get_order_paid_paise('${testOrderId}') AS paid;`);
    expect(Number(totalPaidRes.rows[0].paid)).toBe(10000);
  });

  it('13. Concurrent payment attempts serialize on order row lock, preventing double-charging', async () => {
    await asStaffStore1();
    const testOrderId = '00000000-0000-0000-0000-000000000302';

    // Create a new order with total 10000 paise
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${testOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 32, 'COMPLETED', 10000, 10000, now(), CURRENT_DATE
      );
    `);

    // Two simultaneous payment transactions each attempting to pay the full 10000 paise
    const p1 = db.transaction(async (tx) => {
      return await tx.query(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', 10000)
        RETURNING id;
      `);
    });

    const p2 = db.transaction(async (tx) => {
      return await tx.query(`
        INSERT INTO public.payments (id, order_id, method, amount_paise)
        VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'upi', 10000)
        RETURNING id;
      `);
    });

    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one payment succeeds; the concurrent one is serialized by row lock and rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason?.message;
    expect(rejectionReason).toMatch(/exceeds remaining order balance|violates row-level security policy/i);

    // Final total paid in database is strictly 10000 paise
    const paidCheck = await db.query<any>(`SELECT public.get_order_paid_paise('${testOrderId}') AS paid;`);
    expect(Number(paidCheck.rows[0].paid)).toBe(10000);
  });

  it('14. Payment immutability: Updates changing order_id are strictly rejected', async () => {
    await asOwner();
    const testOrderId = '00000000-0000-0000-0000-000000000302';
    const store2OrderId = '00000000-0000-0000-0000-000000000201';

    // Retrieve the payment id recorded in test 13
    const payRes = await db.query<any>(`SELECT id FROM public.payments WHERE order_id = '${testOrderId}' LIMIT 1;`);
    const paymentId = payRes.rows[0].id;

    // Attempting to re-parent the payment to a different order is REJECTED
    await expect(
      db.query<any>(`UPDATE public.payments SET order_id = '${store2OrderId}' WHERE id = '${paymentId}';`)
    ).rejects.toThrow(/Payment rejected: Cannot reassign payment to a different order/i);
  });

  it('15. Staff cannot modify or delete payments (mutation restricted to owner)', async () => {
    const testOrderId = '00000000-0000-0000-0000-000000000302';
    const payRes = await db.query<any>(`SELECT id FROM public.payments WHERE order_id = '${testOrderId}' LIMIT 1;`);
    const paymentId = payRes.rows[0].id;

    await asStaffStore1();

    // Staff UPDATE payment rejected by RLS (0 rows affected) or trigger exception
    const updRes = await db.query<any>(`UPDATE public.payments SET method = 'card' WHERE id = '${paymentId}';`);
    expect(updRes.affectedRows).toBe(0);

    // Staff DELETE payment rejected by RLS (0 rows affected) or trigger exception
    const delRes = await db.query<any>(`DELETE FROM public.payments WHERE id = '${paymentId}';`);
    expect(delRes.affectedRows).toBe(0);
  });

  it('16. Owner can update payment tender method within order balance', async () => {
    await asOwner();
    const testOrderId = '00000000-0000-0000-0000-000000000302';
    const payRes = await db.query<any>(`SELECT id FROM public.payments WHERE order_id = '${testOrderId}' LIMIT 1;`);
    const paymentId = payRes.rows[0].id;

    // Owner changes tender method from cash/upi to card
    const updateRes = await db.query<any>(`
      UPDATE public.payments
      SET method = 'card'
      WHERE id = '${paymentId}'
      RETURNING id, method;
    `);
    expect(updateRes.rows.length).toBe(1);
    expect(updateRes.rows[0].method).toBe('card');
  });

  it('17. Owner payment update exceeding order total balance is rejected', async () => {
    await asOwner();
    const testOrderId = '00000000-0000-0000-0000-000000000302'; // order total is 10000
    const payRes = await db.query<any>(`SELECT id FROM public.payments WHERE order_id = '${testOrderId}' LIMIT 1;`);
    const paymentId = payRes.rows[0].id;

    // Owner attempts to increase payment from 10000 to 25000 paise (> order total)
    await expect(
      db.query<any>(`UPDATE public.payments SET amount_paise = 25000 WHERE id = '${paymentId}';`)
    ).rejects.toThrow(/Payment rejected: Payment of 25000 paise exceeds remaining order balance/i);
  });

  it('18. Owner can delete payment tender, restoring order balance', async () => {
    await asOwner();
    const testOrderId = '00000000-0000-0000-0000-000000000302';
    const payRes = await db.query<any>(`SELECT id FROM public.payments WHERE order_id = '${testOrderId}' LIMIT 1;`);
    const paymentId = payRes.rows[0].id;

    // Owner deletes payment tender
    const delRes = await db.query<any>(`DELETE FROM public.payments WHERE id = '${paymentId}' RETURNING id;`);
    expect(delRes.rows.length).toBe(1);

    // Verify order balance is restored (0 paid)
    const paidCheck = await db.query<any>(`SELECT public.get_order_paid_paise('${testOrderId}') AS paid;`);
    expect(Number(paidCheck.rows[0].paid)).toBe(0);
  });

  it('19. Concurrent payment updates serialize on parent order row lock', async () => {
    await asOwner();
    const testOrderId = '00000000-0000-0000-0000-000000000303';

    // Create an order with total 20000 paise (₹200) and two initial split payments of 5000 each
    await db.query<any>(`
      INSERT INTO public.orders (
        id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
        subtotal_paise, total_paise, client_completed_at, business_date
      ) VALUES (
        '${testOrderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_STORE1_ID}',
        'T1', 35, 'COMPLETED', 20000, 20000, now(), CURRENT_DATE
      );
    `);

    const p1Res = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'cash', 5000)
      RETURNING id;
    `);
    const p1Id = p1Res.rows[0].id;

    const p2Res = await db.query<any>(`
      INSERT INTO public.payments (id, order_id, method, amount_paise)
      VALUES ('${crypto.randomUUID()}', '${testOrderId}', 'upi', 5000)
      RETURNING id;
    `);
    const p2Id = p2Res.rows[0].id;

    // Two simultaneous updates:
    // tx1 attempts to update p1 from 5000 to 15000 (total would be 15000 + 5000 = 20000) -> fits total
    // tx2 attempts to update p2 from 5000 to 15000 (total would be 5000 + 15000 = 20000) -> would fit if alone, but together = 30000 > 20000
    const tx1 = db.transaction(async (tx) => {
      return await tx.query(`UPDATE public.payments SET amount_paise = 15000 WHERE id = '${p1Id}' RETURNING id;`);
    });

    const tx2 = db.transaction(async (tx) => {
      return await tx.query(`UPDATE public.payments SET amount_paise = 15000 WHERE id = '${p2Id}' RETURNING id;`);
    });

    const results = await Promise.allSettled([tx1, tx2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one update succeeds; the concurrent one is serialized by row lock and rejected
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason?.message;
    expect(rejectionReason).toMatch(/exceeds remaining order balance/i);

    // Final total paid is strictly <= 20000
    const totalRes = await db.query<any>(`SELECT public.get_order_paid_paise('${testOrderId}') AS paid;`);
    expect(Number(totalRes.rows[0].paid)).toBe(20000);
  });

  // ===========================================================================
  // PART 4: PROFILE MUTATION & ROLE ESCALATION DEFENSE
  // ===========================================================================

  it('20. Staff attempting to change their own role to owner is REJECTED', async () => {
    await asStaffStore1();

    await expect(
      db.query<any>(`UPDATE public.profiles SET role = 'owner' WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/Unauthorized: only owners can modify user roles/i);
  });

  it("21. Staff attempting to change another user's role is REJECTED", async () => {
    await asStaffStore1();

    // RLS policy profiles_update_self restricts row to auth.uid(), resulting in 0 rows updated
    const updateRes = await db.query<any>(`UPDATE public.profiles SET role = 'owner' WHERE id = '${STAFF_STORE2_ID}';`);
    expect(updateRes.affectedRows).toBe(0);

    // Verify target profile role remains unchanged
    await asOwner();
    const checkRole = await db.query<any>(`SELECT role FROM public.profiles WHERE id = '${STAFF_STORE2_ID}';`);
    expect(checkRole.rows[0].role).toBe('staff');
  });

  it("22. Staff attempting to modify another user's profile is REJECTED", async () => {
    await asStaffStore1();

    // RLS policy profiles_update_self restricts row to auth.uid(), resulting in 0 rows updated
    const updateRes = await db.query<any>(`UPDATE public.profiles SET full_name = 'Compromised Name' WHERE id = '${STAFF_STORE2_ID}';`);
    expect(updateRes.affectedRows).toBe(0);

    // Direct check: Staff updating own profile name succeeds
    const selfRes = await db.query<any>(`UPDATE public.profiles SET full_name = 'Updated Cashier Name' WHERE id = '${STAFF_STORE1_ID}' RETURNING full_name;`);
    expect(selfRes.rows.length).toBe(1);
    expect(selfRes.rows[0].full_name).toBe('Updated Cashier Name');
  });

  it("23. Staff attempting to create another user's profile is REJECTED", async () => {
    await asStaffStore1();

    const rogueUserId = crypto.randomUUID();
    await expect(
      db.query<any>(`
        INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
        VALUES ('${rogueUserId}', '${STORE_1_ID}', 'staff', 'Rogue Counter Staff', 'C99');
      `)
    ).rejects.toThrow(/Unauthorized: cannot create a profile for another user|violates row-level security policy/i);
  });

  it('24. Staff attempting to insert an owner profile is REJECTED', async () => {
    await asStaffStore1();

    await expect(
      db.query<any>(`
        INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
        VALUES ('${UNPRIVILEGED_USER_ID}', '${STORE_1_ID}', 'owner', 'Escalated Admin', 'OWNER');
      `)
    ).rejects.toThrow(/Unauthorized: cannot create an owner profile|cannot create a profile for another user|violates row-level security policy/i);
  });

  it('25. Owner can promote staff to owner and demote back to staff', async () => {
    await asOwner();

    // Owner promotes staff2 to owner
    const promoteRes = await db.query<any>(`
      UPDATE public.profiles
      SET role = 'owner'
      WHERE id = '${STAFF_STORE2_ID}'
      RETURNING id, role;
    `);
    expect(promoteRes.rows.length).toBe(1);
    expect(promoteRes.rows[0].role).toBe('owner');

    // Owner demotes staff2 back to staff
    const demoteRes = await db.query<any>(`
      UPDATE public.profiles
      SET role = 'staff'
      WHERE id = '${STAFF_STORE2_ID}'
      RETURNING id, role;
    `);
    expect(demoteRes.rows.length).toBe(1);
    expect(demoteRes.rows[0].role).toBe('staff');
  });

  it('26. Bootstrap fails when an active owner already exists', async () => {
    await asAdmin();

    await expect(
      db.query<any>(`SELECT public.bootstrap_initial_owner('staff1@everytimecreamery.com');`)
    ).rejects.toThrow(/Bootstrap denied: System already has an active owner/i);
  });

  it('27. Bootstrap fails for nonexistent email', async () => {
    const cleanDb = new PGlite();
    await cleanDb.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT UNIQUE, raw_user_meta_data JSONB DEFAULT '{}'::jsonb);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT null::uuid; $$ LANGUAGE sql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ SELECT 'service_role'::text; $$ LANGUAGE sql STABLE;
    `);

    const m0 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000000_init_billing_schema.sql'), 'utf-8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000002_menu_management_columns.sql'), 'utf-8');
    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');
    await cleanDb.exec(cleanSql(m0));
    await cleanDb.exec(cleanSql(m2));
    await cleanDb.exec(cleanSql(m3));

    // Clear profiles table so no owner exists
    await cleanDb.exec(`DELETE FROM public.profiles;`);

    await expect(
      cleanDb.query(`SELECT public.bootstrap_initial_owner('nonexistent@everytimecreamery.com');`)
    ).rejects.toThrow(/Bootstrap failed: User with email "nonexistent@everytimecreamery.com" does not exist in auth.users/i);

    await cleanDb.close();
  });

  it('28. Two concurrent bootstrap attempts serialize on advisory lock', async () => {
    const cleanDb = new PGlite();
    await cleanDb.exec(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN;
        END IF;
      END $$;

      CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id UUID PRIMARY KEY, email TEXT UNIQUE, raw_user_meta_data JSONB DEFAULT '{}'::jsonb);
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT null::uuid; $$ LANGUAGE sql STABLE;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text AS $$ SELECT 'service_role'::text; $$ LANGUAGE sql STABLE;
    `);

    const m0 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000000_init_billing_schema.sql'), 'utf-8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000002_menu_management_columns.sql'), 'utf-8');
    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');
    await cleanDb.exec(cleanSql(m0));
    await cleanDb.exec(cleanSql(m2));
    await cleanDb.exec(cleanSql(m3));

    // Clear profiles
    await cleanDb.exec(`DELETE FROM public.profiles;`);

    // Insert two valid users in auth.users (triggers handle_new_user which populates profiles as staff)
    const user1Id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const user2Id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await cleanDb.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${user1Id}', 'candidate1@everytimecreamery.com'),
        ('${user2Id}', 'candidate2@everytimecreamery.com');
    `);

    // Run two simultaneous bootstrap calls
    const b1 = cleanDb.transaction(async (tx) => {
      return await tx.query(`SELECT public.bootstrap_initial_owner('candidate1@everytimecreamery.com') AS res;`);
    });
    const b2 = cleanDb.transaction(async (tx) => {
      return await tx.query(`SELECT public.bootstrap_initial_owner('candidate2@everytimecreamery.com') AS res;`);
    });

    const results = await Promise.allSettled([b1, b2]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactly one bootstrap call succeeds; the other is rejected because an owner now exists
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    expect((rejected[0] as PromiseRejectedResult).reason?.message).toMatch(/Bootstrap denied: System already has an active owner/i);

    // Verify there is strictly 1 owner in profiles
    const ownerCountRes = await cleanDb.query<any>(`SELECT COUNT(*) AS c FROM public.profiles WHERE role = 'owner';`);
    expect(Number(ownerCountRes.rows[0].c)).toBe(1);

    await cleanDb.close();
  });

  it('29. Trusted administrative operations (service_role and postgres internal) succeed', async () => {
    // 29a. service_role key can update profile roles and attributes
    await asServiceRole();
    const serviceRoleRes = await db.query<any>(`
      UPDATE public.profiles
      SET cashier_code = 'SR-EDIT'
      WHERE id = '${STAFF_STORE1_ID}'
      RETURNING id, cashier_code;
    `);
    expect(serviceRoleRes.rows.length).toBe(1);
    expect(serviceRoleRes.rows[0].cashier_code).toBe('SR-EDIT');

    // 29b. postgres internal superuser can manage any profile
    await asAdmin();
    const adminRes = await db.query<any>(`
      UPDATE public.profiles
      SET cashier_code = 'C01'
      WHERE id = '${STAFF_STORE1_ID}'
      RETURNING id, cashier_code;
    `);
    expect(adminRes.rows.length).toBe(1);
    expect(adminRes.rows[0].cashier_code).toBe('C01');
  });

  it('30. auth.role() IS NULL bypass is eliminated: unauthenticated / stripped JWT sessions cannot bypass profile guards', async () => {
    // Test context: client connected as authenticated, but request.jwt.claim.role is empty / NULL
    await asStaffNullRole();

    // Authenticated user with stripped claim attempting to elevate role
    await expect(
      db.query<any>(`UPDATE public.profiles SET role = 'owner' WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/Unauthorized: only owners can modify user roles/i);

    // Anonymous session with stripped claim attempting to insert an owner profile
    await asAnonNullRole();
    await expect(
      db.query<any>(`
        INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code)
        VALUES ('${crypto.randomUUID()}', '${STORE_1_ID}', 'owner', 'Rogue Anon Owner', 'OWNER');
      `)
    ).rejects.toThrow(/Unauthorized: cannot create an owner profile|violates row-level security policy|permission denied/i);
  });

  // ===========================================================================
  // PART 5: FULL MIGRATION & ROLLBACK LIFECYCLE
  // ===========================================================================

  it('31. Migration 20261122000003 is idempotent and repeatable', async () => {
    await asAdmin();

    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');

    // Executing migration 03 a second time must execute cleanly without error
    await expect(db.exec(cleanSql(m3))).resolves.not.toThrow();

    // Verify all functions, policies, and triggers are still intact
    const checkRoleFn = await db.query<any>(`SELECT proname FROM pg_proc WHERE proname = 'get_order_paid_paise';`);
    expect(checkRoleFn.rows.length).toBe(1);

    const checkTrigger = await db.query<any>(`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_payment_integrity';`);
    expect(checkTrigger.rows.length).toBe(1);
  });

  it('32. Rollback completeness: removes newly introduced policies/triggers, never restores insecure public catalog write, and preserves safe default-staff signup', async () => {
    await asAdmin();

    const rollbackSql = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/20261122000003_rbac_security_policies_rollback.sql'),
      'utf-8'
    );

    // Execute secure rollback script
    await expect(db.exec(cleanSql(rollbackSql))).resolves.not.toThrow();

    // Verify payment integrity trigger and function are dropped
    const checkTrigger = await db.query<any>(`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_payment_integrity';`);
    expect(checkTrigger.rows.length).toBe(0);

    const checkPayFn = await db.query<any>(`SELECT proname FROM pg_proc WHERE proname = 'check_payment_integrity';`);
    expect(checkPayFn.rows.length).toBe(0);

    const checkPaidFn = await db.query<any>(`SELECT proname FROM pg_proc WHERE proname = 'get_order_paid_paise';`);
    expect(checkPaidFn.rows.length).toBe(0);

    // Verify profile escalation triggers are dropped
    const checkEscTrg = await db.query<any>(`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_prevent_role_escalation';`);
    expect(checkEscTrg.rows.length).toBe(0);

    // Verify newly added owner update/delete policies on orders/payments are removed
    const checkOrdOwnerUpd = await db.query<any>(`SELECT policyname FROM pg_policies WHERE policyname = 'orders_owner_update';`);
    expect(checkOrdOwnerUpd.rows.length).toBe(0);

    const checkPayOwnerUpd = await db.query<any>(`SELECT policyname FROM pg_policies WHERE policyname = 'payments_owner_update';`);
    expect(checkPayOwnerUpd.rows.length).toBe(0);

    // CRITICAL SECURITY INVARIANT 1: Insecure public catalog-write policies MUST NOT exist
    const insecureCatPolicies = await db.query<any>(`
      SELECT policyname FROM pg_policies
      WHERE policyname IN ('categories_write_all', 'menu_items_write_all', 'menu_variants_write_all');
    `);
    expect(insecureCatPolicies.rows.length).toBe(0);

    // Verify catalog write remains restricted to authenticated owners only
    await asStaffStore1();
    await expect(
      db.query<any>(`INSERT INTO public.categories (id, label, icon_name) VALUES ('rollback_staff_cat', 'Staff Test', 'Alert');`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    // CRITICAL SECURITY INVARIANT 2: handle_new_user() in rollback strictly defaults to 'staff'
    // Testing signup of a new user under rollback state
    await asAdmin();
    const rollbackTestUserId = crypto.randomUUID();
    await db.query<any>(`
      INSERT INTO auth.users (id, email)
      VALUES ('${rollbackTestUserId}', 'new_rollback_user@everytimecreamery.com');
    `);
    const newProfileRes = await db.query<any>(`SELECT role FROM public.profiles WHERE id = '${rollbackTestUserId}';`);
    expect(newProfileRes.rows[0].role).toBe('staff'); // NEVER 'owner'

    // CRITICAL SECURITY INVARIANT 3: Helper functions preserve explicit search_path
    const fnSearchPaths = await db.query<any>(`
      SELECT proname, prosecdef, proconfig
      FROM pg_proc
      WHERE proname IN ('get_user_role', 'get_user_store_id');
    `);
    expect(fnSearchPaths.rows.length).toBe(2);
    fnSearchPaths.rows.forEach((row: any) => {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig.some((c: string) => c.startsWith('search_path='))).toBe(true);
    });
  });

  it('33. Migration 03 can be re-applied cleanly following a rollback', async () => {
    await asAdmin();

    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');

    // Re-apply migration 03
    await expect(db.exec(cleanSql(m3))).resolves.not.toThrow();

    // Verify triggers and hardened policies are restored
    const checkTrigger = await db.query<any>(`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_enforce_payment_integrity';`);
    expect(checkTrigger.rows.length).toBe(1);

    const checkRoleTrg = await db.query<any>(`SELECT tgname FROM pg_trigger WHERE tgname = 'trg_prevent_role_escalation';`);
    expect(checkRoleTrg.rows.length).toBe(1);

    // Verify staff cannot modify catalog
    await asStaffStore1();
    await expect(
      db.query<any>(`INSERT INTO public.categories (id, label, icon_name) VALUES ('reapply_cat', 'Reapply', 'Alert');`)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);
  });

  it('34. Staff cannot reassign their own store_id to bypass store isolation', async () => {
    await asStaffStore1();

    await expect(
      db.query<any>(`UPDATE public.profiles SET store_id = '${STORE_2_ID}' WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/Unauthorized: only owners can modify store assignments/i);

    await asAdmin();
    const res = await db.query<any>(`SELECT store_id FROM public.profiles WHERE id = '${STAFF_STORE1_ID}';`);
    expect(res.rows[0].store_id).toBe(STORE_1_ID);
  });
});
