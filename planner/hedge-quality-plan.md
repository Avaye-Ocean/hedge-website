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

---

## 9. Deep Audit Round 2 — 2026-06-30

**Status: CLOSED**

### Scope

Full eyes-on sweep of all four repos, going deeper than Round 1: AI order placement,
checkout response field paths, manage-store order screens, admin pages (vouchers,
customers, delivery-fees, analytics), web-app (product detail, withdraw, AI orders),
and mobile service layer dead code.

### Findings and resolutions

| # | Priority | App | File | Issue | Fix |
|---|----------|-----|------|-------|-----|
| 1 | P0 | hedge-mobile-app | `app/(tabs)/ai-orders/index.tsx` | `handleOrder()` showed a success Toast but never called any order API — every AI order silently failed | Imported `usePlaceOrder` and `useUserStore`; replaced fake toast path with a real `placeOrder()` call with correct payload (`orderDetails`, `customerId`, `addressId`, `businessId`, `userId`, `sourceId`, `isWalletPayment: true`); validates delivery address before ordering |
| 2 | P1 | hedge-mobile-app | `components/checkout/index.tsx` | Success modal read `data?.data?.transaction?.orderNumber` (`.transaction` nesting does not exist — the transaction IS `data.data`) and `data?.data?.orderDetails?._id` (no such field) — order number and deep-link were always `undefined` | Fixed to `data?.data?.orderNumber` and `data?.data?.orders?.[0]?._id`, matching the backend `createOrder` response shape (Transaction document with `.orderNumber` directly and `.orders[]` populated array) |

### Pages verified clean (no bugs found)

| App | Pages/Components |
|-----|-----------------|
| hedge-mobile-app | manage-store/orders/NewOrders, OrderDetail, OrderStatus, OrderStatus update flow |
| hedge-wears-admin | vouchers view, customers view, delivery-fees view (store fees, continent fees, country fees tabs all wired to API) |
| hedge-web-app | product detail (with related products), coin/withdraw, AI order page |
| All apps | tsc --noEmit: 0 errors |

### Dead code noted (not a bug, not fixed)

`services/ai-shopping.ts` in mobile exports a `placeOrder()` function that posts to
`/ai/shopping/order` with `{ products: [...] }`. This endpoint exists on the backend
but the function is never imported or called — the AI screen now uses `usePlaceOrder`
from `hooks/apihooks/orders.ts` directly. Left as-is to avoid scope creep; can be
removed in a future cleanup pass.

### TypeScript verification

All TypeScript apps pass `tsc --noEmit` cleanly after fixes:

- `hedge-mobile-app` — ✅ no errors (pre-commit hook confirmed)
- `hedge-web-app` — ✅ no errors
- `hedge-wears-admin` — ✅ no errors

### Commits

- `hedge-mobile-app` → `develop-extended` (bc530d0) — fix: wire AI orders to real order API; fix checkout success modal field paths

---

## 10. Deep Audit Round 3 — 2026-06-30

**Status: CLOSED**

### Scope

Third full-sweep audit of all four repos: unwired hooks, empty handlers, broken navigation, dead API call
sites with wrong field names, missing error/loading states, hardcoded placeholder data, unreachable screens,
console.log in committed code, and TypeScript cleanliness.

### Findings and resolutions

| # | Priority | App | File | Issue | Fix |
|---|----------|-----|------|-------|-----|
| 1 | P0 | hedge-web-app | `components/views/explore/explore-view.tsx` | `useGetProducts` only destructured `{ data, isPending }` — `isError` and `refetch` missing. On API failure `feedItems` is `[]` and user silently sees "No products found" with no retry path | Added `isError` and `refetch` to destructure; inserted `isError` branch before empty-state check that renders "Failed to load products" + a Retry button calling `refetch()` |
| 2 | P2 | hedge-web-app | `components/views/product/id/review-section.tsx` | `const customerImg = "/placeholder.jpg"` defined at line 4, never referenced anywhere in the file | Removed dead declaration |
| 3 | P1 | hedge-web-app | `components/views/coin/bank-account-card.tsx` | Component never imported or used anywhere; its `Image src` pointed to `/placeholder.jpg` which does not exist in `public/` | Deleted file entirely |
| 4 | P2 | hedge-web-app | `hooks/useCurrencyRate.ts` | Hook exported but never called from any page or component — web-app uses CoinRate context instead | Deleted file |
| 5 | P2 | hedge-wears-admin | `hooks/useCurrencyRate.ts` | Hook exported but never called — admin uses `useCoinRate` instead; also contained a stray `console.error` | Deleted file |
| 6 | P2 | hedge-mobile-app | `hooks/useGetTags.tsx` | Hook exported but never called — app uses `useGetCategoryTags` from categories apihooks instead | Deleted file |

### Pages verified clean (no additional issues found)

| App | Scope |
|-----|-------|
| hedge-web-app | All API hooks wired: product, order, category, review, reward, transaction, user hooks all called in pages |
| hedge-wears-admin | All active hooks wired: `useCoinRate`, `useIsOwner`, `use-fcm-token` — all called in pages |
| hedge-mobile-app | All active apihooks wired: ads, business, categories, orders, payments, posts, products, rewards, staff, transactions, user — all confirmed called in screens |
| hedge-website | Server clean: no console.log, all routes covered by `safeApi()`, no dead code |
| All four apps | No empty onPress/onClick handlers in live (non-commented) code |
| All four apps | No unreachable screens found |
| All four apps | No hardcoded placeholder data in live data paths |

### TypeScript verification

