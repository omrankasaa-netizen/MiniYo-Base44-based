# Product images: optimization & Cloudflare R2 storage

MiniYo optimizes every uploaded product image and can store it on **Cloudflare
R2** (durable, S3-compatible object storage) served over a CDN — instead of the
server's local disk.

## Why

Serving raw, unoptimized images from the server's local disk is slow (no resize
/ compression, no CDN) and **unreliable on Railway**: Railway's filesystem is
ephemeral, so any image written to `/uploads` is **lost on every redeploy /
restart** unless a persistent volume is mounted. With R2 configured, images live
in object storage and **persist across redeploys** — fixing the "dead photos"
problem.

## What happens on upload

Both the single-image admin upload (`POST /api/upload`) and the bulk-import
photos-zip path run every image through the same pipeline (`sharp`):

1. Auto-rotate from EXIF, then strip metadata.
2. Resize **down** to a set of widths — never upscale.
3. Re-encode as **WebP** (quality ~80).

Three derivatives are produced and stored as separate objects under a per-image
base key:

| Variant | Max width | Used by                                   |
|---------|-----------|-------------------------------------------|
| `large` | 1600px    | Product detail main image                 |
| `card`  | 600px     | Storefront grid card / in-card carousel   |
| `thumb` | 300px     | Detail-page thumbnail strip               |

The `ProductImage` record stores the canonical (`card`) URL in `url`/`image_url`
plus a `variants: { large, card, thumb }` map so the frontend picks the
right-sized image per context. **Legacy records** (a plain string URL or a
`{url}` object with no `variants`) still render — the frontend falls back to the
single URL.

If `sharp` fails on a particular file (corrupt / unsupported), that file is
stored **as-is** (flagged `optimized:false`) rather than aborting the upload or
the whole bulk import.

## Storage backends

A small adapter (`server/storage.js`) selects the backend **once at boot** from
env vars and logs which one is active:

- **`local`** (default / fallback): writes under `<repo>/uploads`, served by
  Express at `/uploads`. This is the original behavior and what runs in local
  dev with no R2 configured.
- **`r2`**: writes objects to an R2 bucket via the AWS S3 SDK and builds public
  URLs from `R2_PUBLIC_BASE_URL`.

R2 is used **only when every required var is present**; otherwise it falls back
to local disk. If R2 client init fails, it also falls back to local disk and
logs the error (the storefront never goes down because of a storage misconfig).

## Environment variables

| Var | Required | Description |
|-----|----------|-------------|
| `R2_ACCOUNT_ID` | yes | Cloudflare account ID. |
| `R2_ACCESS_KEY_ID` | yes | R2 API token access key ID. |
| `R2_SECRET_ACCESS_KEY` | yes | R2 API token secret. |
| `R2_BUCKET` | yes | Bucket name, e.g. `miniyo-images`. |
| `R2_PUBLIC_BASE_URL` | yes | Public base URL for image `src` links (public `r2.dev` URL or a Cloudflare custom domain). No trailing slash. |
| `R2_ENDPOINT` | no | S3 API endpoint. Derived from the account ID when omitted: `https://<account_id>.r2.cloudflarestorage.com`. |

> These are **new** vars — they do not overload the existing `MINIYO_*` vars.
> With **none** of them set, the app builds and runs exactly as before, writing
> optimized derivatives to local `/uploads`.

## Cloudflare R2 setup

1. **Create the bucket.** Cloudflare dashboard → **R2** → *Create bucket* (e.g.
   `miniyo-images`). Note your **Account ID** (R2 overview page) → `R2_ACCOUNT_ID`.
2. **Create an API token.** R2 → *Manage R2 API Tokens* → *Create API token* with
   **Object Read & Write** permission for the bucket. Copy the **Access Key ID**
   → `R2_ACCESS_KEY_ID` and **Secret Access Key** → `R2_SECRET_ACCESS_KEY`.
3. **Make the bucket public** (so `<img>` can load images), one of:
   - **Public r2.dev URL**: bucket → *Settings* → *Public access* → enable
     `r2.dev` → use that URL as `R2_PUBLIC_BASE_URL`, **or**
   - **Custom domain** (recommended for production / caching): bucket →
     *Settings* → *Custom Domains* → add e.g. `images.miniyokids.com` (Cloudflare
     creates the DNS + CDN) → use `https://images.miniyokids.com` as
     `R2_PUBLIC_BASE_URL`.
4. **Set `R2_BUCKET`** to the bucket name.
5. **Set the Railway variables** (Railway → your service → *Variables*):
   `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`,
   `R2_PUBLIC_BASE_URL` (and optionally `R2_ENDPOINT`). Redeploy.
6. **Verify** the boot log shows `[storage] backend=r2 bucket=… endpoint=…`.
   New uploads now resolve to `R2_PUBLIC_BASE_URL/...`.

> **Existing databases / host changes:** image URLs are stored ABSOLUTE at
> upload time. If older rows still point at the bucket's raw
> `https://pub-*.r2.dev` host, you do NOT need manual SQL — at every boot
> `server/r2HostMigration.js` runs an idempotent `REPLACE` across every
> image-bearing table (`Product`, `ProductImage`, `ProductVariant`, `Category`,
> `Collection`, `CmsSection`, `MediaAsset`, `SiteSetting`, `Review`, `Campaign`)
> rewriting the legacy prefix onto the runtime `R2_PUBLIC_BASE_URL`. Just set
> the variable to the custom domain and redeploy; the boot log prints
> `[r2-host-migration] … rewrote N row(s)`.

### Optional: Cloudflare Image Resizing

If you enable Cloudflare Image Resizing on the custom domain you can also request
on-the-fly sizes via `/cdn-cgi/image/...` URLs. This is **optional** — the
`sharp`-generated `large`/`card`/`thumb` derivatives are the primary mechanism
and work without Cloudflare Images.

## Local development

Do nothing. With no R2 vars set, uploads are optimized to WebP derivatives and
written to `/uploads` (git-ignored), served by Express — identical URLs to before
(`/uploads/products/<id>/card.webp`).
