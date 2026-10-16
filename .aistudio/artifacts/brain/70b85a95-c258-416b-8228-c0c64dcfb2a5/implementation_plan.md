# Cloudflare Deployment & Storefront Issue Resolution Plan

Diagnosis, verification, and resolution strategy for issues on the live Cloudflare Worker deployment (`d4daina`) and the Suit Aura Girls storefront.

## User Review & Critical Decisions

> [!IMPORTANT]
> The site is live on Cloudflare (`d4daina` worker with D1 database `suitauragirls-db`, R2 media bucket `suitauragirls-media`, and static assets). Both Cloudflare production build (`npm run build:cf`) and API/Worker tests are passing locally. Please review the planned diagnosis steps below and let us know if you have a specific symptom (e.g., checkout failure, image upload issue, admin login error, or D1 quota message) on the live site.

- **Confirmed Decision**: Focus primarily on the Cloudflare Worker deployment and diagnosing/fixing specific site issues.
- **Workflow Choice**: Verify end-to-end functionality across Cloudflare Worker shims (D1 document store, R2 media grants, session auth) and provide actionable remediation.

---

## 1. Overview & Core Concept

- **What It Does**: Ensures the Suit Aura Girls storefront runs smoothly both on Cloudflare Workers (production) and inside AI Studio (development/preview).
- **Target Audience**: Store owners managing catalogue, orders, and promotions, and shoppers browsing ethnic apparel on mobile and desktop.
- **Key Value**: Rock-solid uptime, zero disruption to active customer carts or orders, and smooth deployment between Git and Cloudflare.

---

## 2. User Experience & Visual Design

- **Visual Identity & Theme**:
  - Maintains the established "Aura" and Claymorphism storefront design tokens (`--clay-bg`, `--clay-surface`, `--color-brand`, `--color-accent`).
  - No visual or styling regressions; preserve Figtree and Instrument Serif typography and mobile-first layout.
- **Key Workflows**:
  - **Shopper Navigation**: Catalog loads, product detail with image gallery, size selection, add to bag, and cart drawer.
  - **Checkout & Payments**: Address entry, coupon calculations, Razorpay/Cash on Delivery flow.
  - **Admin Operations**: Management of products, hero slides, reviews, inventory logs, and gateway credentials.

---

## 3. Key Product Decisions & Trade-Offs

- **Dual-Mode Build Architecture**:
  - *Standard Mode*: Vite SPA directly accessing Firebase Client SDK for sandboxed development and instant preview.
  - *Cloudflare Mode (`--mode cloudflare`)*: Bundles with `src/shims/` redirecting Firebase SDK calls to Cloudflare Worker `/api/db` (D1 database) and `/api/media` (R2 bucket).
- **Graceful Fallbacks**:
  - Live Firestore listeners activate immediately if pre-generated CDN catalog is unavailable or out-of-date.
  - Dev server returns JSON error fallbacks instead of HTML for unrouted API calls, preventing syntax errors in the client.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      Client Browser                             │
│       (React 19 SPA + Claymorphism / Aura Design System)        │
└────────────────┬───────────────────────────────┬────────────────┘
                 │ (Cloudflare Build)            │ (AI Studio Dev)
                 ▼                               ▼
┌─────────────────────────────────┐   ┌───────────────────────────┐
│   Cloudflare Worker (d4daina)   │   │   Vite Dev Server (Port   │
│  - Static Assets (/dist-cf)     │   │   3000, 0.0.0.0)          │
│  - Routing (/api/*, /product/*) │   │  - HMR & React Bundles    │
│  - Node Handler Adapter         │   │  - Direct Firebase SDK    │
└───────┬─────────────────┬───────┘   └─────────────┬─────────────┘
        │                 │                         │
        ▼                 ▼                         ▼
┌───────────────┐ ┌───────────────┐       ┌───────────────────┐
│ Cloudflare D1 │ │ Cloudflare R2 │       │ Firebase Cloud    │
│ (Docstore DB) │ │ (Media CDN)   │       │ Firestore & Auth  │
└───────────────┘ └───────────────┘       └───────────────────┘
```

### Action Plan & Verification Stages

1. **Step 1 - Diagnostic Audit**:
   - Check Cloudflare Worker bindings (`wrangler.jsonc`), D1 schema compatibility, and environment secrets (`FIREBASE_SERVICE_ACCOUNT`, `RAZORPAY_KEY_*`, `BREVO_API_KEY`).
   - Run worker scenario test suites (`worker/test/scenarios/*.test.mjs`) to verify edge cases (rate limiting, orders, cancellation, payment notes).
2. **Step 2 - Target Bug Remediation**:
   - Resolve any user-reported or newly detected issues in the worker endpoints or storefront components.
   - Ensure `npm run build:cf` produces clean, error-free bundles for Cloudflare Pages/Workers assets.
3. **Step 3 - Final Verification**:
   - Run complete suite (`npm run test:api`, `compile_applet`, `lint_applet`) and verify build readiness.
