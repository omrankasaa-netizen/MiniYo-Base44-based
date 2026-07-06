# MiniYo — Meta Pixel + Conversions API + Catalog Feed

Production tracking setup for the MiniYo storefront: browser Pixel events, a
server-side Conversions API (CAPI) Purchase event, a Meta catalog product feed,
event deduplication, and marketing-consent gating.

## Canonical identifier — always the product SKU

`content_ids`, `contents[].id`, the feed `id` column, and
`product:retailer_item_id` (server-injected JSON-LD, see `server/productMeta.js`)
**all use `Product.sku`** (e.g. `TONGS-5456-MULTI`). `OrderItem.sku` carries the
same value, so order line items map cleanly to catalog entries and conversion
events. Never use the internal uuid `id` or the `prod-` `product_id`.

---

## 1. Event plan

| Event | Fires when | Source | content_ids | contents | value | currency | extra |
|---|---|---|---|---|---|---|---|
| PageView | Every route load (initial + SPA route change) | Pixel | — | — | — | — | — |
| ViewContent | PDP mount | Pixel | `[sku]` | `[{id:sku, quantity:1, item_price:price_usd}]` | `price_usd` | USD | `content_name`, `content_category` |
| Search | Search term settles on the shop page | Pixel | matched skus (optional) | — | — | — | `search_string` |
| AddToCart | Add to cart (card quick-add **or** PDP) via `useCart().addItem` | Pixel | `[sku]` | `[{id:sku, quantity, item_price}]` | line value | USD | `content_name` |
| InitiateCheckout | Checkout page mount with a non-empty cart | Pixel | all cart skus | cart lines `[{id, quantity, item_price}]` | cart subtotal | USD | `num_items` |
| AddPaymentInfo | N/A — the store is Cash on Delivery (COD); there is no payment-info step. Documented as not applicable; wire in later if a payment-method capture step is added. | — | — | — | — | — | — |
| **Purchase** | Order completed — **server-side (CAPI) only**, never from the browser | CAPI | order line skus | order items `[{id:sku, quantity, item_price:unit_price_usd}]` | `grand_total_usd` | USD | `order_id = order_number`, `num_items` |

### Parameters present on every event

- `event_name`, `event_time` (unix seconds), `event_id` (unique per logical
  event; **shared** between Pixel and CAPI for dedup where both fire),
  `action_source` (`"website"`), `event_source_url`.
- `user_data` (Purchase/CAPI): `em` and `ph` are **SHA-256 hashed** after
  normalization (email lowercased/trimmed; phone reduced to E.164 digits);
  `client_ip_address` + `client_user_agent` read from the request; `fbp`/`fbc`
  read from the `_fbp`/`_fbc` cookies. IP/UA/fbp/fbc are **never** hashed. Raw
  and hashed PII are **never logged**.
- `custom_data`: `content_ids`, `content_type: "product"`, `value`,
  `currency: "USD"`, `contents`, plus `order_id` on Purchase.

### Where each event lives

- Browser helpers: `src/lib/metaPixel.js` (`trackViewContent`, `trackAddToCart`,
  `trackInitiateCheckout`, `trackSearch`, `notifyPurchase`, `genEventId`).
- Low-level fbq + consent gate: `src/lib/pixel.js`.
- AddToCart is fired once, centrally, inside `CartContext.addItem`, so both the
  storefront card quick-add and the PDP add button emit it.
- Server CAPI: `server/metaCapiClient.js` (transport + hashing) and
  `server/metaPurchase.js` (Purchase builders), wired at `POST /api/meta/purchase`
  in `server/index.js`.

---

## 2. Browser Pixel

The base fbq snippet + `fbq('init', …)` live in `index.html` and load before
React. Consent is **revoked before init** so no cookies/events fire until the
visitor accepts. `src/lib/pixel.js` re-grants on load when a prior `granted`
choice is stored, and `PixelPageView` fires PageView on first load and every
route change.

The public Pixel ID (`1480243427454221`) is baked into `index.html`.
`VITE_META_PIXEL_ID` documents/overrides it for non-prod builds
(`metaPixel.META_PIXEL_ID`). The Pixel ID is **public** — it is safe in the
client bundle. The CAPI access token is **never** in the client bundle.

