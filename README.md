# MiniYo — Standalone E-commerce App

MiniYo is a bilingual (English / Arabic-RTL) baby-clothing storefront with a full
admin console. It was originally generated on Base44 and has been **fully
de-coupled** from the Base44 platform: it now runs on its own self-contained
Node + Express + SQLite backend with **zero `@base44/*` dependencies**.

## Architecture

```
React + Vite SPA  ──fetch──▶  Express API  ──▶  SQLite (better-sqlite3)
   (src/)                       (server/)          (data.db)
```

- **Frontend** — React 18, Vite 6, react-router-dom v6, @tanstack/react-query,
  TailwindCSS, Radix UI. The single integration point with the backend is
  `src/api/base44Client.js`, which exposes the same `base44.*` surface the rest
  of the app already used (`entities`, `auth`, `functions`, `integrations`,
  `users`).
- **Backend** — `server/index.js` is one Express process that:
  1. serves the built SPA from `dist/` with a history-API fallback (deep links
     never 404),
  2. exposes the REST API under `/api/*`,
  3. serves uploaded files from `/uploads`.
- **Storage** — every entity is stored in a generic table
  (`id`, `created_date`, `updated_date`, `doc` JSON). Auth credentials live in a
  separate `auth_credentials` table so password hashes never leak through the
  entity CRUD surface.

## Quick start

```bash
npm install
npm run serve     # builds the SPA, then starts the server on :4000
```

Open <http://localhost:4000>.

### Development (hot reload)

Run the API and the Vite dev server in two terminals:

```bash
npm run dev:server   # Express API on :4000
npm run dev          # Vite on :5173, proxies /api and /uploads to :4000
```

## Seeded data (idempotent)

On first boot the server seeds:

- **Super admin** — `admin@miniyo.store` / `REDACTED_PASSWORD` (role `super_admin`)
- **MembershipSettings** singleton — Bronze 2 credits / 5%, Silver $100 → 4 / 10%,
  Gold $250 → 6 / 15%
- **SiteSetting** rows — `free_shipping_threshold=50`, `payment_cod_enabled=true`, …
- **ShippingZones** — Tripoli/Koura $4, Beirut/Akkar $5, catch-all $6
- **Catalog** — 113 products + categories + variants from `server/data/catalog.csv`

Seeding is guarded by a `seed_version` key, so it is safe to restart.

## Environment variables

All are optional — sensible defaults are baked in.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | Server port |
| `MINIYO_DB_PATH` | `./data.db` | SQLite file location |
| `MINIYO_JWT_SECRET` | dev secret | **Set this in production** |
| `MINIYO_INSECURE_COOKIE` | – | `true` to allow non-HTTPS cookies in prod |
| `RESEND_API_KEY` | – | If set, emails are sent via Resend; otherwise logged to `EmailLog` |
| `MINIYO_EMAIL_FROM` | `management@miniyo.store` | From address |
| `VITE_API_BASE` | `/api` | Frontend API base |
| `VITE_DEV_API_TARGET` | `http://localhost:4000` | Vite dev proxy target |

## Backend functions (`/api/functions/:name`)

`inventoryEngine`, `membershipEngine`, `seedShippingZones`,
`sendOrderConfirmation`, `sendOrderStatusUpdate`, `sendWelcomeEmailNew`.
All return `{ data: <result> }` to match the frontend's expectation.

## Project layout

```
server/
  index.js       Express app + routes + SPA serving
  db.js          SQLite generic entity store
  auth.js        JWT cookie sessions + bcrypt
  email.js       Resend / EmailLog fallback
  functions.js   the 6 backend functions
  seed.js        idempotent seed (admin, settings, zones, catalog)
  data/catalog.csv
src/
  api/base44Client.js   standalone client (replaces @base44/sdk)
  api/entities-list.js  shared entity-name list
```