All three TypeScript apps pass `tsc --noEmit` cleanly after fixes:

- `hedge-web-app` — no errors
- `hedge-wears-admin` — no errors
- `hedge-mobile-app` — no errors

### Commits

- `hedge-web-app` → `develop-extended` — fix: add error state to explore feed; remove dead variables and unused components
- `hedge-wears-admin` → `develop-extended` — chore: remove dead useCurrencyRate hook
- `hedge-mobile-app` → `develop-extended` — chore: remove dead useGetTags hook
- `hedge-website` → `develop` — docs: Round 3 audit findings added to quality plan

---

## 11. Deep Audit Round 4 — 2026-06-30

**Status: CLOSED**

### Scope

Fourth full-sweep: remaining dead code in hooks/, missing rate limits on public endpoints,
useCallback dependency correctness, console.log in committed code, placeholder images,
empty handlers. All four repos re-verified.

### Findings and resolutions

| # | Priority | App | File | Issue | Fix |
|---|----------|-----|------|-------|-----|
| 1 | P2 | hedge-mobile-app | `services/ai-shopping.ts` | `placeOrder()` export posted to `/ai/shopping/order` with wrong field names (`products` instead of `orderDetails`); never imported anywhere — dead and misleading | Removed the function entirely. `searchProducts` and `checkBalance` retained (still called from AI screen). Committed `76e8284`. |
| 2 | P2 | hedge-web-app | `hooks/useWindowOpen.tsx`, `useSelectArray.tsx`, `useStringArray.tsx`, `useOutsideClick.ts` | Four utility hooks with zero import sites across the entire codebase | Deleted all four. Build and `tsc --noEmit` clean. Committed `b73a474`. |
| 3 | P1 | hedge-web-app | `components/ai/ai-order-page.tsx:84` | `handleSearch` useCallback had `query.trim` (stable method reference, never changes) in deps instead of `query` — stale-closure risk, flagged by `react-hooks/exhaustive-deps` | Fixed dep to `query`. Lint clean. Committed `dedd431`. Build passes. |
| 4 | P2 | hedge-wears-admin | `hooks/useWindowOpen.tsx`, `useSelectArray.tsx`, `useStringArray.tsx`, `useOutsideClick.ts`, `useSearch.tsx`, `useDebounce.tsx` | Six utility hooks with zero import sites | Deleted all six. Build and `tsc --noEmit` clean. Committed `d05434f`. |

### Verified clean (no new issues found)

| App | Scope |
|-----|-------|
| hedge-website | `server.js` clean: no console.log, no dead routes, `safeApi()` on all fetches, correct API params |
| hedge-web-app | All remaining hooks (useAuth, useBreakpoints, useDebounce, useDisclosure, useToggleFavProduct, useCoinRate, use-fcm-token, use-timer) confirmed with at least one import site |
| hedge-wears-admin | All remaining hooks (useIsOwner, useDisclosure, useBreakpoints, useCoinRate, use-fcm-token) confirmed active |
| hedge-mobile-app | All services confirmed: ai-shopping (searchProducts/checkBalance only), order-services, payment-services, etc. No console.log in committed code |
| All four apps | No placeholder images, no dead `href="#"`, no `window.location.reload()` |

### TypeScript verification

- `hedge-web-app` — ✅ 0 errors; build passes
- `hedge-wears-admin` — ✅ 0 errors; build passes
- `hedge-mobile-app` — ✅ 0 errors

### Commits

- `hedge-mobile-app` → `develop-extended` (76e8284) — chore: remove dead placeOrder export from ai-shopping service
- `hedge-web-app` → `develop-extended` (b73a474) — chore: remove dead utility hooks
- `hedge-web-app` → `develop-extended` (dedd431) — fix: correct useCallback dependency array in AI order page
- `hedge-wears-admin` → `develop-extended` (d05434f) — chore: remove dead utility hooks
- `hedge-website` → `develop` — docs: Round 4 audit findings added to quality plan

---

## 10. Round 5 Final Verification — 2026-07-01

### What was checked

- Full re-scan of all four apps for: `console.log`, `picsum`, `via.placeholder`, `placehold.co`, `onPress={() => {}}`, `TODO`, `FIXME`
- TypeScript re-verified: `hedge-mobile-app` `tsc --noEmit` → 0 errors
- All git repos confirmed: 0 commits ahead of remote, 0 dirty files (all changes committed and pushed)
- `developer-guide.md` present in all four repos ✅
- `hedge.md` stale entries corrected: `Delivery pricing settings` updated to ✅ (mobile screen exists at `app/manage-store/delivery-pricing.tsx`); `Return order (submit to backend)` updated to ✅ (web: `ConfirmReturn` sends RETURN_CONFIRM); `Remaining Implementation Gaps` section rewritten to reflect all resolved gaps
- `hasInsufficientBalance` verified implemented in `components/checkout/index.tsx:71` — disables "Complete Order" button and shows "Top Up" banner when `walletBalance < discountedTotal`
- 4 `onPress={() => {}}` hits in `manage-store/index.tsx:330,336,342,348` confirmed dead code (inside JSX comment block `{/* ... */}` lines 307–351)

### What was NOT found

- No `console.log` in runtime source files across all four apps
- No external placeholder image URLs in source
- No empty active handlers
- No TypeScript errors

### Deferred items (unchanged from Round 4)

- **Checkout via Cryptomus** — ❌ on web and mobile; frontend payment-type selector not built. Backend handles it. Deferred out of scope.

### **STATUS: CLOSED — All four Hedge Wears apps fully audited and clean**