### Shared event_id for Purchase dedup

At checkout submit the browser generates a UUID (`genEventId()`) and stores it on
the order as `meta_event_id` (along with `meta_consent`). After the order and its
line items are persisted, the browser calls `notifyPurchase(order.id)` →
`POST /api/meta/purchase`. The server reuses the stored `meta_event_id` as the
Purchase `event_id`. The browser **does not** send Purchase.

---

## 3. Conversions API (backend)

`server/metaCapiClient.js` exports `sendCapiEvent({ eventName, eventId, userData,
customData, eventTime, eventSourceUrl, actionSource })`. It:

- Reads `MINIYO_META_PIXEL_ID`, `MINIYO_META_CAPI_ACCESS_TOKEN`, and
  `MINIYO_META_TEST_EVENT_CODE` from env.
- POSTs to `https://graph.facebook.com/v21.0/{PIXEL_ID}/events` with
  `{ data:[event], test_event_code?, access_token }`.
- SHA-256 hashes normalized email/phone; passes ip/ua/fbp/fbc through unhashed.
- Logs the response (`events_received`, `fbtrace_id`, `messages`) and errors —
  **never** the access token or any raw/hashed PII.
- Returns a result object and never throws into the order flow. If the token is
  unset it no-ops (`skipped: "no_token"`), so builds/tests need no secret.

### `POST /api/meta/purchase`

Fires Purchase from **trusted order data**. The request body carries only
`order_id`; the server loads the `Order` and its `OrderItem`s from the DB and
builds value/contents/contact from those records — nothing money-related is
trusted from the client, so the event cannot be spoofed. It:

1. Returns `{deduped:true}` if the order already has `meta_purchase_sent`.
2. Skips (`no_consent`) when `order.meta_consent === false`.
3. Builds `contents` from OrderItems (`{id:sku, quantity, item_price:unit_price_usd}`),
   `value = grand_total_usd`, `currency` (default `USD`), `order_id = order_number`,
   `num_items`.
4. Skips (`invalid_value`) unless `value` is a finite number > 0.
5. Reads IP (honoring Cloudflare `CF-Connecting-IP`, then `X-Forwarded-For`), UA,
   and `_fbp`/`_fbc` cookies for `user_data`.
6. Reuses `order.meta_event_id` as the Purchase `event_id` (deterministic
   fallback `purchase-{order_number}` when absent).
7. Marks `meta_purchase_sent` **only on a confirmed send**, so a transient
   failure retries later with the same event_id.

---

## 4. Deduplication & QA

### How dedup works

Meta deduplicates when a Pixel event and its CAPI twin arrive with the same
`event_id` **and** `event_name` inside the dedup window. Because Purchase fires
from CAPI only (no browser Purchase), it can never double from the Pixel. The
deterministic per-order `event_id` still guarantees that CAPI **retries** for the
same order collapse into one Purchase. Pixel-only events (ViewContent,
AddToCart, InitiateCheckout, Search) each get a fresh id per fire.

### Safeguards implemented

- **Idempotent Purchase** — `meta_purchase_sent` flag on the order prevents a
  second send; if it must re-fire, the same `event_id` is reused.
- **Currency guard** — always `USD` (defaulted when missing).
- **Consistent content_ids** — always the sku; sku-less lines are skipped, never
  sent as `undefined` (`buildContents`).
- **Value validation** — Purchase is sent only when `value > 0`.

### Testing with Events Manager Test Events

1. In Events Manager → your Pixel → **Test Events**, copy the test code.
2. Set `MINIYO_META_TEST_EVENT_CODE` in Railway and redeploy.
3. Place a test order; the Purchase appears in the Test Events tab in real time.
4. Confirm `user_data` shows hashed match keys and `event_id` matches the order.
5. **Unset `MINIYO_META_TEST_EVENT_CODE`** when finished so live events stop
   routing to test mode.

### QA checklist

