import test from 'node:test';
import assert from 'node:assert/strict';
import { aiProductDraft } from '../server/aiDraft.js';
import { initSchema } from '../server/db.js';

initSchema();

// The dedicated aiProductDraft HTTP route supplies admin authentication. This
// test proves the AI action reaches photoColorAssign instead of falling through
// to the product-drafting validator (which would return "No images provided").
test('protected AI gateway delegates photoColorAssign actions', async () => {
  const previous = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  try {
    const result = await aiProductDraft({ action: 'photoColorAssign', productId: 'verification-only' });
    assert.deepEqual(result, { _status: 503, error: 'Gemini analysis is not configured on the server.' });
  } finally {
    if (previous === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = previous;
  }
});
