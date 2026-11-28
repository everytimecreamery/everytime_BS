import { describe, it, expect, beforeAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

describe('Final Security Hardening — Isolated PostgreSQL Verification (Migration 06)', () => {
  let db: PGlite;

  const STORE_1_ID = '00000000-0000-0000-0000-000000000001';
  const STORE_2_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_1_ID = '00000000-0000-0000-0000-000000000002';
  const TERMINAL_2_ID = '00000000-0000-0000-0000-000000000022';

  const OWNER_USER_ID = '11111111-1111-1111-1111-111111111111';
  const STAFF_STORE1_ID = '22222222-2222-2222-2222-222222222222';
  const STAFF_STORE2_ID = '33333333-3333-3333-3333-333333333333';
  const ROGUE_SIGNUP_ID = '44444444-4444-4444-4444-444444444444';
  const INVITED_STAFF_ID = '55555555-5555-5555-5555-555555555555';

  const cleanSql = (sql: string) =>
    sql
      .replace(/CREATE EXTENSION IF NOT EXISTS\s+"[^"]+";/gi, '-- skipped extension')
      .replace(/DO \$\$[\s\S]*?supabase_realtime[\s\S]*?END \$\$;/gi, '-- skipped realtime publication')
      .replace(/ALTER PUBLICATION\s+[^;]+;/gi, '-- skipped publication');

  async function setupBaseAuthAndRoles(targetDb: PGlite) {
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
  }

  async function applyAllMigrations(targetDb: PGlite) {
    const files = [
      '20261122000000_init_billing_schema.sql',
      '20261122000001_seed_menu_items.sql',
      '20261122000002_menu_management_columns.sql',
    ];
    for (const f of files) {
      const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf-8');
      await targetDb.exec(cleanSql(sql));
    }

    await targetDb.exec(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
      GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
    `);

    const postFiles = [
      '20261122000003_rbac_security_policies.sql',
      '20261122000004_financial_audit_security.sql',
      '20261122000005_secure_pos_checkout.sql',
      '20261122000006_final_security_hardening.sql',
    ];
    for (const f of postFiles) {
      const sql = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations', f), 'utf-8');
      await targetDb.exec(cleanSql(sql));
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
    await setupBaseAuthAndRoles(db);
    await applyAllMigrations(db);

    await setSession('postgres');
    await db.exec(`
      INSERT INTO public.stores (id, name, address, phone, gstin)
      VALUES ('${STORE_2_ID}', 'Second Scoop Shop', 'South Station Road', '+91 99999 88888', '29BBBBB1111B2Z6')
      ON CONFLICT (id) DO NOTHING;

      INSERT INTO public.terminals (id, store_id, terminal_number, device_name)
      VALUES ('${TERMINAL_2_ID}', '${STORE_2_ID}', '01', 'Store 2 Counter Terminal')
      ON CONFLICT (id) DO NOTHING;

      -- Bootstrap initial owner (created in auth.users without prior profile; elevated via bootstrap_initial_owner)
      INSERT INTO auth.users (id, email)
      VALUES ('${OWNER_USER_ID}', 'owner@everytimecreamery.com');

      SELECT public.bootstrap_initial_owner('owner@everytimecreamery.com');

      -- Set an offline PIN hash on owner and staff profiles to verify hash confidentiality
      UPDATE public.profiles SET pin_hash = 'sha256:owner-secret-salt:9999' WHERE id = '${OWNER_USER_ID}';
    `);

    // Owner provisions Store 1 and Store 2 staff via staff_invitations
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES
        ('staff1@everytimecreamery.com', '${STORE_1_ID}', 'Store 1 Cashier', 'C01', '${OWNER_USER_ID}'),
        ('staff2@everytimecreamery.com', '${STORE_2_ID}', 'Store 2 Cashier', 'C02', '${OWNER_USER_ID}');
    `);

    // Simulated GoTrue auth.users creation for invited staff
    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email)
      VALUES
        ('${STAFF_STORE1_ID}', 'staff1@everytimecreamery.com'),
        ('${STAFF_STORE2_ID}', 'staff2@everytimecreamery.com');

      UPDATE public.profiles SET pin_hash = 'sha256:staff1-salt:1234' WHERE id = '${STAFF_STORE1_ID}';
      UPDATE public.profiles SET pin_hash = 'sha256:staff2-salt:5678' WHERE id = '${STAFF_STORE2_ID}';
    `);
  });

  // ===========================================================================
  // 1. PUBLIC SIGNUP & STAFF PROVISIONING
  // ===========================================================================

  it('1. Arbitrary public signup receives NO profile, NO role, and NO store access', async () => {
    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (
        '${ROGUE_SIGNUP_ID}',
        'attacker@outside.example.com',
        '{"full_name":"External Attacker","role":"owner","cashier_code":"ADMIN"}'::jsonb
      );
    `);

    // Verify no profile was auto-created
    const profCheck = await db.query<any>(`SELECT * FROM public.profiles WHERE id = '${ROGUE_SIGNUP_ID}';`);
    expect(profCheck.rows.length).toBe(0);

    // Act as the newly signed-up external user
    await setSession('authenticated', ROGUE_SIGNUP_ID);

    // Helper functions return NULL
    const roleCheck = await db.query<any>(`SELECT public.get_user_role() AS r, public.get_user_store_id() AS s;`);
    expect(roleCheck.rows[0].r).toBeNull();
    expect(roleCheck.rows[0].s).toBeNull();

    // Cannot self-insert a profile
    await expect(
      db.query<any>(`
        INSERT INTO public.profiles (id, store_id, role, full_name)
        VALUES ('${ROGUE_SIGNUP_ID}', '${STORE_1_ID}', 'staff', 'Self Provisioned');
      `)
    ).rejects.toThrow(/violates row-level security policy|Unauthorized|permission denied/i);

    // Cannot read store orders, terminals, or menu catalog
    const ordersRes = await db.query<any>(`SELECT id FROM public.orders;`);
    expect(ordersRes.rows.length).toBe(0);

    const terminalsRes = await db.query<any>(`SELECT id FROM public.terminals;`);
    expect(terminalsRes.rows.length).toBe(0);

    const menuRes = await db.query<any>(`SELECT id FROM public.menu_items;`);
    expect(menuRes.rows.length).toBe(0);

    // Cannot invoke checkout RPC
    await expect(
      db.query<any>(`
        SELECT public.complete_pos_checkout(
          '${crypto.randomUUID()}',
          '${TERMINAL_1_ID}',
          'T1',
          1,
          '[{"menu_item_id":"gelato-madagascar-vanilla","quantity":1}]'::jsonb,
          0,
          NULL,
          NULL,
          '[{"method":"cash","amount_paise":10395}]'::jsonb
        );
      `)
    ).rejects.toThrow(/Unauthorized/i);
  });

  it('2. Approved owner-invited staff signup provisions exact store and role, and cannot be replayed', async () => {
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, cashier_code, invited_by)
      VALUES ('  NewHire@EverytimeCreamery.com ', '${STORE_2_ID}', 'Invited Scooper', 'C09', '${OWNER_USER_ID}');
    `);

    // Simulate GoTrue user creation for the invited email (case/whitespace normalized)
    await setSession('postgres');
    await db.exec(`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (
        '${INVITED_STAFF_ID}',
        'newhire@everytimecreamery.com',
        '{"role":"owner","full_name":"Spoofed Meta Name"}'::jsonb
      );
    `);

    const profRes = await db.query<any>(`
      SELECT id, store_id, role, full_name, cashier_code
      FROM public.profiles
      WHERE id = '${INVITED_STAFF_ID}';
    `);
    expect(profRes.rows.length).toBe(1);
    expect(profRes.rows[0].role).toBe('staff');
    expect(profRes.rows[0].store_id).toBe(STORE_2_ID);
    expect(profRes.rows[0].full_name).toBe('Invited Scooper');
    expect(profRes.rows[0].cashier_code).toBe('C09');

    // Invitation must now be marked accepted and cannot be replayed by another signup
    const invRes = await db.query<any>(`
      SELECT accepted_at FROM public.staff_invitations
      WHERE lower(trim(email)) = 'newhire@everytimecreamery.com';
    `);
    expect(invRes.rows[0].accepted_at).not.toBeNull();

    const replayUserId = '66666666-6666-6666-6666-666666666666';
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES ('${replayUserId}', 'newhire2@everytimecreamery.com');
    `);
    const replayProf = await db.query<any>(`SELECT id FROM public.profiles WHERE id = '${replayUserId}';`);
    expect(replayProf.rows.length).toBe(0);
  });

  it('3. Staff and unprovisioned users cannot create or read staff_invitations, and expired/revoked invites do not provision profiles', async () => {
    await setSession('authenticated', STAFF_STORE1_ID);

    await expect(
      db.query<any>(`
        INSERT INTO public.staff_invitations (email, store_id, full_name, invited_by)
        VALUES ('friend@example.com', '${STORE_1_ID}', 'Friend', '${STAFF_STORE1_ID}');
      `)
    ).rejects.toThrow(/violates row-level security policy|permission denied/i);

    const readInv = await db.query<any>(`SELECT id FROM public.staff_invitations;`);
    expect(readInv.rows.length).toBe(0);

    // Owner creates an expired invitation and a revoked invitation
    await setSession('authenticated', OWNER_USER_ID);
    await db.exec(`
      INSERT INTO public.staff_invitations (email, store_id, full_name, invited_by, expires_at)
      VALUES ('expired@example.com', '${STORE_1_ID}', 'Expired', '${OWNER_USER_ID}', now() - INTERVAL '1 hour');

      INSERT INTO public.staff_invitations (email, store_id, full_name, invited_by, revoked_at)
      VALUES ('revoked@example.com', '${STORE_1_ID}', 'Revoked', '${OWNER_USER_ID}', now());
    `);

    await setSession('postgres');
    const expId = crypto.randomUUID();
    const revId = crypto.randomUUID();
    await db.exec(`
      INSERT INTO auth.users (id, email) VALUES
        ('${expId}', 'expired@example.com'),
        ('${revId}', 'revoked@example.com');
    `);

    const check = await db.query<any>(`SELECT id FROM public.profiles WHERE id IN ('${expId}', '${revId}');`);
    expect(check.rows.length).toBe(0);
  });

  it('4. Initial owner bootstrap succeeds on fresh DB even though handle_new_user creates no profile on signup', async () => {
    const cleanDb = new PGlite();
    await setupBaseAuthAndRoles(cleanDb);
    await applyAllMigrations(cleanDb);

    await cleanDb.exec(`
      SET ROLE postgres;
      SET request.jwt.claim.sub = '';
      SET request.jwt.claim.role = '';
    `);

    // Attacker signs up first (gets NO profile!)
    const attackerId = 'aaaaaaaa-0000-0000-0000-000000000001';
    await cleanDb.exec(`INSERT INTO auth.users (id, email) VALUES ('${attackerId}', 'attacker@evil.com');`);
    const attackerProf = await cleanDb.query<any>(`SELECT id FROM public.profiles WHERE id = '${attackerId}';`);
    expect(attackerProf.rows.length).toBe(0);

    // Real owner signs up next (gets NO staff profile automatically)
    const ownerId = 'aaaaaaaa-0000-0000-0000-000000000002';
    await cleanDb.exec(`INSERT INTO auth.users (id, email) VALUES ('${ownerId}', 'realowner@everytimecreamery.com');`);

    // Bootstrap elevates real owner directly into public.profiles as 'owner'
    const res = await cleanDb.query<any>(`SELECT public.bootstrap_initial_owner('realowner@everytimecreamery.com') AS msg;`);
    expect(res.rows[0].msg).toMatch(/now the bootstrap owner/i);

    const ownerProf = await cleanDb.query<any>(`SELECT id, role, store_id FROM public.profiles WHERE id = '${ownerId}';`);
    expect(ownerProf.rows.length).toBe(1);
    expect(ownerProf.rows[0].role).toBe('owner');
    expect(ownerProf.rows[0].store_id).toBe(STORE_1_ID);

    // Second bootstrap attempt is denied
    await expect(
      cleanDb.query<any>(`SELECT public.bootstrap_initial_owner('attacker@evil.com');`)
    ).rejects.toThrow(/Bootstrap denied: System already has an active owner/i);

    await cleanDb.close();
  });

  // ===========================================================================
  // 2. PROTECT PROFILE PIN HASHES
  // ===========================================================================

  it('5. Staff and anon cannot read pin_hash (own or others) or other users profiles via SQL/PostgREST', async () => {
    // Anon denied completely
    await setSession('anon');
    await expect(
      db.query<any>(`SELECT id, pin_hash FROM public.profiles;`)
    ).rejects.toThrow(/permission denied/i);

    // Staff cannot SELECT pin_hash directly (not even their own)
    await setSession('authenticated', STAFF_STORE1_ID);
    await expect(
      db.query<any>(`SELECT pin_hash FROM public.profiles;`)
    ).rejects.toThrow(/permission denied/i);

    await expect(
      db.query<any>(`SELECT * FROM public.profiles WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/permission denied/i);

    // Staff selecting non-sensitive columns only sees their OWN profile (never owner or other staff)
    const staffSelf = await db.query<any>(`
      SELECT id, store_id, role, full_name, cashier_code
      FROM public.profiles;
    `);
    expect(staffSelf.rows.length).toBe(1);
    expect(staffSelf.rows[0].id).toBe(STAFF_STORE1_ID);

    // Staff cannot update pin_hash directly
    await expect(
      db.query<any>(`UPDATE public.profiles SET pin_hash = 'forged-hash' WHERE id = '${STAFF_STORE1_ID}';`)
    ).rejects.toThrow(/permission denied/i);

    // Staff can still update their own permitted profile fields (e.g. full_name)
    const updSelf = await db.query<any>(`
      UPDATE public.profiles
      SET full_name = 'Store 1 Lead Cashier'
      WHERE id = '${STAFF_STORE1_ID}'
      RETURNING id, full_name;
    `);
    expect(updSelf.rows.length).toBe(1);
    expect(updSelf.rows[0].full_name).toBe('Store 1 Lead Cashier');
  });

  it('6. Owner can read non-sensitive profile columns for all staff, while pin_hash remains protected from client SELECT', async () => {
    await setSession('authenticated', OWNER_USER_ID);

    // Owner legitimate query with explicit non-sensitive columns succeeds for all users
    const ownerList = await db.query<any>(`
      SELECT id, store_id, role, full_name, cashier_code
      FROM public.profiles
      ORDER BY role, full_name;
    `);
    expect(ownerList.rows.length).toBeGreaterThanOrEqual(3);

    // Even owner cannot dump raw pin_hash via authenticated client query
    await expect(
      db.query<any>(`SELECT id, pin_hash FROM public.profiles;`)
    ).rejects.toThrow(/permission denied/i);
  });

  // ===========================================================================
  // 3. RESTRICT TERMINAL UPDATES
  // ===========================================================================

  it('7. Staff can update last_synced_at for own store terminal, but CANNOT modify terminal_number, device_name, store_id, id, or created_at', async () => {
    await setSession('authenticated', STAFF_STORE1_ID);

    // Permitted: updating last_synced_at on own store terminal
    const syncRes = await db.query<any>(`
      UPDATE public.terminals
      SET last_synced_at = now()
      WHERE id = '${TERMINAL_1_ID}'
      RETURNING id, last_synced_at;
    `);
    expect(syncRes.rows.length).toBe(1);
    expect(syncRes.rows[0].last_synced_at).not.toBeNull();

    // Forbidden: updating terminal_number
    await expect(
      db.query<any>(`UPDATE public.terminals SET terminal_number = '99' WHERE id = '${TERMINAL_1_ID}';`)
    ).rejects.toThrow(/Unauthorized: staff can only update terminal synchronization timestamps/i);

    // Forbidden: updating device_name (even alongside last_synced_at)
    await expect(
      db.query<any>(`UPDATE public.terminals SET last_synced_at = now(), device_name = 'Rogue Device' WHERE id = '${TERMINAL_1_ID}';`)
    ).rejects.toThrow(/Unauthorized: staff can only update terminal synchronization timestamps/i);

    // Forbidden: changing store_id
    await expect(
      db.query<any>(`UPDATE public.terminals SET store_id = '${STORE_2_ID}' WHERE id = '${TERMINAL_1_ID}';`)
    ).rejects.toThrow(/Unauthorized: staff can only update terminal synchronization timestamps|violates row-level security policy/i);

    // Forbidden: changing created_at
    await expect(
      db.query<any>(`UPDATE public.terminals SET created_at = '2020-01-01T00:00:00Z' WHERE id = '${TERMINAL_1_ID}';`)
    ).rejects.toThrow(/Unauthorized: staff can only update terminal synchronization timestamps/i);

    // Forbidden: cross-store terminal sync update returns 0 rows
    const crossStoreSync = await db.query<any>(`
      UPDATE public.terminals SET last_synced_at = now() WHERE id = '${TERMINAL_2_ID}';
    `);
    expect(crossStoreSync.affectedRows).toBe(0);
  });

  it('8. Owner can still update protected terminal fields (terminal_number, device_name)', async () => {
    await setSession('authenticated', OWNER_USER_ID);

    const ownerUpd = await db.query<any>(`
      UPDATE public.terminals
      SET device_name = 'Main Gelato Counter #01'
      WHERE id = '${TERMINAL_1_ID}'
      RETURNING id, device_name;
    `);
    expect(ownerUpd.rows.length).toBe(1);
    expect(ownerUpd.rows[0].device_name).toBe('Main Gelato Counter #01');
  });

  it('9. Staff cannot read other staff or owner profile rows even without selecting pin_hash', async () => {
    await setSession('authenticated', STAFF_STORE1_ID);

    const otherProfiles = await db.query<any>(`
      SELECT id, full_name, role
      FROM public.profiles
      WHERE id IN ('${OWNER_USER_ID}', '${STAFF_STORE2_ID}');
    `);
    expect(otherProfiles.rows.length).toBe(0);
  });

  it('10. Migration 06 is idempotent, rollback preserves signup & pin_hash invariants, and re-apply restores terminal guards', async () => {
    await setSession('postgres');

    const m6 = fs.readFileSync(
      path.join(process.cwd(), 'supabase/migrations/20261122000006_final_security_hardening.sql'),
      'utf-8'
    );
    const m6Rollback = fs.readFileSync(
      path.join(process.cwd(), 'supabase/rollbacks/20261122000006_final_security_hardening_rollback.sql'),
      'utf-8'
    );

    // Idempotent re-apply
    await expect(db.exec(cleanSql(m6))).resolves.not.toThrow();

    // Rollback removes terminal update trigger while keeping pin_hash and invite-gated signup safe
    await expect(db.exec(cleanSql(m6Rollback))).resolves.not.toThrow();

    const trgAfterRollback = await db.query<any>(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_restrict_staff_terminal_update';
    `);
    expect(trgAfterRollback.rows.length).toBe(0);

    // pin_hash remains unreadable to staff even after rollback
    await setSession('authenticated', STAFF_STORE1_ID);
    await expect(db.query<any>(`SELECT pin_hash FROM public.profiles;`)).rejects.toThrow(/permission denied/i);

    // Public signup still receives NO profile after rollback
    await setSession('postgres');
    const postRbUser = crypto.randomUUID();
    await db.exec(`INSERT INTO auth.users (id, email) VALUES ('${postRbUser}', 'postrb@example.com');`);
    const postRbProf = await db.query<any>(`SELECT id FROM public.profiles WHERE id = '${postRbUser}';`);
    expect(postRbProf.rows.length).toBe(0);

    // Re-apply Migration 06 cleanly
    await expect(db.exec(cleanSql(m6))).resolves.not.toThrow();
    const trgRestored = await db.query<any>(`
      SELECT tgname FROM pg_trigger WHERE tgname = 'trg_restrict_staff_terminal_update';
    `);
    expect(trgRestored.rows.length).toBe(1);
  });
});