- [ ] PageView fires on first load and on each SPA route change (only after Accept).
- [ ] ViewContent on a PDP has `content_ids:[sku]` and the correct `value`.
- [ ] AddToCart fires from **both** the card quick-add and the PDP add button.
- [ ] InitiateCheckout has all cart skus, `value`, and `num_items`.
- [ ] Search fires with `search_string` after the term settles.
- [ ] Purchase appears **only** server-side; none from the browser.
- [ ] Purchase `event_id` equals the order's `meta_event_id`.
- [ ] Re-hitting `/api/meta/purchase` for the same order returns `deduped:true`.
- [ ] Declining the cookie banner suppresses all Pixel fires **and** CAPI.
- [ ] Feed `id` matches the sku used in events + JSON-LD.
- [ ] No access token or PII in server logs or the client bundle.

---

## 5. Catalog + product feed

`GET /meta-feed.csv` streams a CSV built from the products DB
(`server/metaFeed.js`), served as `text/csv` with `Cache-Control: public,
max-age=3600` for Meta's scheduled fetch.

Columns: `id` (=sku), `title`, `description` (HTML stripped), `availability`,
`condition` (`new`), `price` (`"18.99 USD"`), `sale_price`, `link`, `image_link`,
`brand` (`MiniYo`), `google_product_category`, `product_type`, `gender`,
`age_group`, `size`, `color`.

Decisions / conservative mappings:

- **availability** — `Active` → `in stock`; non-Active → `out of stock`.
  Variant-parent products (`has_variants`) keep product-level `stock_quantity` at
  0 while real stock lives on variants, so an Active variant-parent is treated as
  `in stock` (matches the storefront's own behavior).
- **sale_price** — only when `compare_at_price_usd > price_usd`; then
  `price = compare_at` and `sale_price = current price`. Otherwise omitted.
- **gender / age_group** — mapped only for unambiguous source values
  (Boys/Girls/Unisex → male/female/unisex; Newborn/Baby/Toddler/Kids →
  newborn/infant/toddler/kids). Unknown values are left blank, never guessed.
- **google_product_category / product_type** — left **blank** (never invented).
- **size / color** — one representative value (first pipe-delimited token); one
  row per product. A per-variant feed is a future enhancement.

### Commerce Manager setup

1. Create a Catalog in **Meta Commerce Manager** (type: e-commerce).
2. **Add data source → Data feed → Scheduled feed** → paste
   `https://miniyokids.com/meta-feed.csv` → set a daily schedule.
3. Connect the Catalog to the Pixel (`1480243427454221`) so catalog + events tie
   together for dynamic ads.
4. Verify the feed `id` matches `content_ids` — this is what powers matching.

---

## 6. Consent gating

The cookie banner stores its choice under the `miniyo-consent` localStorage key.
`src/lib/metaConsent.js` parses it (DOM-free, unit-tested) and understands both
the legacy `'granted'`/`'denied'` string and a forward-compatible
`{ "marketing": true }` object. `hasMarketingConsent()` (in `pixel.js`, re-exported
from `metaPixel.js`) is the single gate:

- **Pixel** — `track()` no-ops unless `hasMarketingConsent()` is true; init also
  keeps Meta Consent Mode revoked until Accept, so no `_fbp`/`_fbc` cookies are set.
- **CAPI** — the browser records `meta_consent` on the order at checkout; the
  server skips the Purchase CAPI event when `meta_consent === false`.

Backward compatible: the existing banner keeps writing `'granted'`/`'denied'` and
continues to work unchanged.

---

## Environment variables (set in Railway)

| Name | Scope | Secret? | Notes |
|---|---|---|---|
| `MINIYO_META_PIXEL_ID` | backend | no | Public Pixel ID. Defaults to `1480243427454221`. |
| `MINIYO_META_CAPI_ACCESS_TOKEN` | backend | **yes** | Conversions API token. Never commit; never in client/logs. |
| `MINIYO_META_TEST_EVENT_CODE` | backend | no | Optional; routes events to Events Manager Test Events. Unset in normal prod. |
| `VITE_META_PIXEL_ID` | frontend build | no | Public Pixel ID for the client build. Defaults to `1480243427454221`. |

See `.env.example` for the documented (value-free) list.
