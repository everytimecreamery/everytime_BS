# Everytime Creamery — Master Implementation Plan

This roadmap tracks the development lifecycle of Everytime Creamery, starting from the core foundation through to future operational modules.

---

## Roadmap Overview

- [x] **Phase 0 — Project Foundation & Architecture** *(Completed)*
- [x] **Phase 1 — Staff Billing Interface** *(Completed — Mock Data Only)*
- [x] **Phase 1.1 — POS Workflow Refinement, Multiple Customer Orders & Single-Screen UI** *(Completed)*
- [ ] **Phase 2 — Menu and Flavor Selection** *(Pending)*
- [ ] **Phase 3 — Pricing and Billing Engine** *(Pending)*
- [ ] **Phase 4 — Payment, Tokens, and Receipts** *(Pending)*
- [ ] **Phase 5 — Previous Orders and Corrections** *(Pending)*
- [ ] **Phase 6 — Owner Portal** *(Pending)*
- [ ] **Phase 7 — Supabase Integration and Security** *(Pending)*
- [ ] **Phase 8 — Real-World Testing and Launch** *(Pending)*
- [ ] **Phase 9 — Cost Tracker Integration** *(Pending)*
- [ ] **Phase 10 — Inventory Management** *(Pending)*
- [ ] **Phase 11 — Offline Resilience** *(Pending)*

---

## Detailed Phase Breakdown

### Phase 0 — Project Foundation & Architecture
**Status**: Completed  
**Objective**: Build a clean, resilient project architecture without functional business logic.
- [x] Inspect existing project configuration, dependencies, and styles.
- [x] Configure brand color tokens (Cream `#F9F7DC`, White `#FFFFFF`, Red `#C43C1E`, Dark `#222222`, Muted `#777777`).
- [x] Set up foundational routes:
  - `/` Landing and portal selector
  - `/staff` Staff counter billing interface foundation
  - `/owner` Owner management interface foundation with sidebar
- [x] Establish directory structure:
  - `components/shared/` Reusable brand elements
  - `components/staff/` Staff-specific layout & placeholder views
  - `components/owner/` Owner-specific layout & placeholder views
  - `components/ui/` Design system primitives
  - `lib/` Shared utilities and constants
  - `types/` Core domain type interfaces
- [x] Set up testing suite (Vitest + Playwright).
- [x] Verify strict TypeScript compilation, ESLint, and production build pass cleanly.

---

### Phase 1 — Staff Billing Interface
**Status**: Completed (Mock Data Only)  
**Objective**: Construct high-velocity counter billing UI optimized for touch screens.
- [x] Responsive tablet-first layout (`/staff`) with persistent cart ticket summary.
- [x] Category navigation pills for the 3 categories (Gelato, Tubs, Beverages).
- [x] Centralized typed mock catalog, flavors, and pricing in integer paise.
- [x] Gelato cup/cone size selection (Piccolo: 1 scoop, Medio: 2 scoops, Grande: 3 scoops).
- [x] Interactive flavor allocation matrix with required slot validation.
- [x] Deterministic cart state with quantity stepper, line item removal, and subtotal calculation.
- [x] Clear-cart action with accessible confirmation modal.
- [x] Prototype boundary notice on checkout explaining mock limitations.
- [x] Comprehensive test suite (Vitest unit & component tests + Playwright E2E journey).

---

### Phase 1.1 — POS Workflow Refinement, Multiple Customer Orders & Single-Screen UI
**Status**: Completed  
**Objective**: Refine counter operations to support multiple customer orders, order isolation, per-order payment tracking, and a locked single-screen POS viewport.
- [x] Removed Dine-in and Parcel selector controls, state, and labels from active POS counter workflow.
- [x] Created `+ New Order` prominent header workflow supporting arbitrary consecutive customer orders.
- [x] Guaranteed complete order isolation (ID, sequential token `#001` / `#002`, items, quantities, totals, payment status, payment method).
- [x] Implemented 3-stage order status lifecycle: `PROCESSING`, `AWAITING_PAYMENT`, `COMPLETED`.
- [x] Built compact Multiple Order Management Bar displaying Processing, Awaiting Payment, and Completed order cards with live counts.
- [x] Implemented order switching preserving independent cart state across tickets without combination.
- [x] Attached payment method selection (`CASH`, `UPI`, `CARD`), tendered amounts, and change previews strictly per order.
- [x] Required explicit payment confirmation before marking any ticket `COMPLETED`; completed orders are locked as read-only.
- [x] Enforced single-screen viewport layout (`h-[100dvh] overflow-hidden`) with pinned header, fixed left sidebar, pinned right cart summary, and vertical scroll isolated strictly to the center product menu.
- [x] Comprehensive unit and E2E verification (104 Vitest tests passing; 10 Playwright E2E tests passing with all 8 visual state screenshots generated).

