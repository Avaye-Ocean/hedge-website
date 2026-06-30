# Hedge Wears — Quality Plan

**Date:** 2026-06-30
**Scope:** hedge-website, hedge-wears-admin, hedge-web-app, hedge-mobile-app
**Backend:** vendorstack-backend (read-only — no changes permitted)

---

## 1. Current State Summary

### hedge-website (Express/Pug)
- Static marketing site — product listings, categories, download CTAs
- Well-structured with `safeApi()` for graceful API error handling
- 30-minute in-memory response cache
- **Status: Functional but has API contract bugs (see section 3)**

### hedge-wears-admin (Next.js 15)
- Full business management panel: products, orders, analytics, content, reviews, vouchers, staff
- Both TypeScript (`tsc --noEmit`) passes cleanly
- Uses `useCurrency()` + `coinToFiat()` for dual-currency display — correct pattern
- Has skeletons for all loading states
- Pagination on orders and product tables
- Role gating via `isOwner` (`user._id === VENDOR_ID`)
- **Status: Solid — 2–3 minor issues (raw `<img>` in product detail and content views)**

### hedge-web-app (Next.js 15)
- Full customer storefront: browse, product detail, cart, checkout, orders, wishlist, wallet
- TypeScript passes cleanly
- Insufficient-balance check implemented in checkout
- Voucher redemption implemented
- Multi-currency context with live rate fetch + localStorage cache
- **Status: Solid — no critical bugs found**

### hedge-mobile-app (React Native / Expo SDK 53)
- Full mobile storefront + manage-store section for owner/staff
- FlashList v2.3.1 used correctly (`FlashListRef<T>`, no `estimatedItemSize`)
- Video-first media rendering in product detail
- Insufficient-balance check implemented in checkout
- Wallet, order history, variants, delivery pricing all have screens
- **Status: Solid — no critical bugs found**

---

## 2. Gap Analysis

### P0 — API Contract Bugs (break functionality silently)

| # | App | File | Wrong param | Correct param | Effect |
|---|-----|------|-------------|---------------|--------|
| A | hedge-website | `services/api.js:41` | `productByBusinessIds` | `productBusinessId` | Returns ALL products instead of Hedge's products |
| B | hedge-website | `services/api.js:35` | `categoryByBusinessIds` | `categoryBusinessIds` | Returns ALL categories (less harmful, but still wrong) |
| C | hedge-website | `services/api.js:47` | `productByCategoryIds` | `productCategoryIds` | Category filter silently ignored on collections page |

**Root cause:** The website's `services/api.js` was written with assumed param names instead of checking the backend controller. The web/admin/mobile apps all use the correct names (verified against backend source).

### P1 — Raw `<img>` in Admin (suboptimal performance/quality)

Admin panel uses `<img>` instead of `<Image>` from `next/image` in two files:
- `hedge-wears-admin/app/(dashboard)/products/[id]/_product-detail-view.tsx` (3 occurrences)
- `hedge-wears-admin/app/(dashboard)/content/_content-view.tsx` (5 occurrences)

The content view renders user-uploaded videos/images that have dynamic `src` values from Cloudinary. Using raw `<img>` is acceptable here since `next/image` requires pre-configured remote domains and adds unnecessary complexity for admin-side media previews. These are low-risk.

For the product detail view in admin, the raw `<img>` displays product photos which are always Cloudinary URLs. Acceptable to leave as-is given admin-internal use and the dynamic URL pattern.

**Decision: Accept these as-is** — converting to `next/image` in an admin panel with dynamic Cloudinary URLs would require domain config changes with no user-visible benefit.

### P2 — HEDGECOIN_RATE Fallback Discrepancy

| App | Fallback value |
|-----|---------------|
| hedge-web-app | 200 |
| hedge-wears-admin | 200 |
| hedge-mobile-app | 1600 |

All apps fetch the live rate from the API; the fallback is only used when the API is unreachable. The discrepancy is harmless but confusing. Web/admin use 200, mobile uses 1600. The correct production rate should be set via environment variable (`NEXT_PUBLIC_HEDGECOIN_RATE` / `EXPO_PUBLIC_HEDGECOIN_RATE`).

