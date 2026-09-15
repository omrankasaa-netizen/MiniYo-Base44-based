// Pure core for the "Add by Photos" AI product-draft feature (server/aiDraft.js
// does the network part). Everything here is deterministic and unit-tested —
// no Gemini calls, no DB, no network.
//
// Flow: the admin uploads product photos; Gemini Flash reads each photo and
// returns a structured JSON draft (name EN/AR, description, category, gender,
// age group, tags, color, SKU hint). The server then normalizes + validates
// the draft against the LIVE catalog (existing categories, tag vocabulary,
// SKU uniqueness) before the admin ever sees it.

export const VALID_GENDERS = ['Girls', 'Boys', 'Unisex'];
export const VALID_AGES = ['Newborn', 'Baby', 'Toddler', 'Kids'];

// ─── Prompt ─────────────────────────────────────────────────────────────────
// The prompt is built per-request with the store's ACTUAL category list and
// tag vocabulary so the model reuses existing taxonomy instead of inventing
// near-duplicates ("Romper" vs "Rompers").
export function buildDraftPrompt({ categories = [], tagVocabulary = [] } = {}) {
  const catList = categories.length
    ? categories.map((c) => `- ${c.name}${c.name_ar && c.name_ar !== c.name ? ` (${c.name_ar})` : ''}`).join('\n')
    : '(no categories exist yet)';
  const tagList = tagVocabulary.length ? tagVocabulary.join(', ') : '(none yet)';

  return `You are the product-catalog assistant for MiniYo (miniyokids.com), a Lebanese baby & kids clothing store (cash on delivery, bilingual English + Lebanese Arabic).

Look at this product photo and draft the catalog entry as JSON.

Rules:
- name: concise English product name (e.g. "Baby Girls Floral Romper — Dusty Pink"). Include color if it distinguishes the item.
- name_ar: the same name in natural Lebanese Arabic (as spoken/written in Lebanon, not formal MSA).
- description: 1–2 English sentences, warm premium tone, focused on what is VISIBLE (design, print, fit, closure type).
- description_ar: the same in natural Lebanese Arabic.
- NEVER claim fabric composition, certifications, or safety properties (e.g. "organic cotton", "hypoallergenic") unless a label in the photo explicitly says so. When unsure, leave fabric out of the description.
- category: pick the SINGLE best match from the store's existing categories listed below (copy the name exactly). Only if none fits, suggest a short new one.
Existing categories:
${catList}
- gender: exactly one of ${VALID_GENDERS.join(', ')}.
- age_group: exactly one of ${VALID_AGES.join(', ')} (judge by the garment's size/style).
- color: the main color, one or two words.
- tags: 2–5 lowercase merchandising tags. STRONGLY prefer reusing the store's existing tag vocabulary below (e.g. season, product family). Add a new tag only when nothing fits.
Existing tag vocabulary: ${tagList}
- sizes: the typical size run you would expect for this item (e.g. ["0-3M","3-6M","6-9M"] for baby, ["2-3Y","3-4Y"] for toddler). This is only a SUGGESTION for the operator — leave empty if the photo shows packaging/labels with explicit sizes, in which case use those.
- sku_hint: short uppercase SKU suggestion, letters/digits/dashes only, max 24 chars (e.g. "ROMP-FLORAL-PNK"). Do not invent brand codes you cannot see.
- notes: one short line flagging anything you are unsure about (empty string if confident).

Return ONLY the JSON object.`;
}

// JSON schema passed to Gemini (responseMimeType: application/json). Kept as a
// plain object so tests can assert required fields stay in sync with parseDraft.
export const DRAFT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    name_ar: { type: 'string' },
    description: { type: 'string' },
    description_ar: { type: 'string' },
    category: { type: 'string' },
    gender: { type: 'string' },
    age_group: { type: 'string' },
    color: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    sizes: { type: 'array', items: { type: 'string' } },
    sku_hint: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['name', 'name_ar', 'category', 'gender', 'age_group', 'tags'],
};

// ─── Draft parsing & normalization ──────────────────────────────────────────
// Extract the first JSON object from a model response (tolerates accidental
// markdown fences / surrounding prose despite responseMimeType).
export function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

const clean = (v) => String(v ?? '').trim();

// Case-insensitive exact match against the store's category list.
function matchCategory(name, categories) {
  const n = clean(name).toLowerCase();
  if (!n) return null;
  return categories.find((c) => String(c.name).toLowerCase() === n) || null;
}

// Normalize one raw model draft into the shape the review UI edits.
// Returns { draft, issues[] } — issues are shown to the operator, never hidden.
export function normalizeDraft(raw, { categories = [], tagVocabulary = [] } = {}) {
  const issues = [];
  if (!raw || typeof raw !== 'object') {
    return { draft: null, issues: ['AI returned no usable draft'] };
  }

  const name = clean(raw.name);
  const nameAr = clean(raw.name_ar);
  if (!name && !nameAr) issues.push('AI could not name this product — fill the name manually');

  let gender = clean(raw.gender);
  if (gender && !VALID_GENDERS.includes(gender)) {
    issues.push(`AI suggested gender "${gender}" — please confirm`);
    gender = null;
  }
  let ageGroup = clean(raw.age_group);
  if (ageGroup && !VALID_AGES.includes(ageGroup)) {
    issues.push(`AI suggested age group "${ageGroup}" — please confirm`);
    ageGroup = null;
  }

  // Category: exact (case-insensitive) match → id; otherwise keep the AI's
  // suggestion as text so the UI can offer "create new category".
  const catRaw = clean(raw.category);
  const catMatch = matchCategory(catRaw, categories);
  if (catRaw && !catMatch) issues.push(`"${catRaw}" is not an existing category — pick one or create it`);

  // Tags: lowercase, deduped; flag any tag outside the existing vocabulary so
  // the operator knows it creates a new filter term on the storefront.
  const vocab = new Set(tagVocabulary.map((t) => String(t).toLowerCase()));
  const tags = [...new Set(
    (Array.isArray(raw.tags) ? raw.tags : [])
      .map((t) => clean(t).toLowerCase())
      .filter(Boolean),
  )];
  const newTags = tags.filter((t) => !vocab.has(t));

  const sizes = [...new Set(
    (Array.isArray(raw.sizes) ? raw.sizes : [])
      .map((s) => clean(s))
      .filter(Boolean),
  )];

  return {
    draft: {
      name,
      name_ar: nameAr,
      description: clean(raw.description),
      description_ar: clean(raw.description_ar),
      category_id: catMatch ? catMatch.id : '',
      category_suggestion: catMatch ? '' : catRaw,
      gender: gender || '',
      age_group: ageGroup || '',
      color: clean(raw.color),
      tags,
      new_tags: newTags,
      sizes,
      sku_hint: clean(raw.sku_hint),
      notes: clean(raw.notes),
    },
    issues,
  };
}

// ─── SKU ────────────────────────────────────────────────────────────────────
// Sanitize an AI SKU hint: uppercase, [A-Z0-9-] only, no leading/trailing dash.
export function sanitizeSku(v) {
  return clean(v)
    .toUpperCase()
    .replace(/[^A-Z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

// Guarantee uniqueness against existing SKUs (case-insensitive) by appending
// -2, -3, … Returns '' when no usable base exists (caller supplies a fallback).
export function ensureUniqueSku(base, takenLower) {
  const b = sanitizeSku(base);
  if (!b) return '';
  if (!takenLower.has(b.toLowerCase())) return b;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${b}-${i}`.slice(0, 28);
    if (!takenLower.has(candidate.toLowerCase())) return candidate;
  }
  return '';
}