---

### Phase 2 — Menu and Flavor Selection
**Status**: Pending  
**Objective**: Implement domain-specific gelato ordering flows.
- Cup/Cone size selector (Single, Double, Triple / Piccolo, Medio, Grande).
- Scoop and flavor allocation modal/popover (prevent over-scooping).
- Flavor availability toggles (In Stock, Low, Out of Stock).
- Add-on and topping selections (waffle cones, dips, sprinkles).

---

### Phase 3 — Pricing and Billing Engine
**Status**: Pending  
**Objective**: Reliable, deterministic client-side calculation engine.
- Base item price calculation.
- Add-on and upcharge computation.
- Configurable tax rules (inclusive/exclusive GST or VAT).
- Discount application (percentage, flat amount, item-level or bill-level).
- Cart state management with unit-tested math helpers.

---

### Phase 4 — Payment, Tokens, and Receipts
**Status**: Pending  
**Objective**: Order finalization, token printing, and receipt rendering.
- Payment method selection (Cash with quick-change calculator, Card, UPI/QR).
- Order token sequence generation (e.g. #042).
- Thermal receipt printer formatting (80mm/58mm standard ESC/POS layout).
- Digital receipt generation preview.

---

### Phase 5 — Previous Orders and Corrections
**Status**: Pending  
**Objective**: Transaction review and counter discrepancy handling.
- Shift order history drawer/modal.
- Quick order lookup by token or timestamp.
- Reprint receipt action.
- Void and refund workflows with reason tracking.

---

### Phase 6 — Owner Portal
**Status**: Pending  
**Objective**: Comprehensive operational management for store owners.
- Key metric dashboard (Gross Sales, Net Revenue, Orders, Avg Order Value).
- Detailed sales reports by hour, category, and payment type.
- Z-Report generation (Daily close & cash drawer balancing).
- Menu management (CRUD for categories, items, flavors, and pricing).
- Staff user management and shift monitoring.
- Store configuration and tax settings.

---

### Phase 7 — Supabase Integration and Security
**Status**: Pending  
**Objective**: Cloud persistence, authentication, and security policies.
- Database schema migration for items, categories, orders, order items, and shifts.
- Supabase Auth integration with role-based claims (Staff vs. Owner).
- PostgreSQL Row-Level Security (RLS) policies preventing unauthorized data access.
- Secure environment configuration without leaked keys.

---

### Phase 8 — Real-World Testing and Launch
**Status**: Pending  
**Objective**: Hardening, load verification, and counter readiness.
- End-to-end Playwright tests covering peak rush ordering simulations.
- Performance profiling for zero-lag tablet touch response.
- Production environment verification.
- Staff training mode and go-live checklist.

---

### Phase 9 — Cost Tracker Integration
**Status**: Pending  
**Objective**: Unit economics and margin visibility for gelato batches.
- Ingredient database and price-per-gram costing.
- Recipe builder with automatic cost-per-scoop calculation.
- Margin analytics and contribution margin breakdown.

---

### Phase 10 — Inventory Management
**Status**: Pending  
**Objective**: Ingredient and prepared tub inventory tracking.
- Tub lifecycle management (Produced -> Chilling -> In Well -> Depleted).
- Automatic stock decrement upon order completion.
- Wastage logging (spillage, sampling, melt).
- Low-stock threshold alerts.

---

### Phase 11 — Offline Resilience
**Status**: Pending  
**Objective**: Uninterrupted billing during network drops.
- IndexedDB local queue for orders during internet outages.
- Automatic background sync when connectivity is restored.
- Conflict resolution strategies for token numbers and timestamps.
- Network status indicator on counter terminal.
