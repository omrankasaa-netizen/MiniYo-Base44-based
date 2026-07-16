# MiniYo — TikTok Catalog Product Feed

`GET /tiktok-feed.csv` streams a CSV product catalog built from the products DB
(`server/tiktokFeed.js`), served as `text/csv; charset=utf-8` with
`Cache-Control: public, max-age=3600` for TikTok's scheduled fetch.

Production URL: **https://miniyokids.com/tiktok-feed.csv**

It mirrors the Meta feed (`GET /meta-feed.csv`, see [META_TRACKING.md](./META_TRACKING.md#5-catalog--product-feed))
and reuses the same product query, price/availability logic, image URL,
title/description sourcing, and RFC-4180 CSV escaping. The only intentional
differences are the TikTok column names/order and the populated
`google_product_category` / `product_type` fields.

## Columns (TikTok Catalog spec)

`sku_id` (=Product.sku), `title`, `description` (HTML stripped), `availability`,
`condition` (`new`), `price` (`"18.99 USD"`), `sale_price`, `link`, `image_link`,
`brand` (`MiniYo`), `google_product_category`, `product_type`, `item_group_id`.

`sku_id` and `item_group_id` both use the normalized SKU
(`String(sku).trim().toUpperCase()`), the same identifier used as `content_ids`
in the TikTok Pixel/Events API events — so catalog entries match conversion
events for dynamic product ads.

## Why this feed exists — two fixes over the old catalog

1. **Price currency.** The store sells in **USD**. The previous TikTok catalog
   expected a different currency (JOD), so every product was rejected with
   *"Invalid value: price"*. This feed emits `price` as `"<amount> USD"`
   (identical to the Meta feed's format) so TikTok accepts every row. **The
   TikTok Catalog currency must be set to USD.**
2. **Missing category.** The old catalog logged a warning on every item for a
   missing `google_product_category`/`product_type`. This feed derives a Google
   Product Taxonomy string for every product (never blank).

## Category mapping

`google_product_category` is derived by keyword-matching the product's DB
category / subcategory / name (first match wins), falling back to a conservative
baby-apparel default so a row is **never** emitted blank:

| Signal (keyword) | google_product_category |
|---|---|
| socks | `Apparel & Accessories > Clothing > Underwear & Socks > Socks` |
| bathrobe / robe | `Apparel & Accessories > Clothing > Sleepwear & Loungewear > Robes` |
| pajama / sleepwear | `Apparel & Accessories > Clothing > Sleepwear & Loungewear` |
| swaddle / muslin | `Baby & Toddler > Nursing & Feeding` |
| bib / burp | `Baby & Toddler > Nursing & Feeding > Baby Bibs & Burp Cloths` |
| pacifier / teether | `Baby & Toddler > Nursing & Feeding > Pacifiers & Teethers` |
| blanket | `Baby & Toddler > Nursery > Baby & Toddler Blankets` |
| towel / cloth / tissue | `Baby & Toddler > Nursing & Feeding` |
| hairband / clip / pompom | `Apparel & Accessories > Clothing Accessories > Hair Accessories` |
| hat / cap / bonnet | `Apparel & Accessories > Clothing Accessories > Hats` |
| collar | `Apparel & Accessories > Clothing Accessories` |
| dress / overall / bodysuit / set / … | `Apparel & Accessories > Clothing > Baby & Toddler Clothing` |
| *(no match)* | `Apparel & Accessories > Clothing > Baby & Toddler Clothing` (default) |

`product_type` is a human-readable breadcrumb built from the DB category /
subcategory (e.g. `Apparel > Footed Overall`).

Other mappings (`availability`, `sale_price`, `price`) are the exact same logic
as the Meta feed — see [META_TRACKING.md](./META_TRACKING.md#5-catalog--product-feed).

## TikTok Catalog Manager setup

1. In **TikTok Catalog Manager**, create a catalog (type: E-commerce /
   Products) and set its **currency to USD**.
2. **Add products → Use a data feed → Scheduled feed** → paste
   `https://miniyokids.com/tiktok-feed.csv` → set a **daily** schedule so the
   catalog stays in sync with the products DB.
3. Connect the catalog to the TikTok Pixel so catalog + events tie together for
   dynamic product ads. `sku_id` matches the `content_id` sent by the events.