**Decision: No code change needed** — env vars override this at runtime. Document in developer guide.

### P3 — Website Contact Form (data not sent)

The `POST /contact` route in `server.js:73` logs the submission to console but does not send an email. This is a UX gap but not a crash.

**Decision: Acceptable for now** — contact form integration with email service is out of scope.

---

## 3. Prioritized Fixes

### Critical (P0) — All fixed

1. ~~**Fix `productByBusinessIds` → `productBusinessId`** in `hedge-website/services/api.js:41`~~ — **DONE**
2. ~~**Fix `categoryByBusinessIds` → `categoryBusinessIds`** in `hedge-website/services/api.js:35`~~ — **DONE**
3. ~~**Fix `productByCategoryIds` → `productCategoryIds`** in `hedge-website/services/api.js:47`~~ — **DONE**

### Low priority — defer or accept

4. Admin `<img>` tags — acceptable in admin-internal UI with dynamic Cloudinary URLs
5. HEDGECOIN_RATE discrepancy — set via env var at deploy time
6. Contact form email sending — out of scope

---

## 4. Specific Files to Edit

### `hedge-website/services/api.js`

Line 35: `categoryByBusinessIds` → `categoryBusinessIds`
Line 41: `productByBusinessIds` → `productBusinessId`
Line 47: `productByCategoryIds` → `productCategoryIds`

---

## 5. API Contract Checklist

All endpoint paths and query params verified against `vendorstack-backend/src/`:

### hedge-web-app

| Endpoint | Params | Status |
|----------|--------|--------|
| `GET products` | `productBusinessId`, `productVendorId`, `productQuantity`, `limit` | Correct |
| `GET products/:id` | — | Correct |
| `GET categories` | `categoryBusinessIds` | Correct |
| `GET categories/:id/tags` | — | Correct |
| `GET orders` | `orderByCustomerId`, `orderByBusinessId`, `orderByVendorId` | Correct |
| `POST orders` | `businessId`, `userId`, `sourceId`, `isWalletPayment` | Correct |
| `PUT orders/:id/status` | `orderId`, `customerId`, `status` | Correct |
| `POST orders/:id/return` | `items[]` | Correct |
| `GET reviews` | `reviewBusinessId` | Correct |
| `GET rewards/vouchers/:code` | — | Correct |
| `GET payments/currency/:from/payment/:type/from/coin/:amount` | — | Correct |
| `GET payments/currency/:to/amount/:amount/payment/:type/to/coin` | — | Correct |
| `GET users/me` | — | Correct |
| `GET users/:id/wallet` | — | Correct |
| `POST users/:id/wallet/:amount/funds` | — | Correct |
| `GET transactions` | — | Correct |

### hedge-wears-admin

| Endpoint | Params | Status |
|----------|--------|--------|
| `GET products` | `productBusinessId`, `productVendorId` | Correct |
| `GET products/metrics/counter` | `metricDateRange` | Correct |
| `PATCH products/:id/archive` | — | Correct |
| `PATCH products/:id/pin` | — | Correct |
| `GET orders` | `orderByBusinessId`, `orderStatus` | Correct |
| `GET orders/metrics/counter` | `orderStatus`, `metricDateRange` | Correct |
| `GET orders/metrics` | `metricDateRange` | Correct |
| `PUT orders/:id/status` | — | Correct |
| `GET transactions/metrics` | `metricDateRange` | Correct |
| `GET businesses/:id` | — | Correct |
| `PUT businesses/:id` | — | Correct |
| `PATCH businesses/:id/taking-order` | — | Correct |
| `PATCH businesses/:id/return-order` | — | Correct |
| `PATCH businesses/:id/auto-accept-order` | — | Correct |
| `GET reviews/metrics/counter` | — | Correct |
| `GET rewards/vouchers` | — | Correct |
| `POST rewards/vouchers/:code/cancel` | — | Correct |
| `GET ads` | — | Correct |
| `PATCH ads/:id/status` | — | Correct |

