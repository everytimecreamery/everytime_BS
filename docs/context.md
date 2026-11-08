# Everytime Creamery — Project Context

## 1. Project Overview
Everytime Creamery is a dedicated point-of-sale (POS) and operations management platform designed specifically for an artisan gelato shop. The system streamlines customer billing at the counter, tracks business metrics, calculates costs, and oversees inventory.

The ultimate vision encompasses three core operational systems:
1. **Billing POS** — High-speed, intuitive counter-top order entry, payment handling, token generation, and receipt management.
2. **Cost Tracker** — Ingredient cost analysis, recipe profitability, and margin calculations.
3. **Inventory Management** — Stock tracking, ingredient depletion, tub-level batch management, and low-stock alerts.

The initial rollout focuses solely on the **Billing POS**, delivering an airtight, rapid workflow for counter staff and essential monitoring for the shop owner.

---

## 2. Business Purpose
Artisan gelato shops operate in fast-paced retail environments where counter speed, order clarity (cup sizes, scoop counts, flavor combinations, cones, toppings), and accurate tracking are vital.

Key business objectives:
- **Minimize Counter Queues**: Enable staff to configure complex gelato orders with minimal taps.
- **Accurate Financial Records**: Ensure cash, card, and digital payment reconciliation without calculation discrepancies.
- **Order Queue Harmony**: Produce clear tokens and kitchen/counter slips to coordinate scoopers and customers.
- **Owner Oversight**: Provide real-time sales visibility, daily closure (Z-reports), and menu/price agility.

---

## 3. Application Architecture
Everytime Creamery uses a modern web architecture tailored for responsive, device-appropriate operation across counter tablets and management workstations:

- **Next.js App Router**: Provides clean route segmentation, fast server-side rendering for initial load, and fluid client-side interactions.
- **Two Distinct Portals**:
  - `/staff`: Tablet-first counter terminal optimized for touch, fast interactions, and minimal visual distraction.
  - `/owner`: Desktop and tablet-first management back-office with sidebar navigation, analytical summaries, and system settings.
- **Unified Data & Backend (Future)**:
  - Both portals will connect to a unified Supabase (PostgreSQL) backend.
  - Fine-grained access control enforced via PostgreSQL Row Level Security (RLS) and Supabase Auth.
- **Device Support**:
  - Responsive web application supporting standard browsers.
  - Future Android packaging via Capacitor for dedicated counter tablet hardware.

---

## 4. Technology Stack
The stack has been strictly selected for long-term maintainability, developer ergonomics, and rock-solid performance:

- **Framework**: Next.js 16 (App Router)
- **UI & State**: React 19, TypeScript
- **Styling**: Tailwind CSS v4, shadcn/ui component architecture
- **Icons**: Lucide React
- **Animations**: Motion for React (selective, purposeful transitions; avoiding latency in checkout flows)
- **Quality & Testing**:
  - Vitest for unit & integration testing
  - Playwright for end-to-end browser testing
  - ESLint for static code analysis
  - TypeScript strict mode
- **Planned Backend Integration**:
  - Supabase (PostgreSQL with RLS)
  - Supabase Auth
- **Planned Native Packaging**:
  - Capacitor for Android POS terminals

---

## 5. Portal Responsibilities

### Staff Portal (`/staff`)
- **Fast Billing Interface**: High-contrast, responsive layout for rapid counter tapping.
- **Order Creation**: Fluid selection of items, sizes, scoops, flavors, and add-ons.
- **Menu Browsing**: Visual organization into categories (Gelato, Beverages, Specials, Merch).
- **Cart Management**: Real-time order summary, quick quantity adjustments, and modifications.
- **Payment Handling**: Support for multi-mode payments (Cash, Card, QR / UPI).
- **Token Generation**: Sequential, readable order tokens for fulfillment pickup.
- **Receipt Printing & Digital Slips**: Quick receipt emission for customer records.
- **Previous Orders**: Search and view recent shift transactions for corrections or re-prints.

### Owner Portal (`/owner`)
- **Sales Dashboard**: Real-time sales metrics, order volume, average ticket size, and hourly trends.
- **Billing Reports**: Detailed breakdown of sales by category, payment method, and period.
- **Z-Report (End of Day)**: Daily financial balancing, cash drawer audit, and register reconciliation.
- **Menu & Price Management**: Manage flavors, tub availability, categories, and price adjustments.
- **Staff Management**: Counter staff accounts, shift logs, and role permissions.
- **Application Settings**: Shop details, receipt headers/footers, tax rules, and system configurations.

---

## 6. First-Release Scope (Phase 0 — Phase 8)
The initial release is exclusively focused on the **Billing POS**. Cost tracking and inventory management are deferred to subsequent phases.

Phase 0 sets up:
1. Complete design token foundation (Cream `#F9F7DC`, White `#FFFFFF`, Primary Red `#C43C1E`, Dark Text `#222222`, Muted Text `#777777`).
2. Route foundations (`/`, `/staff`, `/owner`) with specialized layouts.
3. Clean, scalable component structure (`components/shared`, `components/staff`, `components/owner`, `components/ui`).
4. Robust testing setup with Vitest and Playwright.
5. Strict TypeScript and linting standards.

Phase 1 completes:
1. **Interactive Staff POS Interface** at `/staff` with responsive 2-column layout.
2. **Category Navigation**: 3 demonstration categories (Gelato Cups & Cones, Takeaway Tubs 500ml, Espresso & Affogato).
3. **Mock Catalog & Pricing**: Centralized integer paise representation (`lib/mock-data/products.ts`, `lib/mock-data/flavors.ts`, `lib/mock-data/categories.ts`).
4. **Product Configuration & Flavor Allocation**: Dedicated modal with size selector (Piccolo: 1 scoop, Medio: 2 scoops, Grande: 3 scoops), slot assignment, and validation preventing incomplete orders.
5. **Deterministic Cart Management**: Line item identity strategy supporting configuration merging, quantity adjustments, item removals, clear-cart confirmation, and subtotal calculations (`lib/cart/`).
6. **Prototype Mock Boundary**: Checkout displays clear notification of Phase 1 prototype boundaries without simulating fake payment transactions.

Phase 1.1 completes:
1. **Multiple Independent Customer Orders**: Counter staff can serve sequential customers with isolated orders (`orders` state), unique sequential tokens (`#001`, `#002`, ...), independent carts, subtotals, and totals.
2. **Three-Stage Order Status Lifecycle**:
   - `PROCESSING`: Active cart creation and modification.
   - `AWAITING_PAYMENT`: Finished ticket ready for payment reconciliation; retains line items and totals while unpaid.
   - `COMPLETED`: Only achieved via explicit confirmation of simulated payment receipt; becomes strictly read-only for audit reference.
3. **Order Management Area**: Compact 3-status queue strip displaying token, status, items count, amount, creation time, and payment status for every customer order.
4. **Per-Order Payment Tracking**: Each order independently records its own payment method (`CASH`, `UPI`, `CARD`), tendered cash amount, and change due. Payment selection on one order never pollutes or completes another.
5. **Single-Screen POS Layout**: 100dvh viewport layout where header, category sidebar, cart summary, and checkout remain pinned. Only the center product grid has vertical scroll (`overflow-y: auto`).
6. **Removal of Dine-in / Parcel**: Dine-in/Parcel controls, labels, and toggles completely removed from current billing workflow to streamline counter transactions (architecture cleanly preserved for future reintroduction).



