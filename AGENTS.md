<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nextjs-agent-feedback -->

## Report Next.js feedback

The project owner enabled `experimental.agentFeedback`, authorizing this feedback pass. When enabled, `next dev` writes this block and restores it if removed. Commit `AGENTS.md` with your work to keep the tree clean.

During the current user request, retain anonymized facts as feedback candidates for meaningful or recurring Next.js issues:

- Crashes, hangs, OOMs, or unexpected slowness
- Incorrect behavior, output, errors, or diagnostics
- Missing, unclear, or conflicting documentation
- Unexpected CLI, codemod, Skill, or upgrade behavior and non-obvious workarounds

Continue the current user request without reporting immediately. Routine debugging is not feedback. Verify changes before retaining them as feedback candidates. Never retain code, logs, paths, URLs, secrets, personal information, or project-specific data.

Retain qualifying friction even if it is later fixed or worked around; record the final outcome during the reporting pass.

Before the final response, run one reporting pass. If candidates remain, from this file's directory run `npx --no-install next internal agent-feedback-instructions` once without piping or truncating its output. Follow its output or error guidance. If a network sandbox blocks it, retry with network access; if it still returns no output, continue normally.

<!-- END:nextjs-agent-feedback -->

## Supabase Cloud Order Integration Live (Direct Push Architecture)

The direct Supabase integration for Everytime Creamery Billing Software is live:
- **Shared Postgres Backend**: Project `guvdawwjgxwvdqqedvfy` (Mumbai `ap-south-1`). `/staff` is transaction writer; `/owner` is configuration writer and analytics reader with real-time websocket sync.
- **Direct Database Push (`lib/supabase/orders.ts`)**: Completed orders, line items, and payment tenders are pushed immediately to Supabase on counter payment confirmation. No offline outbox delay or background queue — the Owner portal immediately sees new orders in real time.
- **Financial Integrity**: All values in integer paise; tax split strictly guarantees `cgstPaise + sgstPaise === taxPaise` on both odd and even amounts (`calculateTaxSplitPaise`).
- **Completed Order Immutability**: Finalized transactions are immutable.
- **Active Draft Persistence**: In-progress counter tickets are preserved across page reloads via local storage without uploading incomplete orders to the server.
- **Deterministic Token Sequencing**: Terminal-scoped business day tokens (`T1-001`).

## Master Menu Management & Dynamic Staff Catalog (Owner CRUD + Realtime Sync)

Full CRUD for categories, menu items, and variants is active in the Owner Portal (`/owner`) with real-time reflection to the Staff Terminal (`/staff`):
- **Database Schema**: Tables `categories`, `menu_items`, `menu_variants` with `is_archived`, `is_available`, `is_frequent`, `portion_grams`, `updated_at`, `updated_by`.
- **Soft Deletion Only**: Hard `DELETE` is prohibited. Retiring items or categories sets `is_archived = true`. Past orders and reporting snapshots remain unaffected forever.
- **Availability Separation**: `is_available` (daily well toggle / sold-out state) and `is_archived` (permanent retirement) are completely separate states and UI actions.
- **Dynamic Staff Catalog (`lib/pos/menuCatalog.ts`)**:
  - Staff terminal reads through Supabase with instant offline fallback via `localStorage` cache (`cached_menu_catalog_v1`).
  - Unavailable (`is_available = false`) and archived (`is_archived = true`) items are automatically excluded from the counter selling grid.
  - Supabase Realtime channel (`staff-menu-catalog-realtime`) updates the counter terminal in real time whenever the owner modifies pricing or availability.
- **Invariant 2 (Gelato Portions)**: Category `'gelato'` has `portion_grams` locked to 85 and base price only; size variants are disallowed.
- **Reserved Categories**: `'frequent'` is a virtual category driven by `is_frequent = true` on menu items (no deletable row); `'extra'` is protected from archiving.
- **Add Mode Derivation**: Items with 0 variants use Direct Add; items with variants open Options Dialogs.

## SSR Hydration Invariant
No render-time Date.now() in SSR output; client-only data loads after mount.


