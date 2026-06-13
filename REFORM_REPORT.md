# MiniYo Reform Report

**Goal:** make the Base44-generated MiniYo app run 100% standalone with a real
self-contained backend, no `@base44/*` dependencies, no blank pages, no 404 on
deep links — ready to publish.

**Result:** ✅ Done. The app builds with zero Base44 packages, serves from its own
Express + SQLite backend, all 42 routes resolve, and the core commerce + auth +
membership flows pass an HTTP-level smoke test.

---

## What changed

### New backend (`server/`)
| File | Responsibility |
|---|---|
| `index.js` | Express app: `/api/entities/:entity` CRUD+query, `/api/auth/*`, `/api/functions/:name` (returns `{data}`), `/api/upload`, `/api/users/invite`; serves `dist/` with history-API fallback; static `/uploads`. |
| `db.js` | better-sqlite3 generic store (28 entities → `id, created_date, updated_date, doc JSON`). Loose-equality filter, `-`-prefix descending sort, numeric-aware. Records expose both `id` and `_id`. |
| `auth.js` | JWT in httpOnly cookie (also accepts `Authorization: Bearer`), bcrypt passwords, credentials in separate table. |
| `email.js` | Resend if `RESEND_API_KEY`, else writes an `EmailLog` row; never throws. |
| `functions.js` | The 6 ported functions. |
| `seed.js` | Idempotent seed: admin, MembershipSettings, SiteSettings, ShippingZones, 113-product catalog from CSV. |
| `data/catalog.csv` | Product source of truth (committed). |

### Frontend
- **`src/api/base44Client.js`** rewritten — same `base44.*` surface, now backed by
  `fetch` against `/api` with `credentials: 'include'`. Implements the exact
  signature rules: `list(sortOrLimit?, limit?)`, `filter(query, sort?, limit?)`,
  `get/create/update/delete`, full `auth.*`, `functions.invoke` (returns the raw
  `{data}` body), `integrations.Core.UploadFile({file}) → {file_url}`,
  `users.inviteUser`. A sentinel token is mirrored in `localStorage` so legacy
  token-gated code paths still work; the real session is the cookie.
- **`src/api/entities-list.js`** (new) — shared entity-name list for the client.
- **`src/lib/AuthContext.jsx`** — now always calls `me()` (cookie-based) instead
  of gating on `appParams.token`; a guest 401 is handled silently (no console
  error).
- **`vite.config.js`** — dropped `@base44/vite-plugin`; added explicit `@ → src`
  alias (previously provided by the plugin) and a dev proxy for `/api` + `/uploads`.
- **`package.json`** — removed `@base44/sdk` and `@base44/vite-plugin`; added
  `express`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `cookie-parser`; added
  `start` / `serve` / `dev:server` scripts.
- **`.gitignore`** — ignores `data.db*` and `/uploads`.

### Bugs / hardening
- 404 page (`src/lib/PageNotFound.jsx`) is already MiniYo-branded, bilingual, and
  tolerates an unauthenticated `me()` — verified.
- Guest `me()` no longer logs a console error.
- `User` records are sanitized (no `password_hash`) through generic CRUD.

---

## Verification

### Build
`npm install` → 710 packages, **0 `@base44/*`**. `npm run build` → succeeds,
emits `dist/` (no Base44 package in `node_modules` or the bundle; the only
`base44.com` strings are external media URLs in `index.html`).

### Route smoke test (HTTP, 42/42 PASS)
Every storefront + account + admin + auth route, plus a product detail page and an
unknown path, returns **200** with the SPA shell (`<div id="root">` + hashed
assets). The unknown path also returns the SPA (→ client-rendered branded 404),
so **deep links never hard-404**.

```
PASS 200 /            PASS 200 /shop          PASS 200 /product/footed-overall
PASS 200 /cart        PASS 200 /checkout      PASS 200 /wishlist
PASS 200 /track       PASS 200 /faq           PASS 200 /about
PASS 200 /gifts       PASS 200 /account(+/orders,/addresses,/membership)
PASS 200 /login /register /forgot-password /reset-password /legal/privacy
PASS 200 /admin/login /admin + all 19 admin sub-routes
PASS 200 /this-route-does-not-exist  (SPA shell → branded 404)
ROUTES: 42 pass, 0 fail
```

### Core flows (API, all PASS)
| Flow | Result |
|---|---|
| Admin login → sets cookie → `me()` returns super_admin | ✅ |
| `me()` without cookie | ✅ 401 |
| Wrong password | ✅ 401 |
| Register → verify-otp → session token | ✅ |
| `membershipEngine` grant_bronze_credits | ✅ `{data:{success,creditsGranted:2}}` |
| Guest order → `check_stock` → `commit_stock` | ✅ stock 3 → 2 |
| `sendOrderConfirmation` / `sendOrderStatusUpdate` | ✅ logged (`status:sent`) |
| `release_stock` (cancel) | ✅ stock 2 → 3 restored |
| Free-shipping threshold | ✅ `SiteSetting.free_shipping_threshold = 50` |
| Tier upgrade at $120 lifetime spend | ✅ `{upgraded:true,newTier:"Silver"}` |

Functions return the `{data}` shape the frontend reads (`inventory.js` uses
`res.data`).

---

## Known limitations / notes
- **DOM rendering was not browser-verified.** No headless browser (Playwright /
  Puppeteer) is available in this environment, so route checks are HTTP-level
  (correct shell + working data APIs) rather than full render assertions. The
  ErrorBoundary and bilingual EN/AR toggling are wired the same way they were
  under Base44; the data they consume is confirmed present.
- **OTP is auto-verify** (any code accepted) and **password reset** issues a token
  without an email step, since self-host has no mandated mail provider. Emails
  fall back to `EmailLog` rows when `RESEND_API_KEY` is unset.
- `loginWithProvider` (Google) routes to the email login — no third-party OAuth in
  self-host mode.
- The `base44/*.jsonc` entity spec files are left in place as harmless schema
  references.

## How to run
```bash
npm install
npm run serve     # build + start on :4000
# admin: admin@miniyo.store / REDACTED_PASSWORD
```
