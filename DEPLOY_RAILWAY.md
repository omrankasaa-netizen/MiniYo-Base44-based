# Deploying MiniYo to Railway + Cloudflare (miniyokids.com)

MiniYo is a single Node/Express service that serves the storefront, the `/api` backend,
and a SQLite database in one process. This guide gets it live on Railway and points your
Cloudflare domain `miniyokids.com` at it.

---

## 1. Create the Railway project

1. Go to https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Select **`omrankasaa-netizen/MiniYo-Base44-based`**.
3. For the branch, pick **`main`** *after you merge PR #1*, or deploy the
   `reform/standalone-backend` branch directly to test first.

Railway auto-detects Node via Nixpacks. The repo includes `railway.json`, which sets:
- **Build command:** `npm run build`  (builds the React storefront into `dist/`)
- **Start command:** `npm start`      (runs `node server/index.js`)

No Dockerfile is needed.

---

## 2. Add a persistent Volume (so your data survives redeploys)

SQLite stores everything (products, orders, customers, settings) in one file. Without a
volume, that file is wiped on every redeploy.

1. In your Railway service → **Settings → Volumes → New Volume**.
2. Set the **Mount path** to `/data`.
3. Save.

On first boot the app auto-seeds the database: 113 products, 56 categories, 5 shipping
zones, membership tiers, the super-admin account, and your social/WhatsApp links.

---

## 3. Set environment variables

In your Railway service → **Variables**, add:

| Variable | Value |
|---|---|
| `MINIYO_DB_PATH` | `/data/data.db` |
| `RESEND_API_KEY` | `re_your_resend_api_key` |
| `MINIYO_EMAIL_FROM` | `MiniYo <management@mail.miniyokids.com>` |
| `MINIYO_ADMIN_PASSWORD` | `<set-a-strong-password>` |
| `MINIYO_JWT_SECRET` | `<set-a-long-random-secret>` |

Do **not** set `PORT` — Railway injects it automatically and the server reads it.

> Security note: generate your Resend API key in the Resend dashboard and paste the real
> value **only** into this Railway variable — never commit it to the repo. `MINIYO_JWT_SECRET`
> must be set to a long random value in production (the code falls back to a dev-only
> placeholder if unset). Set `MINIYO_ADMIN_PASSWORD` to seed the initial super-admin login.

---

## 4. Deploy & verify

1. Railway builds and deploys automatically. Watch the **Deployments** log until it shows
   `MiniYo server listening`.
2. Open the generated `*.up.railway.app` URL. Check:
   - Storefront loads, products show.
   - `/admin/login` → sign in with `admin@miniyo.store` / the password you set in
     `MINIYO_ADMIN_PASSWORD` (`<set-a-strong-password>`), then change it immediately
     after first login.
   - WhatsApp floating button and footer social links work.

---

## 5. Point miniyokids.com at Railway (via Cloudflare)

1. In Railway → service **Settings → Networking → Custom Domain** → add
   `miniyokids.com` (and `www.miniyokids.com` if you want both). Railway shows a target
   hostname like `xxxx.up.railway.app`.
2. In **Cloudflare → DNS** for `miniyokids.com`:
   - Add a **CNAME** record: name `@` (or `www`), target = the Railway hostname.
     - If Cloudflare rejects a CNAME on the root `@`, use **CNAME flattening** (Cloudflare
       does this automatically) or add the record Railway specifies.
   - Set **Proxy status** to **DNS only (grey cloud)** first, confirm the domain works,
     then you can optionally turn the orange proxy back on.
3. Wait for Railway to show the custom domain as **Active** (TLS issued).

> Your email domain `mail.miniyokids.com` is already verified in Resend — leave its DNS
> records (SPF/DKIM) untouched in Cloudflare.

---

## 6. Post-launch checklist

- [ ] Change the super-admin password from the default.
- [ ] Send a real test order and confirm the confirmation email arrives.
- [ ] (Optional) Rotate the Resend API key.
- [ ] Merge PR #1 into `main` and switch Railway to deploy `main`.
