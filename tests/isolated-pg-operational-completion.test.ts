import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Operational Completion — Isolated PostgreSQL Verification (Migration 07)', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_1_ID = '22222222-2222-2222-2222-222222222222';
  const GOTRUE_INVITED_ID = '77777777-7777-7777-7777-777777777777';

  const cleanSql = (sql: string) =>
    sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');

  async function setupGoTrueLikeAuth(targetDb: PGlite) {
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

  async function applyMigrationsThrough07(targetDb: PGlite) {
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
    await setupGoTrueLikeAuth(db);
    await applyMigrationsThrough07(db);

    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES ('${OWNER_USER_ID}', 'owner@everytimecreamery.com', now());
      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');
    `);

    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES ('staff1@everytimecreamery.com', '${STORE_1_ID}', 'Staff One', 'C01', '${OWNER_USER_ID}');
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

  it('1. GoTrue inviteUserByEmail keeps invite pending until email_confirmed_at transitions, then provisions once', async () => {
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES ('gotrue.staff@everytimecreamery.com', '${STORE_1_ID}', 'GoTrue Cashier', 'C07', '${OWNER_USER_ID}');
    `);

    // Step A: GoTrue inviteUserByEmail inserts auth.users with invited_at set and email_confirmed_at NULL
    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, invited_at, email_confirmed_at)
      VALUES ('${GOTRUE_INVITED_ID}', 'gotrue.staff@everytimecreamery.com', now(), NULL);
    `);

    // Must still be pending: NO profile yet and accepted_at IS NULL
    const preProf = await db.query<any>(`SELECT id FROM public.profiles WHERE id = '${GOTRUE_INVITED_ID}';`);
    expect(preProf.rows).toHaveLength(0);
    const preInv = await db.query<any>(`
      SELECT accepted_at FROM public.staff_invitations WHERE email = 'gotrue.staff@everytimecreamery.com';
    `);
    expect(preInv.rows[0].accepted_at).toBeNull();

    // Step B: User clicks invite link -> GoTrue sets email_confirmed_at
    await db.exec(`
      UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${GOTRUE_INVITED_ID}';
    `);

    const postProf = await db.query<any>(`
      SELECT id, store_id, role, full_name, cashier_code, is_active
      FROM public.profiles WHERE id = '${GOTRUE_INVITED_ID}';
    `);
    expect(postProf.rows).toHaveLength(1);
    expect(postProf.rows[0].role).toBe('staff');
    expect(postProf.rows[0].is_active).toBe(true);
    expect(postProf.rows[0].cashier_code).toBe('C07');

    const postInv = await db.query<any>(`
      SELECT accepted_at, accepted_user_id FROM public.staff_invitations
      WHERE email = 'gotrue.staff@everytimecreamery.com';
    `);
    expect(postInv.rows[0].accepted_at).not.toBeNull();
    expect(postInv.rows[0].accepted_user_id).toBe(GOTRUE_INVITED_ID);
  });

  it('2. Revoking or expiring a GoTrue-pending invite prevents provisioning when user later confirms email', async () => {
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES ('revoked.later@everytimecreamery.com', '${STORE_1_ID}', 'Revoked Later', 'C08', '${OWNER_USER_ID}');
    `);

    // GoTrue creates unconfirmed user
    const revokedUserId = '88888888-8888-8888-8888-888888888888';
    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, invited_at, email_confirmed_at)
      VALUES ('${revokedUserId}', 'revoked.later@everytimecreamery.com', now(), NULL);
    `);

    // Owner revokes before user clicks link
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      UPDATE public.staff_invitations
      SET revoked_at = now()
      WHERE email = 'revoked.later@everytimecreamery.com';
    `);

    // User clicks old email link later -> GoTrue confirms email, trigger MUST NOT provision profile
    await setSession('postgres');
    await db.exec(`
      UPDATE auth.users SET email_confirmed_at = now() WHERE id = '${revokedUserId}';
    `);
    const prof = await db.query<any>(`SELECT id FROM public.profiles WHERE id = '${revokedUserId}';`);
    expect(prof.rows).toHaveLength(0);
  });

  it('3. Deactivating a staff member immediately blocks existing JWT sessions across RLS and checkout RPC while preserving order history', async () => {
    // Staff 1 completes an order while active
    await setSession('authenticated', STAFF_1_ID);
    const orderId = crypto.randomUUID();
    await db.query(`
      SELECT public.complete_pos_checkout(
        '${orderId}', '${TERMINAL_1_ID}', 'T1', 1,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
        0, NULL, NULL,
        '[{"method":"cash","amount_paise":10395}]'::jsonb
      );
    `);

    // Owner deactivates Staff 1
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      UPDATE public.profiles
      SET is_active = false, deactivated_at = now(), deactivated_by = '${OWNER_USER_ID}'
      WHERE id = '${STAFF_1_ID}';
    `);

    // Existing JWT session of Staff 1 is IMMEDIATELY powerless
    await setSession('authenticated', STAFF_1_ID);
    const roleRes = await db.query<any>(`SELECT public.get_user_role() AS r, public.get_user_store_id() AS s;`);
    expect(roleRes.rows[0].r).toBeNull();
    expect(roleRes.rows[0].s).toBeNull();

    const menuRes = await db.query<any>(`SELECT id FROM public.menu_items;`);
    expect(menuRes.rows).toHaveLength(0);

    const ordersRes = await db.query<any>(`SELECT id FROM public.orders;`);
    expect(ordersRes.rows).toHaveLength(0);

    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 2,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0, NULL, NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Unauthorized: Active staff or owner profile is required/i);

    // Staff cannot self-reactivate (RLS USING hides inactive row -> 0 affected rows; verify still inactive)
    const selfReactivate = await db.query<any>(
      `UPDATE public.profiles SET is_active = true WHERE id = '${STAFF_1_ID}';`
    );
    expect(selfReactivate.affectedRows).toBe(0);

    // Historical order remains intact with cashier attribution for Owner
    await setSession('authenticated', OWNER_USER_ID);
    const ownerOrders = await db.query<any>(`SELECT id, cashier_id FROM public.orders WHERE id = '${orderId}';`);
    expect(ownerOrders.rows).toHaveLength(1);
    expect(ownerOrders.rows[0].cashier_id).toBe(STAFF_1_ID);
  });

  it('4. complete_pos_checkout rejects 100%, >100%, negative, and zero-total discounts while allowing 99%', async () => {
    await setSession('authenticated', GOTRUE_INVITED_ID);

    // 100% discount rejected
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 10,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          100, 'PERCENTAGE', NULL,
          '[{"method":"cash","amount_paise":1}]'::jsonb
        );
      `)
    ).rejects.toThrow(/less than 100/i);

    // >100% discount rejected
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 11,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          110, 'PERCENTAGE', NULL,
          '[{"method":"cash","amount_paise":1}]'::jsonb
        );
      `)
    ).rejects.toThrow(/less than 100/i);

    // 99.999% causing total_paise = 0 rejected cleanly
    await expect(
      db.query(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 12,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          99.999, 'PERCENTAGE', NULL,
          '[{"method":"cash","amount_paise":1}]'::jsonb
        );
      `)
    ).rejects.toThrow(/greater than zero/i);

    // 99% boundary succeeds (9900 -> 99% disc = 9801 -> sub = 99 -> 5% tax = 5 -> total = 104)
    const okRes = await db.query<any>(`
      SELECT public.complete_pos_checkout(
        '${crypto.randomUUID()}', '${TERMINAL_1_ID}', 'T1', 13,
        '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
        99, 'PERCENTAGE', NULL,
        '[{"method":"cash","amount_paise":104}]'::jsonb
      ) AS checkout;
    `);
    expect(Number(okRes.rows[0].checkout.total_paise)).toBe(104);
  });

  it('5. Migration 07 is idempotent, rollback + re-apply are clean, and bootstrap_initial_owner still succeeds on fresh DB', async () => {
    await setSession('postgres');
    const m7 = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261122000007_staff_onboarding_and_discount_bounds.sql'),
      'utf-8'
    );
    const m7Rollback = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/20261122000007_staff_onboarding_and_discount_bounds_rollback.sql'),
      'utf-8'
    );

    await expect(db.exec(cleanSql(m7))).resolves.not.toThrow();
    await expect(db.exec(cleanSql(m7Rollback))).resolves.not.toThrow();
    await expect(db.exec(cleanSql(m7))).resolves.not.toThrow();

    // Fresh DB bootstrap check
    const freshDb = new PGlite();
    await setupGoTrueLikeAuth(freshDb);
    await applyMigrationsThrough07(freshDb);
    await freshDb.exec(`
      SET ROLE postgres;
      INSERT INTO auth.users (id, email, email_confirmed_at)
      VALUES ('bbbbbbbb-0000-0000-0000-000000000001', 'bootowner@everytimecreamery.com', now());
    `);
    const bootRes = await freshDb.query<any>(
      `SELECT public.bootstrap_initial_owner('bootowner@everytimecreamery.com') AS msg;`
    );
    expect(bootRes.rows[0].msg).toMatch(/now the bootstrap owner/i);
    await freshDb.close();
  });
});
