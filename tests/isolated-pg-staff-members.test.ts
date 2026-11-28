import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Employee Records — Isolated PostgreSQL Verification (Migration 08)', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_1_ID = '22222222-2222-2222-2222-222222222222';
  const UNPROVISIONED_ID = '33333333-3333-3333-3333-333333333333';

  const cleanSql = (sql: string) =>
    sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');

  async function setupAuthSchema(targetDb: PGlite) {
    await targetDb.exec(`
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
        raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
        invited_at TIMESTAMPTZ,
        email_confirmed_at TIMESTAMPTZ
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
  }

  async function applyAllMigrations(targetDb: PGlite) {
    const pre = [
      '20261122000000_init_billing_schema.sql',
      '20261122000001_seed_menu_items.sql',
      '20261122000002_menu_management_columns.sql',
    ];
    for (const f of pre) {
      await targetDb.exec(cleanSql(fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf-8')));
    }

    await targetDb.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    const post = [
      '20261122000003_rbac_security_policies.sql',
      '20261122000004_financial_audit_security.sql',
      '20261122000005_secure_pos_checkout.sql',
      '20261122000006_final_security_hardening.sql',
      '20261122000007_staff_onboarding_and_discount_bounds.sql',
      '20261128000008_staff_members_employee_records.sql',
    ];
    for (const f of post) {
      await targetDb.exec(cleanSql(fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf-8')));
    }
  }

  async function setSession(role: 'postgres' | 'service_role' | 'authenticated' | 'anon', uid = '') {
    await db.exec(`
      SET ROLE ${role};
      SET request.jwt.claim.sub = '${uid}';
      SET request.jwt.claim.role = '${role === 'postgres' ? '' : role}';
    `);
  }

  beforeAll(async () => {
    db = new PGlite();
    await setupAuthSchema(db);
    await applyAllMigrations(db);

    await setSession('postgres');
    await db.exec(`
      INSERT INTO public.stores (id, name)
      VALUES ('${STORE_2_ID}', 'Second Scoop Shop')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES
        ('${OWNER_USER_ID}', 'owner@everytimecreamery.com', now()),
        ('${UNPROVISIONED_ID}', 'random@example.com', now());

      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');
    `);

    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES ('staff1@everytimecreamery.com', '${STORE_1_ID}', 'POS Cashier', 'POS1', '${OWNER_USER_ID}');
    `);

    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES ('${STAFF_1_ID}', 'staff1@everytimecreamery.com', now());
    `);
  }, 30000);

  afterAll(async () => {
    await db.close();
  });

  it('1. Owner can create, view, edit, deactivate, and reactivate standalone employee records without auth.users rows', async () => {
    await setSession('authenticated', OWNER_USER_ID);

    const inserted = await db.query<any>(`
      INSERT INTO public.staff_members (full_name, email, phone, store_id, cashier_code)
      VALUES ('  Priya Sharma  ', ' Priya@EverytimeCreamery.com ', ' +91 98765 43210 ', '${STORE_1_ID}', 'c01')
      RETURNING id, full_name, email, phone, store_id, cashier_code, is_active;
    `);
    expect(inserted.rows).toHaveLength(1);
    const empId = inserted.rows[0].id;
    expect(inserted.rows[0].full_name).toBe('Priya Sharma');
    expect(inserted.rows[0].email).toBe('priya@everytimecreamery.com');
    expect(inserted.rows[0].cashier_code).toBe('C01');
    expect(inserted.rows[0].is_active).toBe(true);

    // Edit employee details and move store
    const updated = await db.query<any>(`
      UPDATE public.staff_members
      SET full_name = 'Priya S.', email = '', phone = '', store_id = '${STORE_2_ID}', cashier_code = 'c02'
      WHERE id = '${empId}'
      RETURNING full_name, email, phone, store_id, cashier_code;
    `);
    expect(updated.rows[0].full_name).toBe('Priya S.');
    expect(updated.rows[0].email).toBeNull();
    expect(updated.rows[0].phone).toBeNull();
    expect(updated.rows[0].store_id).toBe(STORE_2_ID);
    expect(updated.rows[0].cashier_code).toBe('C02');

    // Deactivate employee — remains visible in table with is_active = false
    await db.exec(`UPDATE public.staff_members SET is_active = false WHERE id = '${empId}';`);
    const inactiveCheck = await db.query<any>(`
      SELECT id, is_active FROM public.staff_members WHERE id = '${empId}';
    `);
    expect(inactiveCheck.rows).toHaveLength(1);
    expect(inactiveCheck.rows[0].is_active).toBe(false);

    // Reactivate employee
    await db.exec(`UPDATE public.staff_members SET is_active = true WHERE id = '${empId}';`);
    const activeCheck = await db.query<any>(`
      SELECT id, is_active FROM public.staff_members WHERE id = '${empId}';
    `);
    expect(activeCheck.rows[0].is_active).toBe(true);
  });

  it('2. Non-owner roles (staff, unprovisioned user, anon) cannot view, add, edit, or delete employee records', async () => {
    await setSession('authenticated', STAFF_1_ID);

    const staffRead = await db.query<any>(`SELECT id FROM public.staff_members;`);
    expect(staffRead.rows).toHaveLength(0);

    await expect(
      db.query(`
        INSERT INTO public.staff_members (full_name, store_id, cashier_code)
        VALUES ('Rogue Hire', '${STORE_1_ID}', 'C99');
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    await expect(
      db.query(`UPDATE public.staff_members SET full_name = 'Hacked';`)
    ).resolves.toMatchObject({ affectedRows: 0 });

    await expect(
      db.query(`DELETE FROM public.staff_members;`)
    ).rejects.toThrow(/permission denied/i);

    await setSession('authenticated', UNPROVISIONED_ID);
    expect((await db.query<any>(`SELECT id FROM public.staff_members;`)).rows).toHaveLength(0);

    await setSession('anon');
    await expect(
      db.query(`SELECT id FROM public.staff_members;`)
    ).rejects.toThrow(/permission denied/i);
  });

  it('3. Duplicate cashier codes (case-insensitive) and invalid store foreign keys are rejected', async () => {
    await setSession('authenticated', OWNER_USER_ID);

    await expect(
      db.query(`
        INSERT INTO public.staff_members (full_name, store_id, cashier_code)
        VALUES ('Duplicate', '${STORE_1_ID}', 'c02');
      `)
    ).rejects.toThrow(/duplicate key|idx_staff_members_unique_cashier_code/i);

    await expect(
      db.query(`
        INSERT INTO public.staff_members (full_name, store_id, cashier_code)
        VALUES ('Bad Store', '99999999-9999-9999-9999-999999999999', 'C88');
      `)
    ).rejects.toThrow(/foreign key constraint/i);
  });

  it('3b. Cashier-code uniqueness rejects duplicates with leading/trailing whitespace and case variations', async () => {
    await setSession('authenticated', OWNER_USER_ID);

    const created = await db.query<any>(`
      INSERT INTO public.staff_members (full_name, store_id, cashier_code)
      VALUES ('Whitespace Test Employee', '${STORE_1_ID}', '  ws01  ')
      RETURNING id, cashier_code;
    `);
    expect(created.rows).toHaveLength(1);
    expect(created.rows[0].cashier_code).toBe('WS01');

    // Leading/trailing whitespace + lowercase/mixed-case duplicates on INSERT
    for (const duplicateVariant of ['ws01', '  ws01  ', ' Ws01', 'WS01   ', ' wS01 ']) {
      await expect(
        db.query(
          `INSERT INTO public.staff_members (full_name, store_id, cashier_code) VALUES ($1, $2, $3);`,
          ['Duplicate Variant', STORE_1_ID, duplicateVariant]
        )
      ).rejects.toThrow(/duplicate key|idx_staff_members_unique_cashier_code/i);
    }

    // Leading/trailing whitespace + case variation duplicate on UPDATE of another employee
    const second = await db.query<any>(`
      INSERT INTO public.staff_members (full_name, store_id, cashier_code)
      VALUES ('Second Employee', '${STORE_1_ID}', 'WS02')
      RETURNING id;
    `);
    await expect(
      db.query(
        `UPDATE public.staff_members SET cashier_code = $1 WHERE id = $2;`,
        ['  ws01  ', second.rows[0].id]
      )
    ).rejects.toThrow(/duplicate key|idx_staff_members_unique_cashier_code/i);
  });

  it('4. Existing POS checkout RPC and payments remain unaffected', async () => {
    await setSession('authenticated', STAFF_1_ID);
    const orderId = crypto.randomUUID();
    const res = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${orderId}', '${TERMINAL_1_ID}', 'T1', 1,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"cash","amount_paise":10395}]'::jsonb
      ) AS checkout;
    `);
    expect(Number(res.rows[0].checkout.total_paise)).toBe(10395);
    expect(res.rows[0].checkout.cashier_id).toBe(STAFF_1_ID);
  });

  it('5. Migration 08 is idempotent and rollback (including repeated execution) and re-apply are clean', async () => {
    await setSession('postgres');
    const m8 = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261128000008_staff_members_employee_records.sql'),
      'utf-8'
    );
    const m8Rollback = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/20261128000008_staff_members_employee_records_rollback.sql'),
      'utf-8'
    );

    await expect(db.exec(cleanSql(m8))).resolves.not.toThrow();
    await expect(db.exec(cleanSql(m8Rollback))).resolves.not.toThrow();
    await expect(db.exec(cleanSql(m8Rollback))).resolves.not.toThrow();

    const tableCheck = await db.query<any>(`SELECT to_regclass('public.staff_members') AS tbl;`);
    expect(tableCheck.rows[0].tbl).toBeNull();

    await expect(db.exec(cleanSql(m8))).resolves.not.toThrow();
    const restoredCheck = await db.query<any>(`SELECT to_regclass('public.staff_members') AS tbl;`);
    expect(restoredCheck.rows[0].tbl).toBe('staff_members');
  });
});
