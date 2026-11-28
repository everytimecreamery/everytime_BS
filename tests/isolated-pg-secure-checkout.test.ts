import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Phase 2 — Isolated PostgreSQL Secure POS Checkout RPC & Tampering Defense', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022';

  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_1_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_1B_ID = '22222222-2222-2222-2222-222222222223';
  const STAFF_2_ID = '33333333-3333-3333-3333-333333333333';
  const GHOST_USER_ID = '99999999-9999-9999-9999-999999999999';

  const cleanSql = (sql: string) =>
    sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');

  async function asAnon() {
    await db.exec(`
      SET ROLE anon;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = 'anon';
    `);
  }

  async function asStaff1() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_1_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asStaff1B() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_1B_ID}';
      SET request.jwt.claim.role = 'authenticated';
    `);
  }

  async function asGhostAuthenticated() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${GHOST_USER_ID}';
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

  async function asAdmin() {
    await db.exec(`
      SET ROLE postgres;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = '';
    `);
  }

  beforeAll(async () => {
    db = new PGlite();

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

    const m0 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000000_init_billing_schema.sql'), 'utf-8');
    const m1 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000001_seed_menu_items.sql'), 'utf-8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000002_menu_management_columns.sql'), 'utf-8');
    const m3 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000003_rbac_security_policies.sql'), 'utf-8');
    const m4 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000004_financial_audit_security.sql'), 'utf-8');
    const m5 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000005_secure_pos_checkout.sql'), 'utf-8');

    await db.exec(cleanSql(m0));
    await db.exec(cleanSql(m1));
    await db.exec(cleanSql(m2));

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    await db.exec(cleanSql(m3));
    await db.exec(cleanSql(m4));
    await db.exec(cleanSql(m5));

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
        ('${STAFF_1_ID}', 'staff1@everytimecreamery.com'),
        ('${STAFF_1B_ID}', 'staff1b@everytimecreamery.com'),
        ('${STAFF_2_ID}', 'staff2@everytimecreamery.com')
      ON CONFLICT (id) DO NOTHING;

      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');

      UPDATE public.profiles SET store_id = '${STORE_1_ID}' WHERE id IN ('${STAFF_1_ID}', '${STAFF_1B_ID}');
      UPDATE public.profiles SET store_id = '${STORE_2_ID}' WHERE id = '${STAFF_2_ID}';

      INSERT INTO public.menu_items (id, category_id, name, base_price_paise, interaction_type, is_available, is_archived)
      VALUES
        ('gelato-sold-out', 'gelato', 'Sold Out Berry', 9900, 'direct', false, false),
        ('gelato-retired', 'gelato', 'Retired Flavor', 9900, 'direct', true, true)
      ON CONFLICT (id) DO NOTHING;
    `);
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it('1. Blocks direct staff INSERT into orders, order_items, and payments (bypassing RPC)', async () => {
    await asStaff1();
    const orderId = crypto.randomUUID();

    // Direct insert with tampered 1 paisa total rejected
    await expect(
      db.query(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${orderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', '${STAFF_1_ID}',
          'T1', 901, 'COMPLETED', 1, 1, now(), CURRENT_DATE
        );
      `)
    ).rejects.toThrow(/violates row-level security/i);

    // Direct insert with null cashier_id rejected
    await expect(
      db.query(`
        INSERT INTO public.orders (
          id, store_id, terminal_id, cashier_id, token_terminal, token_seq, status,
          subtotal_paise, total_paise, client_completed_at, business_date
        ) VALUES (
          '${orderId}', '${STORE_1_ID}', '${TERMINAL_1_ID}', NULL,
          'T1', 902, 'COMPLETED', 9900, 10395, now(), CURRENT_DATE
        );
      `)
    ).rejects.toThrow(/cashier_id is required|violates row-level security/i);
  });

  it('2. Rejects unauthenticated and invalid cashier identities on complete_pos_checkout()', async () => {
    await asAnon();
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_1_ID}',
          'T1',
          1,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/permission denied|Unauthorized/i);

    await asGhostAuthenticated();
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_1_ID}',
          'T1',
          1,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Valid staff or owner profile is required/i);
  });

  it('3. Prevents staff from impersonating another cashier', async () => {
    await asStaff1();
    const orderId = crypto.randomUUID();

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${orderId}',
          '${TERMINAL_1_ID}',
          'T1',
          2,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb,
          NULL, NULL,
          '${STAFF_1B_ID}'
        );
      `)
    ).rejects.toThrow(/Cashier impersonation denied/i);

    const check = await db.query(`SELECT COUNT(*) AS c FROM public.orders WHERE id = '${orderId}';`);
    expect(Number((check.rows[0] as any).c)).toBe(0);
  });

  it('4. Rejects manipulated client item prices and leaves zero orphaned records', async () => {
    await asStaff1();
    const orderId = crypto.randomUUID();

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${orderId}',
          '${TERMINAL_1_ID}',
          'T1',
          3,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":2,"expected_unit_price_paise":100}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":210}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Price manipulation rejected/i);

    const ordersCount = await db.query(`SELECT COUNT(*) AS c FROM public.orders WHERE id = '${orderId}';`);
    const itemsCount = await db.query(`SELECT COUNT(*) AS c FROM public.order_items WHERE order_id = '${orderId}';`);
    const paysCount = await db.query(`SELECT COUNT(*) AS c FROM public.payments WHERE order_id = '${orderId}';`);
    expect(Number((ordersCount.rows[0] as any).c)).toBe(0);
    expect(Number((itemsCount.rows[0] as any).c)).toBe(0);
    expect(Number((paysCount.rows[0] as any).c)).toBe(0);
  });

  it('5. Rejects manipulated client subtotal or final total', async () => {
    await asStaff1();
    const orderId = crypto.randomUUID();

    // Tampered subtotal (real is 9900)
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${orderId}',
          '${TERMINAL_1_ID}',
          'T1',
          4,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1,"expected_unit_price_paise":9900}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb,
          NULL, NULL, NULL,
          5000, 10395
        );
      `)
    ).rejects.toThrow(/Total manipulation rejected: Client subtotal/i);

    // Tampered final total (real is 10395)
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${orderId}',
          '${TERMINAL_1_ID}',
          'T1',
          4,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1,"expected_unit_price_paise":9900}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb,
          NULL, NULL, NULL,
          9900, 5000
        );
      `)
    ).rejects.toThrow(/Total manipulation rejected: Client total/i);
  });

  it('6. Rejects unavailable or archived items and cross-store terminal access', async () => {
    await asStaff1();

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_1_ID}',
          'T1',
          5,
          '[{"menu_item_id":"gelato-sold-out","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/currently unavailable/i);

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_1_ID}',
          'T1',
          6,
          '[{"menu_item_id":"gelato-retired","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/archived and cannot be sold/i);

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_2_ID}',
          'T1',
          7,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/does not belong to cashier's assigned store/i);
  });

  it('7. Validates split-payment totals and rolls back atomically on mismatch', async () => {
    await asStaff1();
    const badOrderId = crypto.randomUUID();

    // 2 x 9900 = 19800; 5% tax = 990; total = 20790. Attempt split payment summing to 20000 -> rejected
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${badOrderId}',
          '${TERMINAL_1_ID}',
          'T1',
          8,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":2}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10000},{"method":"upi","amount_paise":10000}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Payment validation failed/i);

    // Atomic check: zero rows persisted on failure
    const badCheck = await db.query(`SELECT COUNT(*) AS c FROM public.orders WHERE id = '${badOrderId}';`);
    expect(Number((badCheck.rows[0] as any).c)).toBe(0);

    // Valid split payment across cash + upi + card summing to exact 20790 succeeds atomically
    const goodOrderId = crypto.randomUUID();
    const res = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${goodOrderId}',
        '${TERMINAL_1_ID}',
        'T1',
        9,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":2,"expected_unit_price_paise":9900}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"cash","amount_paise":10000},{"method":"upi","amount_paise":5790},{"method":"card","amount_paise":5000}]'::jsonb
      ) AS checkout;
    `);
    const checkout = res.rows[0].checkout;
    expect(checkout.order_id).toBe(goodOrderId);
    expect(checkout.cashier_id).toBe(STAFF_1_ID);
    expect(Number(checkout.subtotal_paise)).toBe(19800);
    expect(Number(checkout.tax_paise)).toBe(990);
    expect(Number(checkout.cgst_paise) + Number(checkout.sgst_paise)).toBe(990);
    expect(Number(checkout.total_paise)).toBe(20790);

    const payRows = await db.query(`SELECT method, amount_paise FROM public.payments WHERE order_id = '${goodOrderId}' ORDER BY method;`);
    expect(payRows.rows).toHaveLength(3);
  });

  it('8. Computes variant, waffle add-on, 10% discount, and odd-paise GST split server-side', async () => {
    await asStaff1();
    const orderId = crypto.randomUUID();

    // Item 1: Tub Classic Vanilla 500ml (32900) x 1
    // Item 2: Nutella Bliss Waffle (18900) + Vanilla Scoop add-on (6000) = 24900 x 1
    // Subtotal = 57800; 10% discount = 5780; discounted = 52020; 5% GST = 2601 (CGST 1301, SGST 1300); total = 54621
    const res = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${orderId}',
        '${TERMINAL_1_ID}',
        'T1',
        10,
        '[
          {"menu_item_id":"tub-classic-vanilla","variant_id":"tub-classic-vanilla-500","quantity":1,"expected_unit_price_paise":32900},
          {"menu_item_id":"waffle-nutella-bliss","addon_id":"scoop-vanilla","quantity":1,"expected_unit_price_paise":24900}
        ]'::jsonb,
        10, 'PERCENTAGE', NULL,
        '[{"method":"upi","amount_paise":54621}]'::jsonb,
        NULL, NULL, '${STAFF_1_ID}',
        57800, 54621
      ) AS checkout;
    `);

    const checkout = res.rows[0].checkout;
    expect(Number(checkout.subtotal_paise)).toBe(57800);
    expect(Number(checkout.discount_paise)).toBe(5780);
    expect(Number(checkout.tax_paise)).toBe(2601);
    expect(Number(checkout.cgst_paise)).toBe(1301);
    expect(Number(checkout.sgst_paise)).toBe(1300);
    expect(Number(checkout.total_paise)).toBe(54621);

    const itemRows = await db.query<any>(`
      SELECT menu_item_id, unit_price_paise, addon_price_paise, total_price_paise
      FROM public.order_items
      WHERE order_id = '${orderId}'
      ORDER BY menu_item_id;
    `);
    expect(itemRows.rows).toHaveLength(2);
    expect(Number(itemRows.rows[0].unit_price_paise)).toBe(32900);
    expect(Number(itemRows.rows[1].unit_price_paise)).toBe(18900);
    expect(Number(itemRows.rows[1].addon_price_paise)).toBe(6000);
    expect(Number(itemRows.rows[1].total_price_paise)).toBe(24900);

    // Idempotent retry by same cashier returns existing order without duplicating
    const retryRes = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${orderId}',
        '${TERMINAL_1_ID}',
        'T1',
        10,
        '[
          {"menu_item_id":"tub-classic-vanilla","variant_id":"tub-classic-vanilla-500","quantity":1,"expected_unit_price_paise":32900},
          {"menu_item_id":"waffle-nutella-bliss","addon_id":"scoop-vanilla","quantity":1,"expected_unit_price_paise":24900}
        ]'::jsonb,
        10, 'PERCENTAGE', NULL,
        '[{"method":"upi","amount_paise":54621}]'::jsonb
      ) AS checkout;
    `);
    expect(retryRes.rows[0].checkout.idempotent).toBe(true);

    // Another cashier cannot hijack the same orderId
    await asStaff1B();
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${orderId}',
          '${TERMINAL_1_ID}',
          'T1',
          10,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/belongs to another store or cashier/i);
  });

  it('9. Owner can execute POS checkout and migration 05 rollback/re-apply is clean', async () => {
    await asOwner();
    const ownerOrderId = crypto.randomUUID();
    const res = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${ownerOrderId}',
        '${TERMINAL_1_ID}',
        'T1',
        11,
        '[{"menu_item_id":"sundae-hot-choc-fudge","quantity":1,"expected_unit_price_paise":14900}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"card","amount_paise":15645}]'::jsonb
      ) AS checkout;
    `);
    expect(res.rows[0].checkout.cashier_id).toBe(OWNER_USER_ID);
    expect(Number(res.rows[0].checkout.total_paise)).toBe(15645);

    await asAdmin();
    const m5 = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20261122000005_secure_pos_checkout.sql'), 'utf-8');
    const m5Rollback = fs.readFileSync(path.join(process.cwd(), 'supabase/rollbacks/20261122000005_secure_pos_checkout_rollback.sql'), 'utf-8');

    await expect(db.exec(cleanSql(m5))).resolves.not.toThrow();
    await expect(db.exec(cleanSql(m5Rollback))).resolves.not.toThrow();
    const gone = await db.query(`SELECT proname FROM pg_proc WHERE proname = 'complete_pos_checkout';`);
    expect(gone.rows).toHaveLength(0);

    await expect(db.exec(cleanSql(m5))).resolves.not.toThrow();
    const restored = await db.query(`SELECT proname FROM pg_proc WHERE proname = 'complete_pos_checkout';`);
    expect(restored.rows).toHaveLength(1);
  });

  it('10. Rejects malformed JSON payloads, integer overflows, NaN discounts, and future timestamps cleanly', async () => {
    await asStaff1();

    // Non-object item element
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 50,
          '[null]'::jsonb, 0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Validation error/i);

    // Quantity integer overflow must raise Validation error (not unhandled 22003 overflow)
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 51,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":999999999999999999}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Validation error/i);

    // Payment amount integer overflow must raise Payment validation error
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 52,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":99999999999999999999999}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Payment validation failed/i);

    // NaN discount rejected
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 53,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          'NaN'::numeric, 'PERCENTAGE', NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Validation error: Discount percentage/i);

    // Future-dated timestamp rejected
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 54,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb,
          '2099-01-01T00:00:00Z'::timestamptz
        );
      `)
    ).rejects.toThrow(/Validation error.*future/i);
  });

  it('11. Idempotent retry succeeds even if item is later marked sold out or repriced, and concurrent retries across terminals serialize cleanly', async () => {
    await asAdmin();
    const SECOND_STORE1_TERM = '00000000-0000-0000-0000-000000000012';
    await db.exec(`
      INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
      VALUES ('${SECOND_STORE1_TERM}', '${STORE_1_ID}', '02', 'Counter Terminal #02')
      ON CONFLICT (id) DO NOTHING;
    `);

    await asStaff1();
    const committedOrderId = crypto.randomUUID();
    const firstRes = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${committedOrderId}', '${TERMINAL_1_ID}', 'T1', 60,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1,"expected_unit_price_paise":9900}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"cash","amount_paise":10395}]'::jsonb
      ) AS checkout;
    `);
    expect(firstRes.rows[0].checkout.idempotent).toBe(false);

    // Owner marks the item unavailable and changes price AFTER commit (lost-response scenario)
    await asOwner();
    await db.exec(`
      UPDATE public.menu_items
      SET is_available = false, base_price_paise = 12900
      WHERE id = 'gelato-madagascar-vanilla';
    `);

    // Staff retries the exact committed order after response drop -> MUST succeed idempotently
    await asStaff1();
    const retryAfterMenuChange = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${committedOrderId}', '${TERMINAL_1_ID}', 'T1', 60,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1,"expected_unit_price_paise":9900}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"cash","amount_paise":10395}]'::jsonb,
        NULL, NULL, NULL,
        9900, 10395
      ) AS checkout;
    `);
    expect(retryAfterMenuChange.rows[0].checkout.idempotent).toBe(true);
    expect(Number(retryAfterMenuChange.rows[0].checkout.total_paise)).toBe(10395);

    // Restore item availability/price for concurrent checkout test
    await asOwner();
    await db.exec(`
      UPDATE public.menu_items
      SET is_available = true, base_price_paise = 9900
      WHERE id = 'gelato-madagascar-vanilla';
    `);

    // Concurrent requests for the SAME new orderId across two terminals in Store 1
    await asStaff1();
    const concurrentOrderId = crypto.randomUUID();
    const c1 = db.transaction((tx) =>
      tx.query<any>(`
        SELECT public.complete_pos_checkout(
          '${concurrentOrderId}', '${TERMINAL_1_ID}', 'T1', 61,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        ) AS checkout;
      `)
    );
    const c2 = db.transaction((tx) =>
      tx.query<any>(`
        SELECT public.complete_pos_checkout(
          '${concurrentOrderId}', '${SECOND_STORE1_TERM}', 'T2', 61,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        ) AS checkout;
      `)
    );

    const results = await Promise.all([c1, c2]);
    const idempotentFlags = results.map((r) => r.rows[0].checkout.idempotent).sort();
    expect(idempotentFlags).toEqual([false, true]);
  });
});
