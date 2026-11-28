import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Validates Supabase CLI migration discovery invariants:
 * - supabase/migrations/ contains ONLY forward migrations matching ^(\d+)_([a-zA-Z0-9_]+)\.sql$
 * - No rollback files, non-SQL files, or subdirectories exist in supabase/migrations/
 * - All discovered version prefixes are strictly unique and monotonically ordered
 * - Rollback scripts live in supabase/rollbacks/ and map 1:1 to existing forward migrations
 */
describe('Supabase migration packaging safety', () => {
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const rollbacksDir = path.join(process.cwd(), 'supabase', 'rollbacks');

  // Matches Supabase CLI MigrateFilePattern (<timestamp>_<name>.sql)
  const SUPABASE_MIGRATION_PATTERN = /^(\d+)_([a-zA-Z0-9_]+)\.sql$/;

  const EXPECTED_FORWARD_MIGRATIONS = [
    '20261122000000_init_billing_schema.sql',
    '20261122000001_seed_menu_items.sql',
    '20261122000002_menu_management_columns.sql',
    '20261122000003_rbac_security_policies.sql',
    '20261122000004_financial_audit_security.sql',
    '20261122000005_secure_pos_checkout.sql',
    '20261122000006_final_security_hardening.sql',
    '20261122000007_staff_onboarding_and_discount_bounds.sql',
    '20261128000008_staff_members_employee_records.sql',
    '20261128000009_manual_billing_sessions.sql',
  ];

  const EXPECTED_ROLLBACK_SCRIPTS = [
    '20261122000003_rbac_security_policies_rollback.sql',
    '20261122000004_financial_audit_security_rollback.sql',
    '20261122000005_secure_pos_checkout_rollback.sql',
    '20261122000006_final_security_hardening_rollback.sql',
    '20261122000007_staff_onboarding_and_discount_bounds_rollback.sql',
    '20261128000008_staff_members_employee_records_rollback.sql',
    '20261128000009_manual_billing_sessions_rollback.sql',
  ];

  it('discovers only forward migrations 00-08 in supabase/migrations/ with no rollback scripts or extra files', () => {
    const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
    expect(entries.every((e) => e.isFile())).toBe(true);

    const filenames = entries.map((e) => e.name).sort();
    expect(filenames).toEqual([...EXPECTED_FORWARD_MIGRATIONS].sort());

    for (const filename of filenames) {
      expect(filename).not.toMatch(/rollback/i);
      expect(filename).toMatch(SUPABASE_MIGRATION_PATTERN);
    }
  });

  it('has unique, strictly ascending migration version prefixes', () => {
    const filenames = fs.readdirSync(migrationsDir).sort();
    const versions = filenames.map((filename) => {
      const match = filename.match(SUPABASE_MIGRATION_PATTERN);
      expect(match).not.toBeNull();
      return match![1];
    });

    const uniqueVersions = new Set(versions);
    expect(uniqueVersions.size).toBe(versions.length);

    for (let i = 1; i < versions.length; i++) {
      expect(versions[i] > versions[i - 1]).toBe(true);
    }
  });

  it('stores all rollback scripts in supabase/rollbacks/ paired with their forward migrations', () => {
    const entries = fs.readdirSync(rollbacksDir, { withFileTypes: true });
    const sqlRollbacks = entries
      .filter((e) => e.isFile() && e.name.endsWith('.sql'))
      .map((e) => e.name)
      .sort();

    expect(sqlRollbacks).toEqual([...EXPECTED_ROLLBACK_SCRIPTS].sort());

    const forwardSet = new Set(fs.readdirSync(migrationsDir));
    for (const rollbackFile of sqlRollbacks) {
      expect(rollbackFile).toMatch(/_rollback\.sql$/);
      const expectedForwardFile = rollbackFile.replace(/_rollback\.sql$/, '.sql');
      expect(forwardSet.has(expectedForwardFile)).toBe(true);
    }
  });
});
