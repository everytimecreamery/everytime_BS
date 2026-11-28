import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Manual Billing Sessions & Checkout Enforcement — Isolated PostgreSQL (Migration 09)', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022';

  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_1_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_2_ID = '33333333-3333-3333-3333-333333333333';

  let staffMember1Id: string;
  let staffMember2Store1Id: string;
  let staffMemberStore2Id: string;
  let staffMemberInactiveId: string;

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

  async function asStaff2() {
    await db.exec(`
      SET ROLE authenticated;
      SET request.jwt.claim.sub = '${STAFF_2_ID}';
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
      GRANT ALL ON auth.users TO anon, authenticated, service_role;
    `);

    for (const mig of [
      '20261122000000_init_billing_schema.sql',
      '20261122000001_seed_menu_items.sql',
      '20261122000002_menu_management_columns.sql',
    ]) {
      const file = path.join(process.cwd(), 'supabase', 'migrations', mig);
      const sql = fs.readFileSync(file, 'utf8');
      await db.exec(cleanSql(sql));
    }

    await db.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    for (const mig of [
      '20261122000003_rbac_security_policies.sql',
      '20261122000004_financial_audit_security.sql',
      '20261122000005_secure_pos_checkout.sql',
      '20261122000006_final_security_hardening.sql',
      '20261122000007_staff_onboarding_and_discount_bounds.sql',
      '20261128000008_staff_members_employee_records.sql',
      '20261128000009_manual_billing_sessions.sql',
    ]) {
      const file = path.join(process.cwd(), 'supabase', 'migrations', mig);
      const sql = fs.readFileSync(file, 'utf8');
      await db.exec(cleanSql(sql));
    }

    await asAdmin();
    await db.exec(`
      INSERT INTO auth.users (id, email)
      VALUES 
        ('${OWNER_USER_ID}', 'owner@everytimecreamery.com'),
        ('${STAFF_1_ID}', 'staff1@everytimecreamery.com'),
        ('${STAFF_2_ID}', 'staff2@everytimecreamery.com')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.stores (id, name, address, phone, currency)
      VALUES 
        ('${STORE_1_ID}', 'Everytime Creamery - Flagship', 'Bandra West, Mumbai', '+91 98200 12345', 'INR'),
        ('${STORE_2_ID}', 'Everytime Creamery - Juhu', 'Juhu, Mumbai', '+91 98200 67890', 'INR')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
      VALUES 
        ('${TERMINAL_1_ID}', '${STORE_1_ID}', '01', 'Counter Terminal #01'),
        ('${TERMINAL_2_ID}', '${STORE_2_ID}', '01', 'Counter Terminal #01')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.profiles (id, store_id, role, full_name, cashier_code, is_active)
      VALUES 
        ('${OWNER_USER_ID}', '${STORE_1_ID}', 'owner', 'Owner Boss', 'OWNER-01', true),
        ('${STAFF_1_ID}', '${STORE_1_ID}', 'staff', 'Staff Alex', 'ALEX-01', true),
        ('${STAFF_2_ID}', '${STORE_2_ID}', 'staff', 'Staff Jordan', 'JORDAN-02', true)
      ON CONFLICT (id) DO UPDATE SET store_id = EXCLUDED.store_id, role = EXCLUDED.role, is_active = EXCLUDED.is_active;

      INSERT INTO public.staff_members (id, store_id, full_name, cashier_code, is_active)
      VALUES 
        ('44444444-4444-4444-4444-444444444441', '${STORE_1_ID}', 'Rohan Sharma', 'ROHAN-01', true),
        ('44444444-4444-4444-4444-444444444442', '${STORE_1_ID}', 'Pooja Verma', 'POOJA-02', false),
        ('44444444-4444-4444-4444-444444444443', '${STORE_1_ID}', 'Karan Mehta', 'KARAN-03', true),
        ('44444444-4444-4444-4444-444444444444', '${STORE_2_ID}', 'Sneha Joshi', 'SNEHA-04', true)
      ON CONFLICT DO NOTHING;
    `);

    staffMember1Id = '44444444-4444-4444-4444-444444444441';
    staffMemberInactiveId = '44444444-4444-4444-4444-444444444442';
    staffMember2Store1Id = '44444444-4444-4444-4444-444444444443';
    staffMemberStore2Id = '44444444-4444-4444-4444-444444444444';
  }, 35000);

  afterAll(async () => {
    if (db) {
      await db.close();
    }
  });

  it('1. Checkout is rejected when billing is STOPPED / no active session exists', async () => {
    await asStaff1();

    const orderId = 'a0000000-0000-0000-0000-000000000001';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    await expect(
      db.query(
        `SELECT public.complete_pos_checkout(
          $1::uuid, $2::uuid, 'T1', 1, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395
        )`,
        [orderId, TERMINAL_1_ID, payload, payments, STAFF_1_ID]
      )
    ).rejects.toThrow(/Billing session inactive.*Billing is currently STOPPED/i);
  });

  it('2. Staff can fetch terminal billing status and store active cashiers without PII exposure', async () => {
    await asStaff1();

    const statusRes = await db.query<{ get_terminal_billing_status: any }>(
      `SELECT public.get_terminal_billing_status($1::uuid)`,
      [TERMINAL_1_ID]
    );
    const snap = statusRes.rows[0].get_terminal_billing_status;
    expect(snap.active).toBe(false);
    expect(snap.active_session).toBeNull();
    expect(snap.terminal.id).toBe(TERMINAL_1_ID);
    expect(snap.store.id).toBe(STORE_1_ID);
    expect(Array.isArray(snap.active_cashiers)).toBe(true);
    expect(snap.active_cashiers.length).toBe(2); // Rohan and Karan (Pooja is inactive, Sneha is Store 2)
    expect(snap.active_cashiers.map((c: any) => c.cashier_code).sort()).toEqual(['KARAN-03', 'ROHAN-01']);

    // Direct SELECT on staff_members table remains blocked for staff by RLS
    const directRead = await db.query(`SELECT * FROM public.staff_members`);
    expect(directRead.rows).toHaveLength(0);
  });

  it('3. Staff successfully starts a manual billing session with server timestamp and audit log', async () => {
    await asStaff1();

    const res = await db.query<{ start_billing_session: any }>(
      `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
      [STORE_1_ID, TERMINAL_1_ID, staffMember1Id]
    );

    const data = res.rows[0].start_billing_session;
    expect(data.success).toBe(true);
    expect(data.status).toBe('ACTIVE');
    expect(data.terminal_id).toBe(TERMINAL_1_ID);
    expect(data.staff_member_id).toBe(staffMember1Id);
    expect(data.staff_member_name).toBe('Rohan Sharma');
    expect(data.cashier_code).toBe('ROHAN-01');
    expect(data.started_at).toBeTruthy();

    // Verify audit log has SESSION_STARTED
    const events = await db.query<any>(
      `SELECT * FROM public.billing_session_events WHERE session_id = $1::uuid`,
      [data.session_id]
    );
    expect(events.rows.length).toBe(1);
    expect(events.rows[0].event_type).toBe('SESSION_STARTED');
    expect(events.rows[0].actor_id).toBe(STAFF_1_ID);
    expect(events.rows[0].staff_member_id).toBe(staffMember1Id);
  });

  it('4. Duplicate and concurrent start requests are rejected', async () => {
    await asStaff1();

    await expect(
      db.query(
        `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
        [STORE_1_ID, TERMINAL_1_ID, staffMember1Id]
      )
    ).rejects.toThrow(/Conflict.*Terminal already has an active billing session/i);

    // Two concurrent start requests on Store 2 Terminal 2: exactly one succeeds, the other rejects with Conflict
    await asStaff2();
    const results = await Promise.allSettled([
      db.query(`SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`, [
        STORE_2_ID,
        TERMINAL_2_ID,
        staffMemberStore2Id,
      ]),
      db.query(`SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`, [
        STORE_2_ID,
        TERMINAL_2_ID,
        staffMemberStore2Id,
      ]),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason?.message).toMatch(/Conflict.*already has an active billing session/i);

    // Stop Store 2 session so we can test other Store 2 start cases cleanly
    const s2SessionId = (fulfilled[0] as PromiseFulfilledResult<any>).value.rows[0].start_billing_session.session_id;
    await db.query(`SELECT public.stop_billing_session($1::uuid, 'cleanup test 4')`, [s2SessionId]);
  });

  it('5. Inactive staff member attribution and cross-store employee attribution are rejected on start', async () => {
    await asStaff2();

    // Inactive employee rejected
    await expect(
      db.query(
        `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
        [STORE_2_ID, TERMINAL_2_ID, staffMemberInactiveId]
      )
    ).rejects.toThrow(/Selected staff member is inactive/i);

    // Active employee belonging to Store 1 rejected on Store 2
    await expect(
      db.query(
        `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
        [STORE_2_ID, TERMINAL_2_ID, staffMember1Id]
      )
    ).rejects.toThrow(/Selected staff member does not belong to this store/i);
  });

  it('6. Cross-store and cross-terminal operations are rejected', async () => {
    await asStaff1();

    // Staff 1 (Store 1) attempts to start billing for Store 2
    await expect(
      db.query(
        `SELECT public.start_billing_session($1::uuid, $2::uuid, NULL)`,
        [STORE_2_ID, TERMINAL_2_ID]
      )
    ).rejects.toThrow(/Staff member cannot start billing for another store/i);

    // Staff 1 passes Store 1 ID with Terminal 2 ID
    await expect(
      db.query(
        `SELECT public.start_billing_session($1::uuid, $2::uuid, NULL)`,
        [STORE_1_ID, TERMINAL_2_ID]
      )
    ).rejects.toThrow(/Terminal does not belong to specified store/i);

    // Staff 1 attempts to read status of Terminal 2
    await expect(
      db.query(`SELECT public.get_terminal_billing_status($1::uuid)`, [TERMINAL_2_ID])
    ).rejects.toThrow(/Terminal does not belong to your assigned store/i);

    // Staff 1 attempts to list active cashiers for Store 2
    await expect(
      db.query(`SELECT public.list_store_active_cashiers($1::uuid)`, [STORE_2_ID])
    ).rejects.toThrow(/Cannot list employees for another store/i);
  });

  it('7. Checkout succeeds when billing is ACTIVE and links billing_session_id and operational staff_member_id', async () => {
    await asStaff1();

    const activeRes = await db.query<{ get_active_billing_session: any }>(
      `SELECT public.get_active_billing_session($1::uuid)`,
      [TERMINAL_1_ID]
    );
    const active = activeRes.rows[0].get_active_billing_session;
    expect(active.active).toBe(true);
    const sessionId = active.session_id;

    const orderId = 'a0000000-0000-0000-0000-000000000002';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    const checkoutRes = await db.query<{ complete_pos_checkout: any }>(
      `SELECT public.complete_pos_checkout(
        $1::uuid, $2::uuid, 'T1', 1, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395, $6::uuid
      )`,
      [orderId, TERMINAL_1_ID, payload, payments, STAFF_1_ID, staffMember2Store1Id]
    );

    const checkout = checkoutRes.rows[0].complete_pos_checkout;
    expect(checkout.order_id).toBe(orderId);
    expect(checkout.billing_session_id).toBe(sessionId);
    expect(checkout.staff_member_id).toBe(staffMember2Store1Id);

    const orderInDb = await db.query<any>(
      `SELECT id, billing_session_id, staff_member_id, total_paise FROM public.orders WHERE id = $1::uuid`,
      [orderId]
    );
    expect(orderInDb.rows[0].billing_session_id).toBe(sessionId);
    expect(orderInDb.rows[0].staff_member_id).toBe(staffMember2Store1Id);
    expect(Number(orderInDb.rows[0].total_paise)).toBe(10395);
  });

  it('8. Checkout rejects inactive or cross-store employee attribution even when billing is ON', async () => {
    await asStaff1();

    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    // Inactive employee rejected during checkout
    await expect(
      db.query(
        `SELECT public.complete_pos_checkout(
          $1::uuid, $2::uuid, 'T1', 2, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395, $6::uuid
        )`,
        ['a0000000-0000-0000-0000-000000000021', TERMINAL_1_ID, payload, payments, STAFF_1_ID, staffMemberInactiveId]
      )
    ).rejects.toThrow(/Selected staff member is inactive/i);

    // Cross-store employee rejected during checkout
    await expect(
      db.query(
        `SELECT public.complete_pos_checkout(
          $1::uuid, $2::uuid, 'T1', 2, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395, $6::uuid
        )`,
        ['a0000000-0000-0000-0000-000000000022', TERMINAL_1_ID, payload, payments, STAFF_1_ID, staffMemberStore2Id]
      )
    ).rejects.toThrow(/Selected staff member does not belong to this store/i);
  });

  it('9. No automatic 2:00 AM cutoff: checkout after 2:00 AM succeeds while session remains manually ACTIVE', async () => {
    await asStaff1();

    const orderAfter2AmId = 'a0000000-0000-0000-0000-000000000025';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 2,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'upi',
        amount_paise: 20790,
        upi_utr: 'UTR205AM9988',
      },
    ]);

    const res = await db.query<{ complete_pos_checkout: any }>(
      `SELECT public.complete_pos_checkout(
        $1::uuid, $2::uuid, 'T1', 2, $3::jsonb, 0, NULL, NULL, $4::jsonb,
        '2026-11-28T02:15:00+05:30'::timestamptz, '2026-11-27'::date, $5::uuid, 19800, 20790
      )`,
      [orderAfter2AmId, TERMINAL_1_ID, payload, payments, STAFF_1_ID]
    );

    expect(res.rows[0].complete_pos_checkout.status).toBe('COMPLETED');
    expect(Number(res.rows[0].complete_pos_checkout.total_paise)).toBe(20790);
    // Defaulted operational attribution to session's staff_member_id (Rohan)
    expect(res.rows[0].complete_pos_checkout.staff_member_id).toBe(staffMember1Id);
  });

  it('10. Completed order billing_session_id and staff_member_id are strictly immutable', async () => {
    const orderId = 'a0000000-0000-0000-0000-000000000002';

    // Staff RLS blocks update completely (0 affected rows)
    await asStaff1();
    const staffUpdate = await db.query(
      `UPDATE public.orders SET billing_session_id = NULL WHERE id = $1::uuid`,
      [orderId]
    );
    expect(staffUpdate.affectedRows).toBe(0);

    // Owner update is blocked by immutability trigger before any FK check
    await asOwner();
    await expect(
      db.query(
        `UPDATE public.orders SET billing_session_id = NULL WHERE id = $1::uuid`,
        [orderId]
      )
    ).rejects.toThrow(/Financial audit violation.*immutable/i);

    await expect(
      db.query(
        `UPDATE public.orders SET staff_member_id = $1::uuid WHERE id = $2::uuid`,
        [staffMember1Id, orderId]
      )
    ).rejects.toThrow(/Financial audit violation.*immutable/i);
  });

  it('11. Staff stops the billing session; concurrent/duplicate stop requests are rejected', async () => {
    await asStaff1();

    const activeRes = await db.query<{ get_active_billing_session: any }>(
      `SELECT public.get_active_billing_session($1::uuid)`,
      [TERMINAL_1_ID]
    );
    const sessionId = activeRes.rows[0].get_active_billing_session.session_id;

    // Two concurrent stop requests: one succeeds, one fails with already stopped conflict
    const stopResults = await Promise.allSettled([
      db.query<{ stop_billing_session: any }>(
        `SELECT public.stop_billing_session($1::uuid, $2::text)`,
        [sessionId, 'Shift handoff / afternoon break']
      ),
      db.query<{ stop_billing_session: any }>(
        `SELECT public.stop_billing_session($1::uuid, $2::text)`,
        [sessionId, 'Duplicate concurrent stop']
      ),
    ]);

    const fulfilled = stopResults.filter((r) => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    const rejected = stopResults.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason?.message).toMatch(/Conflict.*already stopped/i);

    const stopData = fulfilled[0].value.rows[0].stop_billing_session;
    expect(stopData.success).toBe(true);
    expect(stopData.status).toBe('STOPPED');
    expect(Number(stopData.order_count)).toBe(2);
    expect(Number(stopData.sales_total_paise)).toBe(10395 + 20790);

    // Audit log contains SESSION_STARTED and SESSION_STOPPED
    const events = await db.query<any>(
      `SELECT * FROM public.billing_session_events WHERE session_id = $1::uuid ORDER BY created_at ASC`,
      [sessionId]
    );
    expect(events.rows.length).toBe(2);
    expect(events.rows[0].event_type).toBe('SESSION_STARTED');
    expect(events.rows[1].event_type).toBe('SESSION_STOPPED');
    expect(events.rows[1].reason).toBe('Shift handoff / afternoon break');
  });

  it('12. After stop, new checkouts are immediately rejected, while existing orders and payments remain intact', async () => {
    await asStaff1();

    const orderId = 'a0000000-0000-0000-0000-000000000003';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    await expect(
      db.query(
        `SELECT public.complete_pos_checkout(
          $1::uuid, $2::uuid, 'T1', 3, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395
        )`,
        [orderId, TERMINAL_1_ID, payload, payments, STAFF_1_ID]
      )
    ).rejects.toThrow(/Billing session inactive.*Billing is currently STOPPED/i);

    // Existing orders and payments from the stopped session remain untouched
    const existingOrders = await db.query<any>(`SELECT COUNT(*)::int AS cnt FROM public.orders`);
    expect(existingOrders.rows[0].cnt).toBe(2);
  });

  it('13. Staff restarts billing: creates a new session and does NOT modify old session (nor close business day)', async () => {
    await asStaff1();

    const prevSessions = await db.query<any>(
      `SELECT id, status, started_at, stopped_at FROM public.billing_sessions WHERE terminal_id = $1::uuid`,
      [TERMINAL_1_ID]
    );
    expect(prevSessions.rows.length).toBe(1);
    const oldSessionId = prevSessions.rows[0].id;

    // Attempt to reopen stopped session directly (even as admin) is blocked by trigger
    await asAdmin();
    await expect(
      db.query(
        `UPDATE public.billing_sessions SET status = 'ACTIVE', stopped_at = NULL, stopped_by = NULL WHERE id = $1::uuid`,
        [oldSessionId]
      )
    ).rejects.toThrow(/Audit violation.*stopped billing session cannot be restarted or modified/i);

    // Start new session as staff
    await asStaff1();
    const restartRes = await db.query<{ start_billing_session: any }>(
      `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
      [STORE_1_ID, TERMINAL_1_ID, staffMember1Id]
    );
    const newSession = restartRes.rows[0].start_billing_session;
    expect(newSession.session_id).not.toBe(oldSessionId);
    expect(newSession.status).toBe('ACTIVE');

    // Complete an order in the restarted session on the same business date (token_seq continues)
    const orderInNewSession = 'a0000000-0000-0000-0000-000000000004';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    const checkoutRes = await db.query<{ complete_pos_checkout: any }>(
      `SELECT public.complete_pos_checkout(
        $1::uuid, $2::uuid, 'T1', NULL, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395
      )`,
      [orderInNewSession, TERMINAL_1_ID, payload, payments, STAFF_1_ID]
    );
    expect(checkoutRes.rows[0].complete_pos_checkout.billing_session_id).toBe(newSession.session_id);
    expect(checkoutRes.rows[0].complete_pos_checkout.token_seq).toBe(2); // Continues sequence for 2026-11-28!

    // Verify there are now two session records in total
    const allSessions = await db.query<any>(
      `SELECT id, status FROM public.billing_sessions WHERE terminal_id = $1::uuid ORDER BY started_at ASC`,
      [TERMINAL_1_ID]
    );
    expect(allSessions.rows.length).toBe(2);
    expect(allSessions.rows[0].id).toBe(oldSessionId);
    expect(allSessions.rows[0].status).toBe('STOPPED');
    expect(allSessions.rows[1].id).toBe(newSession.session_id);
    expect(allSessions.rows[1].status).toBe('ACTIVE');
  });

  it('14. Staff historical-record restrictions: direct INSERT/UPDATE/DELETE on billing_sessions and events is denied', async () => {
    await asStaff1();

    await expect(
      db.query(`DELETE FROM public.billing_sessions`)
    ).rejects.toThrow(/permission denied|Audit violation/i);

    await expect(
      db.query(`UPDATE public.billing_sessions SET stop_reason = 'tampered'`)
    ).rejects.toThrow(/permission denied|Audit violation/i);

    await expect(
      db.query(`DELETE FROM public.billing_session_events`)
    ).rejects.toThrow(/permission denied|Audit violation/i);

    // Even admin cannot delete or mutate billing_session_events or delete billing_sessions
    await asAdmin();
    await expect(
      db.query(`DELETE FROM public.billing_session_events`)
    ).rejects.toThrow(/Audit violation.*immutable/i);

    await expect(
      db.query(`DELETE FROM public.billing_sessions`)
    ).rejects.toThrow(/Audit violation.*cannot be deleted/i);
  });

  it('15. RLS policy enforcement: staff cannot view sessions from another store; owner sees all stores', async () => {
    await asStaff2();
    await db.query(
      `SELECT public.start_billing_session($1::uuid, $2::uuid, $3::uuid)`,
      [STORE_2_ID, TERMINAL_2_ID, staffMemberStore2Id]
    );

    await asStaff1();
    const staff1View = await db.query(
      `SELECT id, store_id FROM public.billing_sessions`
    );
    expect(staff1View.rows.length).toBeGreaterThan(0);
    expect(staff1View.rows.every((r: any) => r.store_id === STORE_1_ID)).toBe(true);

    await asOwner();
    const ownerView = await db.query(
      `SELECT id, store_id FROM public.billing_sessions`
    );
    const storesSeen = new Set(ownerView.rows.map((r: any) => r.store_id));
    expect(storesSeen.has(STORE_1_ID)).toBe(true);
    expect(storesSeen.has(STORE_2_ID)).toBe(true);
  });

  it('15b. Checkout racing with a stop request serializes cleanly without orphan orders', async () => {
    await asStaff1();
    const activeRes = await db.query<{ get_active_billing_session: any }>(
      `SELECT public.get_active_billing_session($1::uuid)`,
      [TERMINAL_1_ID]
    );
    const sessionId = activeRes.rows[0].get_active_billing_session.session_id;
    expect(sessionId).toBeTruthy();

    const raceOrderId = 'a0000000-0000-0000-0000-000000000099';
    const payload = JSON.stringify([
      {
        menu_item_id: 'gelato-madagascar-vanilla',
        quantity: 1,
        expected_unit_price_paise: 9900,
      },
    ]);
    const payments = JSON.stringify([
      {
        method: 'cash',
        amount_paise: 10395,
      },
    ]);

    // Issue stop and checkout concurrently
    const [stopOutcome, checkoutOutcome] = await Promise.allSettled([
      db.query<{ stop_billing_session: any }>(
        `SELECT public.stop_billing_session($1::uuid, 'Race test stop')`,
        [sessionId]
      ),
      db.query<{ complete_pos_checkout: any }>(
        `SELECT public.complete_pos_checkout(
          $1::uuid, $2::uuid, 'T1', NULL, $3::jsonb, 0, NULL, NULL, $4::jsonb, NULL, '2026-11-28'::date, $5::uuid, 9900, 10395
        )`,
        [raceOrderId, TERMINAL_1_ID, payload, payments, STAFF_1_ID]
      ),
    ]);

    expect(stopOutcome.status).toBe('fulfilled');
    if (checkoutOutcome.status === 'rejected') {
      // Stop executed first -> checkout rejected cleanly
      expect(checkoutOutcome.reason?.message).toMatch(/Billing session inactive.*STOPPED/i);
    } else {
      // Checkout executed first -> order is linked to sessionId and included in stop summary
      expect(checkoutOutcome.value.rows[0].complete_pos_checkout.billing_session_id).toBe(sessionId);
      const stopData = (stopOutcome as PromiseFulfilledResult<any>).value.rows[0].stop_billing_session;
      expect(Number(stopData.order_count)).toBe(2);
    }
  });

  it('16. Rollback and re-apply: rollback 09 is clean and re-applying migration 09 works', async () => {
    await asAdmin();

    const rollbackFile = path.join(
      process.cwd(),
      'supabase',
      'rollbacks',
      '20261128000009_manual_billing_sessions_rollback.sql'
    );
    const rollbackSql = fs.readFileSync(rollbackFile, 'utf8');
    await db.exec(cleanSql(rollbackSql));

    const checkGone = await db.query<any>(
      `SELECT to_regclass('public.billing_sessions') as tbl`
    );
    expect(checkGone.rows[0].tbl).toBeNull();

    const migFile = path.join(
      process.cwd(),
      'supabase',
      'migrations',
      '20261128000009_manual_billing_sessions.sql'
    );
    const migSql = fs.readFileSync(migFile, 'utf8');
    await db.exec(cleanSql(migSql));

    const checkRecreated = await db.query<any>(
      `SELECT to_regclass('public.billing_sessions') as tbl`
    );
    expect(checkRecreated.rows[0].tbl).not.toBeNull();
  });
});
