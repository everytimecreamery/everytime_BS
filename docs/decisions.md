# Architectural & Technical Decisions

## 1. Confirmed Technical Decisions

### D-01: Framework and Routing Architecture
- **Decision**: Next.js App Router (v16.4+) with React 19 and TypeScript.
- **Rationale**: Provides native server-side rendering for quick boot times, nested layouts for the isolated Staff and Owner interfaces, and straightforward client boundaries for POS interactivity.

### D-02: Visual Identity & Color System
- **Decision**: Established a strict 5-color palette as CSS variables and Tailwind v4 theme tokens:
  - Cream Background: `#F9F7DC`
  - Clean Surface / White: `#FFFFFF`
  - Primary Accent / Red: `#C43C1E`
  - High-Contrast Text: `#222222`
  - Muted Neutral: `#777777`
- **Rationale**: Matches the warm, artisan aesthetic of an Italian-style creamery while maintaining high visual contrast for fast readability in varying ambient light conditions.

### D-03: Responsive Architecture Strategy
- **Decision**: Distinct layouts optimized by role and device rather than a generic responsive compromise:
  - **Staff Interface**: Tablet-first (landscape priority), large tap targets (minimum 44x44px), minimal scrolling, and persistent cart visibility.
  - **Owner Interface**: Desktop/tablet dashboard with expandable/collapsible sidebar navigation and data density.

### D-04: Testing Infrastructure
- **Decision**: Dual testing setup:
  - **Vitest** with JSDOM and `@testing-library/react` for fast unit tests, utility tests, and isolated component verification.
  - **Playwright** for cross-browser end-to-end testing of counter billing workflows and owner portal navigation.

### D-05: Strict Scope Boundary
- **Decision**: In Phase 0, no business calculations, cart logic, Supabase database connections, authentication providers, or payment gateways are implemented. Only structural components, routes, placeholders, design tokens, and testing frameworks are configured.

### D-06: Cart Data Model & Pure Functional State Management
- **Decision**: Implemented cart state as a pure, immutable domain model (`CartState`, `CartLineItem`, `CartItemConfiguration` in `lib/cart/cart-types.ts`). Business logic is encapsulated in deterministic pure helper functions (`addItemToCart`, `updateItemQuantity`, `removeItemFromCart`, `clearCart`) separated from presentation components.
- **Rationale**: Keeps POS state predictable, eliminates edge cases where state gets out of sync with totals, and enables fast unit testing without DOM mocks.

### D-07: Cart-Line Identity Strategy
- **Decision**: Cart lines are uniquely identified via deterministic composite string IDs:
  `generateCartLineId = (productId, size, sortedFlavorIds)`.
- **Rationale**: Products with identical options (e.g. Medio with Pistachio + Vanilla) merge by incrementing quantity, whereas products with distinct flavors or sizes remain separate line items. Sorting flavor IDs ensures order of selection does not fragment identical lines.

### D-08: Monetary Representation via Integer Paise
- **Decision**: All prices, unit costs, subtotals, and totals are strictly stored and computed as integer paise (1 INR = 100 paise). Formatting to Rupees (`₹XX.XX`) occurs exclusively at presentation boundaries via `formatPaise()`.
- **Rationale**: Prevents floating-point precision drift and currency rounding discrepancies.

### D-09: Gelato Scoop and Flavor Allocation Model
- **Decision**: Cup sizes enforce fixed scoop/flavor slots: Piccolo (1 slot), Medio (2 slots), Grande (3 slots). Configuration dialog enforces completion before enabling "Add to Ticket". Duplicate flavor selections are supported (e.g. double chocolate). Non-gelato products (espresso, affogato) bypass configuration and support instant quick-add.
- **Rationale**: Mirrors counter reality where scoop counts are physically fixed per cup size, eliminating staff input errors.

### D-10: Phase 1 Mock Prototype Boundaries & Non-Simulation of Payment
- **Decision**: The "Charge & Generate Token" button opens an informational dialogue detailing that Phase 1 is a mock prototype. No mock success receipt or fake payment notification is shown.
- **Rationale**: Preserves integrity of staff workflow testing without misleading stakeholders that financial processing or order tokens are live.

