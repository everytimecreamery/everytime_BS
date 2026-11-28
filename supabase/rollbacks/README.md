# Manual Database Rollback Scripts

This directory contains manual rollback SQL scripts corresponding to forward migrations in `supabase/migrations/`.

## Why These Scripts Are Separate from `supabase/migrations/`

The Supabase CLI discovers forward migrations inside `supabase/migrations/` by matching filenames against the pattern `<version>_<name>.sql` (`^(\d+)_([a-zA-Z0-9_]+)\.sql$`). Because rollback filenames share the `<version>_` prefix of their corresponding forward migration, keeping `*_rollback.sql` files inside `supabase/migrations/` causes them to be discovered as forward migrations with duplicate version prefixes—risking duplicate-version errors or accidental execution during migration runs.

Forward migrations remain exclusively in `supabase/migrations/`, and rollback scripts live here in `supabase/rollbacks/`.

## Migration-to-Rollback Mapping

| Sequence | Forward Migration (`supabase/migrations/`) | Rollback Script (`supabase/rollbacks/`) |
| --- | --- | --- |
| 00 | `20261122000000_init_billing_schema.sql` | *(None — initial schema baseline)* |
| 01 | `20261122000001_seed_menu_items.sql` | *(None — initial seed data)* |
| 02 | `20261122000002_menu_management_columns.sql` | *(None — additive menu columns)* |
| 03 | `20261122000003_rbac_security_policies.sql` | `20261122000003_rbac_security_policies_rollback.sql` |
| 04 | `20261122000004_financial_audit_security.sql` | `20261122000004_financial_audit_security_rollback.sql` |
| 05 | `20261122000005_secure_pos_checkout.sql` | `20261122000005_secure_pos_checkout_rollback.sql` |
| 06 | `20261122000006_final_security_hardening.sql` | `20261122000006_final_security_hardening_rollback.sql` |
| 07 | `20261122000007_staff_onboarding_and_discount_bounds.sql` | `20261122000007_staff_onboarding_and_discount_bounds_rollback.sql` |
| 08 | `20261128000008_staff_members_employee_records.sql` | `20261128000008_staff_members_employee_records_rollback.sql` |
| 09 | `20261128000009_manual_billing_sessions.sql` | `20261128000009_manual_billing_sessions_rollback.sql` |

## Manual Rollback Procedure

1. **Do not** move or copy rollback scripts back into `supabase/migrations/`.
2. **Take a database backup/snapshot** before running any rollback against a non-ephemeral environment.
3. **Read the header comments** in the rollback script(s) you plan to run. Several scripts intentionally preserve non-regressable security invariants (for example, `handle_new_user()` defaulting to `'staff'`, `ON DELETE RESTRICT` on financial tables, `payment_corrections` audit history, and `pin_hash` column restrictions).
4. **Apply rollbacks strictly in reverse order** (highest version down to the target version) using `psql` or the Supabase Dashboard SQL Editor:
   ```bash
   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/rollbacks/<version>_<name>_rollback.sql
   ```
5. **Reconcile Supabase migration history** for every rolled-back version so `supabase_migrations.schema_migrations` matches the actual database state:
   ```bash
   supabase migration repair --status reverted <version>
   ```
   For example, after rolling back migration 08:
   ```bash
   supabase migration repair --status reverted 20261128000008
   ```
6. **Verify** schema state and test locally before re-running `supabase db push` or `supabase migration up`.
