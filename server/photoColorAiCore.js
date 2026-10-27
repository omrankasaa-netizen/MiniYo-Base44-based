// Pure prompt/validation/planning logic for Gemini photo-color analysis.
// Network and catalog access live in photoColorAssign.js so this file remains
// dependency-free and directly unit-testable.

export const MIN_AI_CONFIDENCE = 0.6;

export const PHOTO_COLOR_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    matches: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          imageIndex: { type: 'INTEGER' },
          colorKey: { type: 'STRING' },
          confidence: { type: 'NUMBER' },
          pattern: { type: 'STRING' },
          reason: { type: 'STRING' },
        },
        required: ['imageIndex', 'colorKey', 'confidence', 'pattern', 'reason'],
      },
    },
  },
  required: ['matches'],
};

export function buildPhotoColorPrompt(product, swatches, imageCount) {
  const colors = swatches.filter((s) => !s.image).map((s) => ({
    colorKey: s.key,
    label: s.label,
    referenceHexes: s.hexes,
  }));
  return `You are assigning catalog photos to the exact color or pattern variant of ONE MiniYo clothing product.

Product name: ${String(product.name || '').trim()}
Product type: ${String(product.category_name || product.category || 'clothing').trim()}
There are ${imageCount} photos. The first inline image has imageIndex 0, the second has imageIndex 1, and so on.

Allowed variants (colorKey values must be copied EXACTLY):
${JSON.stringify(colors, null, 2)}

Evaluate every photo independently. Identify the actual sellable garment or textile, not the background, packaging, furniture, skin, hair, props, or other clothing. Compare all photos and variants together. Pattern and print labels such as Dino, Floral, Stars, or Giraffe are meaningful variants even when referenceHexes is empty. Two-tone labels require the pictured product to contain both tones. A lifestyle photo and a studio photo can represent the same variant.

Return one match for each photo whose variant is visually clear. Multiple photos may match the same colorKey. Never assign one photo to multiple variants. Do not invent labels or colorKey values. If no allowed variant is clearly correct, omit that photo. Confidence must be calibrated between 0 and 1; omit guesses below ${MIN_AI_CONFIDENCE}. pattern is a short visual descriptor such as solid, striped, floral, dino, color-block, or mixed. reason is a short factual explanation of the garment evidence, not a generic statement.`;
}

function cleanText(value, max) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

// Accept only known product/photo/color combinations. Existing assignments are
// excluded again here even though they were omitted from the prompt. If Gemini
// accidentally returns duplicate rows for one photo, only the strongest survives.
export function normalizeAiMatches(raw, { productId, images, swatches }) {
  const byImage = new Map();
  const matches = Array.isArray(raw?.matches) ? raw.matches : [];
  for (const match of matches.slice(0, images.length * 2)) {
    const index = match?.imageIndex;
    const confidence = Number(match?.confidence);
    if (!Number.isInteger(index) || index < 0 || index >= images.length) continue;
    if (!Number.isFinite(confidence) || confidence < MIN_AI_CONFIDENCE || confidence > 1) continue;
    const swatch = swatches.find((s) => s.key === match?.colorKey && !s.image);
    const imageUrl = images[index]?.url || images[index]?.image_url;
    if (!swatch || typeof imageUrl !== 'string' || !imageUrl.trim()) continue;
    const row = {
      productId,
      imageUrl: imageUrl.trim(),
      suggestion: {
        key: swatch.key,
        label: swatch.label,
        confidence: Math.round(confidence * 100) / 100,
        pattern: cleanText(match.pattern, 80) || 'not specified',
        reason: cleanText(match.reason, 240),
        source: 'gemini',
      },
    };
    const previous = byImage.get(index);
    if (!previous || row.suggestion.confidence > previous.suggestion.confidence) byImage.set(index, row);
  }
  return [...byImage.values()];
}

// Pick the clearest photo for each still-empty variant. This is deliberately a
// dry-run plan; persistence is a separate, re-validated admin operation.
export function planAiAssignments(rows, product) {
  const best = new Map();
  for (const row of rows) {
    const key = row.suggestion.key;
    const current = best.get(key);
    if (!current || row.suggestion.confidence > current.suggestion.confidence) best.set(key, row);
  }
  return [...best.values()].map((row) => ({
    productId: row.productId,
    productName: product.name,
    colorKey: row.suggestion.key,
    label: row.suggestion.label,
    imageUrl: row.imageUrl,
    confidence: row.suggestion.confidence,
    pattern: row.suggestion.pattern,
    reason: row.suggestion.reason,
    source: 'gemini',
  })).sort((a, b) => b.confidence - a.confidence);
}
