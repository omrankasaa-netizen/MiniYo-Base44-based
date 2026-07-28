function recordTs(record) {
  const ts = Date.parse(record?.updated_date || record?.created_date || '');
  return Number.isFinite(ts) ? ts : 0;
}

export function pickLatestByKey(records, keyField) {
  const latest = {};
  for (const record of records || []) {
    const key = record?.[keyField];
    if (!key) continue;
    const current = latest[key];
    if (!current || recordTs(record) >= recordTs(current)) {
      latest[key] = record;
    }
  }
  return latest;
}