### D-11: Multiple Order Isolation & In-Memory Session Architecture (Phase 1.1)
- **Decision**: State maintains an array of independent `PosOrder` domain objects (`orders`) identified by unique non-array-index IDs and sequential tokens (`#001`, `#002`, ...). Each customer order encapsulates its own line items, product variants, modifiers, quantities, subtotals, discounts, tax previews, payment status, payment method, and timestamps. Order switching strictly decouples active ticket presentation from underlying persistent session data.
- **Rationale**: Prevents multi-customer cart collision when counter queues form. Staff can park Customer 1's order while taking Customer 2's order without data loss.

### D-12: Three-Tier Order Status Lifecycle (Phase 1.1)
- **Decision**: Implemented formal lifecycle: `PROCESSING` -> `AWAITING_PAYMENT` -> `COMPLETED`.
  - Orders enter `PROCESSING` upon initiation, remaining freely mutable.
  - Moving to `AWAITING_PAYMENT` preserves items and totals without completing the transaction or marking it paid.
  - Orders only achieve `COMPLETED` upon explicit staff confirmation of simulated payment receipt. Completed orders become read-only to prevent counter tampering or accidental line addition.
- **Rationale**: Mirrors commercial counter reality where payment collection occurs after ticket assembly, avoiding premature or unpaid order finalization.

### D-13: Per-Order Payment Isolation (Phase 1.1)
- **Decision**: Payment method (`CASH`, `UPI`, `CARD`), cash tendered, and change returned belong exclusively to the specific order being paid. Selecting a payment mode does not apply globally or complete the ticket without explicit verification.
- **Rationale**: Ensures distinct customers in the queue can pay via different channels (e.g., Customer 1 pays Cash, Customer 2 pays UPI) without crosstalk.

### D-14: Single-Screen POS Viewport & Strict Center Scroll Architecture (Phase 1.1)
- **Decision**: The POS application shell enforces `h-[100dvh] max-h-[100dvh] overflow-hidden`. The main POS header, active orders queue, left category navigation, right cart panel, cart summary, and checkout actions remain locked into fixed viewport positions. Only the center product grid has vertical scroll (`overflow-y: auto`).
- **Rationale**: Eliminates page-level scrolling fatigue on counter tablets (1024x768, 1280x800, 1366x768), ensuring critical checkout actions are always visible and within one tap.

### D-15: Removal of Dine-in/Parcel Service Type from Immediate Scope (Phase 1.1)
- **Decision**: Removed Dine-in / Parcel selector, buttons, and display labels from the active POS billing flow. The underlying domain models retain clean extensibility so service types can be reintroduced in future phases without structural refactoring.
- **Rationale**: Simplifies counter billing velocity by eliminating unnecessary clicks for items served at the counter.

---

## 2. Unresolved Business Decisions
*(Pending client / owner input — do not assume or hardcode)*

1. **Tax Configuration & Calculation Model**:
   - Is tax inclusive or exclusive in published menu prices?
   - Are different tax slabs applicable (e.g., packaged ice cream vs. dining counter)?
2. **Order Token Numbering Scheme**:
   - Does token numbering reset to 1 daily, per shift, or continuous across time?
   - Should there be separate prefixes for dine-in vs. takeaway?
3. **Receipt Issuance Protocol**:
   - Is a printed paper receipt mandatory for every transaction, or optional on customer request?
   - Will digital receipts (SMS/WhatsApp/email) be required in Phase 4?
4. **Discounts and Staff Overrides**:
   - Are discounts allowed at the counter, and do they require manager/owner PIN authorization?
5. **Cash Drawer Reconciliation**:
   - Does the Z-report require a "blind drop" (staff enters cash count before seeing system total) or standard reconciliation?

---

## 3. Assumptions Requiring Owner Confirmation

1. **Hardware Configuration**:
   - Tablet size: Assumed 10-inch to 11-inch Android or iOS tablet in landscape orientation as the primary POS counter terminal.
   - Receipt printer: Assumed standard 80mm ESC/POS thermal printer (Bluetooth or USB/Network).
2. **Offline Requirements**:
   - Initial operational assumption: Stable Wi-Fi connection in the shop. Offline tolerance and sync will be introduced in Phase 11.
3. **User Access Model**:
   - Staff will log into the counter terminal using a quick PIN or profile selector rather than requiring email/password credential input on every transaction.
4. **Flavor & Scoop Packaging**:
   - Gelato cups/cones allow fixed combinations of scoops (e.g., Piccolo = 1 flavor, Medio = 2 flavors, Grande = 3 flavors). Confirmation needed on whether flavor splitting has price surcharges.

