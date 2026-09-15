// Pure helpers for the admin Products page "Bulk edit" panel.
//
// A bulk edit applies one update payload to every selected product. Fields the
// operator leaves on "no change" are simply omitted from the payload, so a
// bulk edit can never accidentally wipe data it wasn't meant to touch.
//
// Tags are a free-form comma-separated string on Product (see shopFilters.js).
// Adding/removing a tag therefore needs the product's CURRENT tag string —
// buildBulkUpdate receives the product and merges tags case-insensitively.
//
// Pure functions — no DB, no network. Unit-tested in tests/bulkEdit.test.js.

// Parse a CSV tag string into trimmed, non-empty tokens (order preserved).
export function parseTags(tagsStr) {
  return String(tagsStr || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// Serialize tokens back to the canonical "a, b, c" form.
export function serializeTags(tokens) {
  return tokens.join(', ');
}

// Case-insensitive contains check.
function hasTag(tokens, tag) {
  const needle = tag.trim().toLowerCase();
  return tokens.some((t) => t.toLowerCase() === needle);
}

// Add a tag (trimmed, deduped case-insensitively). Returns the same string
// unchanged when the tag is empty or already present.
export function addTag(tagsStr, tag) {
  const t = String(tag || '').trim();
  const tokens = parseTags(tagsStr);
  if (!t || hasTag(tokens, t)) return serializeTags(tokens);
  return serializeTags([...tokens, t]);
}

// Remove ALL occurrences of a tag (case-insensitive).
export function removeTag(tagsStr, tag) {
  const t = String(tag || '').trim().toLowerCase();
  if (!t) return serializeTags(parseTags(tagsStr));
  return serializeTags(parseTags(tagsStr).filter((x) => x.toLowerCase() !== t));
}

// Tri-state fields in the panel use '' = no change.
const NO_CHANGE = '';

// Build the Product.update payload for one product from the bulk-edit form.
//
//   form = {
//     category_id: '' | id,          // '' = no change
//     gender:      '' | value,
//     age_group:   '' | value,
//     is_new:      '' | 'yes' | 'no',
//     is_featured: '' | 'yes' | 'no',
//     add_tag:     string,           // optional tag to add
//     remove_tag:  string,           // optional tag to remove
//   }
//
// Returns the update object, or null when the form changes NOTHING for this
// product (so the caller can skip the network write entirely).
export function buildBulkUpdate(form, product) {
  const update = {};

  if (form.category_id !== NO_CHANGE) update.category_id = form.category_id;
  if (form.gender !== NO_CHANGE) update.gender = form.gender;
  if (form.age_group !== NO_CHANGE) update.age_group = form.age_group;
  if (form.is_new === 'yes') update.is_new = true;
  if (form.is_new === 'no') update.is_new = false;
  if (form.is_featured === 'yes') update.is_featured = true;
  if (form.is_featured === 'no') update.is_featured = false;

  const add = String(form.add_tag || '').trim();
  const remove = String(form.remove_tag || '').trim();
  if (add || remove) {
    // Remove runs first so "move" semantics work (remove old season tag, add new).
    let tags = removeTag(product?.tags, remove);
    tags = addTag(tags, add);
    if (tags !== String(product?.tags || '')) update.tags = tags;
  }

  return Object.keys(update).length > 0 ? update : null;
}
