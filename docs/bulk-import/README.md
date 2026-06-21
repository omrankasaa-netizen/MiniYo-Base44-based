# MiniYo Bulk Product Import

Create or update many products at once from a spreadsheet (`.xlsx` or `.csv`)
plus an optional `.zip` of product photos. Use it from the admin panel:
**Admin → Bulk Import** (`/admin/bulk-import`).

The workflow is **Preview → Import**:

1. Fill the template spreadsheet (one row per product).
2. (Optional) Put the product photos in a `.zip`, naming each file the way you
   referenced it in the `images` column.
3. In the admin Bulk Import page, choose the spreadsheet (and the zip if you
   have one) and click **Preview**. This runs a dry-run that validates every
   row and tells you how many products would be **created** vs **updated**, and
   lists any per-row warnings/errors — **without changing anything**.
4. If the preview looks right, click **Import** to apply the changes.

Re-uploading a corrected sheet later is safe: products are matched by **SKU**,
so a second import **updates** the existing products instead of duplicating
them.

---

## The template

Download it from the admin Bulk Import page, or use the committed copies:

- `docs/bulk-import/MiniYo_Bulk_Import_Template.xlsx`
- `docs/bulk-import/MiniYo_Bulk_Import_Template.csv`

Keep the **header row exactly as-is** (column names are matched case-insensitively).
Each following row is one product. The example rows are clearly marked `SAMPLE-…`
— delete them before importing your real data.

### Columns

| Column | Required | Meaning |
| --- | --- | --- |
| `sku` | **Yes** | Stable unique code. This is the key used to match a row to an existing product. Re-import with the same SKU to update it. |
| `handle` | No | URL slug. Derived from `name_en` (or `sku`) if left blank. |
| `name_en` | **Yes*** | English product name. (*At least one of `name_en` / `name_ar` is required.) |
| `name_ar` | No | Arabic product name. |
| `description_en` | No | Long English description. |
| `description_ar` | No | Long Arabic description. |
| `short_description_en` | No | One-line English pitch. |
| `short_description_ar` | No | One-line Arabic pitch. |
| `category` | No | Category name or slug. Matched to an existing category; if not found, it is **created**. |
| `subcategory` | No | Sub-category name or slug (created under `category` if new). |
| `gender` | No | `Girls`, `Boys`, or `Unisex`. |
| `age_group` | No | `Newborn`, `Baby`, `Toddler`, or `Kids`. |
| `price` | **Yes** | Selling price in USD per single piece (e.g. `12` or `12.99`). |
| `compare_at_price` | No | Original price for a strikethrough (leave blank if not on sale). |
| `cost` | No | Your landed/cost price (admin-only, never shown to customers). |
| `is_new` | No | `true`/`false` (also accepts `1`/`0`, `yes`/`no`). Default `false`. |
| `is_trending` | No | Same boolean format. Default `false`. |
| `is_featured` | No | Same boolean format. Default `false`. |
| `is_active` | No | `true` → product is **Active** (visible); `false` → **Hidden**. Default `true`. |
| `video_url` | No | Optional product video URL. |
| `tags` | No | Comma-separated tags. |
| `sizes` | No | Size/stock list — see below. |
| `images` | No | Image filenames or URLs — see below. |

### `sizes` column format

A single cell holding `size:stock` pairs separated by commas:

```
0-3M:5, 3-6M:8, 6-9M:3
```

- `0-3M:5` means size **0-3M** with **5** in stock.
- Each pair becomes a **ProductVariant** row, and the product is marked as
  having variants.
- Leave the cell **blank** for a one-size / no-variant product.

Optional **color** dimension — prefix the size with `color|`:

```
Pink|0-3M:5, Pink|3-6M:2, Blue|0-3M:3
```

This creates per-color/size variants. The product's `sizes` and `colors`
summary fields are filled from the distinct values found.

### `images` column format

A single cell with **comma-separated** image references, in display order:

```
SAMPLE-001_1.jpg, SAMPLE-001_2.jpg
```

- The **first** image becomes the product's **primary** photo.
- Filenames must match files inside the uploaded **images zip** (matched by the
  bare filename, so nested folders in the zip are fine).
- A value that starts with `http://` or `https://` is attached as a **URL**
  directly (no zip needed for that one).
- You can mix zip filenames and URLs in the same cell.

Images are uploaded to the same `/uploads` store the rest of the admin uses, so
the storefront's 3:4 auto-fit card works out of the box (default centre focal,
no crop).

---

## Upsert behavior (what happens on import)

Matching is by **`sku`** (falling back to `handle`/slug):

- **New SKU →** a new Product is created, with its variants and images.
- **Existing SKU →** that product is **updated in place** (never duplicated):
  - Product fields are overwritten from the sheet.
  - Variants are **updated** (existing size/color) or **added** (new size/color).
    Variants present on the product but missing from the sheet are **kept** by
    default (safe). Tick *"Remove sizes not in the sheet"* in the admin to prune
    them instead.
  - Images:
    - If the `images` column **has values**, that product's images are
      **replaced** with the new set.
    - If the `images` column is **blank**, existing images are **left
      untouched** — so photos you adjusted manually in the admin are preserved.

Rows are validated independently: one bad row (missing SKU, bad price, missing
image file, …) is reported and skipped — it never aborts the whole import.

---

## Removing the demo / seed products

The app ships with demo products (seeded from `server/data/catalog.csv`). The
Bulk Import page has a **"Remove demo/seed products"** button (with a
confirmation) that deletes **only** those seeded products and their
variants/images. Products you created in the admin or imported with this tool
are tagged differently and are **never** removed by that button. It is safe to
run more than once (idempotent).

---

## Tips

- Keep one master spreadsheet. To fix prices/stock/photos later, edit the same
  rows (same SKUs) and re-import — it updates, never duplicates.
- To temporarily hide a product without deleting it, set `is_active` to `false`.
- Prices are **per single piece** in USD.

## Image storage & optimization

Photos from the zip are automatically **optimized** (resized + compressed to
WebP, with `large`/`card`/`thumb` derivatives) and stored via the configured
backend. With **Cloudflare R2** configured they persist across Railway redeploys;
with no R2 vars set they fall back to the local `/uploads` disk. See
[../IMAGES.md](../IMAGES.md) for the full setup and env vars.
