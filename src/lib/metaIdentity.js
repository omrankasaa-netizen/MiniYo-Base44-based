// Shared, DOM-free Meta identity helpers. fbc is a click-attribution signal,
// not PII, and Meta expects it unhashed as fb.1.{creationTime_ms}.{fbclid}.
export function isValidMetaFbc(value) {
  return typeof value === 'string' && /^fb\.1\.\d{13,}\..+/.test(value);
}

export function firstValidMetaFbc(...candidates) {
  return candidates.find(isValidMetaFbc);
}

// Anonymous-only initialization must never erase hashed matching fields saved
// from a previous checkout. Newly computed fields win; existing fields survive.
export function mergeMetaAdvancedMatching(stored, updates) {
  return {
    ...(stored && typeof stored === 'object' ? stored : {}),
    ...(updates && typeof updates === 'object' ? updates : {}),
  };
}