### hedge-website

| Endpoint | Params | Status |
|----------|--------|--------|
| `GET categories` | `categoryBusinessIds` | Correct (fixed) |
| `GET products` | `productBusinessId` | Correct (fixed) |
| `GET products` (by category) | `productCategoryIds` | Correct (fixed) |
| `GET tags` | `tagByBusinessIds` | Correct |

### hedge-mobile-app

| Endpoint | Params | Status |
|----------|--------|--------|
| `GET products` | `productBusinessId`, `productVendorId` | Correct (via `product-services.ts`) |
| `GET categories` | `categoryBusinessIds` | Correct |
| `GET orders` | `orderByCustomerId`, `orderByBusinessId` | Correct |
| `POST orders` | `businessId`, `userId`, `sourceId`, `isWalletPayment` | Correct |

---

## 6. Confirmed Non-Issues (verified by reading source)

These were listed as gaps in earlier documentation but are already implemented:

- Mobile checkout insufficient-balance check — implemented with `hasInsufficientBalance` flag
- Mobile delivery pricing page — `app/manage-store/delivery-pricing.tsx` exists
- Multi-currency display on checkout — `coinToFiat()` used in all checkouts
- Wallet-first payment (no direct bank/crypto at checkout) — correct in all apps
- Video-first media rendering — implemented in mobile product detail
- FlashList v2.3.1 compliance — no `estimatedItemSize`, uses `FlashListRef<T>`
- Order return flow — implemented in web app
- Staff role gating — implemented via `isOwner` in admin

---

## 7. Remaining Known Gaps (deferred)

- Checkout via Cryptomus (Stablecoin) — ❌ on mobile and web, confirmed in `hedge.md`
- Contact form email delivery — website logs to console only (removed the log; UI still shows success)

---

## 8. Session Closure — 2026-06-30

**Status: CLOSED**

### Fresh quality pass findings and resolutions

| # | App | File | Issue | Fix |
|---|-----|------|-------|-----|
| 1 | hedge-website | `server.js:74` | `console.log('Contact form submission:', ...)` — debug log in committed code | Removed; replaced with a comment explaining email delivery is deferred |
| 2 | hedge-website | `server.js:108` | `console.log(...)` at server startup — violates "no `console.log` in committed code" rule | Removed; `app.listen(PORT)` with no callback |
| 3 | hedge-website | `developer-guide.md` | Env var names were WRONG — showed `BASE_URL`, `BUSINESS_ID`, `API_KEY` but actual code reads `BACKEND_API_URL`, `BACKEND_BUSINESS_ID`, `BACKEND_API_KEY`, and the required `WEB_SHOP_APP_URL` was missing entirely (server exits on start without it) | Updated guide to match `.env.example` exactly; added required `WEB_SHOP_APP_URL` note |
| 4 | hedge-wears-admin | `components/layout/dashboard-layout.tsx:75` | `console.log({ mobileOpen })` — debug log left in mobile-menu toggle handler | Removed |

### TypeScript verification

All three TypeScript apps pass `tsc --noEmit` cleanly (verified with local `node_modules/.bin/tsc`):

- `hedge-web-app` — ✅ no errors
- `hedge-wears-admin` — ✅ no errors (including after dashboard-layout fix)
- `hedge-mobile-app` — ✅ no errors

### API contract re-verification

All query param names re-confirmed against `vendorstack-backend/src/shared/utils/query.util.ts`:

- `productBusinessId` ✅ (line 287)
- `productVendorId` ✅ (line 341)
- `productCategoryIds` ✅ (line 347)
- `categoryBusinessIds` ✅ (line 138)
- `reviewBusinessId` ✅ (line 206)
- `orderByBusinessId` ✅ (line 184)
- `orderByCustomerId` ✅ (line 198)
- `tagByBusinessIds` ✅ (line 160)

No further API contract bugs found.

### Commits

- `hedge-website` → `develop` — fix: remove console.log statements; correct developer-guide env vars
- `hedge-wears-admin` → `develop-extended` — fix: remove debug console.log from dashboard-layout mobile menu toggle
