// Shared helpers for admin Export CSV / Print / WhatsApp actions.
//
// CSV export: the server builds the CSV text (money columns stripped server-side
// for non-super-admins) and the client just downloads it via a Blob. Print:
// opens a clean, audit-ready window (MiniYo header + date + table) and triggers
// the browser print dialog. WhatsApp: builds a wa.me click-to-chat link.

import { base44 } from '@/api/base44Client';

// Default country code applied to local numbers that have no international
// prefix. MiniYo is based in Lebanon (+961). CHANGE THIS ONE CONSTANT to move
// the default to another country.
export const DEFAULT_COUNTRY_CODE = '961';

// Invoke a server CSV builder and download the returned text as a .csv file.
// Returns the row count on success; throws on failure (caller shows the error).
export async function downloadCsv(functionName, opts = {}) {
  const res = await base44.functions.invoke(functionName, opts);
  const { filename, csv, rows } = res.data || {};
  const blob = new Blob([csv || ''], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'miniyo-export.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return rows ?? 0;
}

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Open a print-friendly window with a MiniYo header, the current date and a
// table built from `columns` (array of header strings) and `rows` (array of
// arrays). The caller is responsible for omitting money columns when the user
// is not a super-admin, mirroring the server-side gating.
export function printTable({ title, columns, rows, meta }) {
  const win = window.open('', '_blank');
  if (!win) return false;
  const date = new Date().toLocaleString();
  const head = columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
    .join('');
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; margin: 24px; }
  .brand { font-size: 22px; font-weight: 700; color: #2F5D57; }
  h1 { font-size: 16px; margin: 4px 0 2px; }
  .meta { font-size: 12px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  thead th { background: #FAF7F2; }
  tr:nth-child(even) td { background: #fafafa; }
  @media print { body { margin: 0; } .noprint { display: none; } }
</style></head><body>
  <div class="brand">MiniYo</div>
  <h1>${escapeHtml(title)}</h1>
  <div class="meta">Generated ${escapeHtml(date)}${meta ? ' · ' + escapeHtml(meta) : ''} · ${rows.length} row(s)</div>
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <script>window.onload = function () { window.print(); };<\/script>
</body></html>`);
  win.document.close();
  return true;
}

// Build a wa.me click-to-chat URL from a phone number and an optional prefilled
// message. Non-digits are stripped; a number with no country code gets the
// DEFAULT_COUNTRY_CODE prepended (leading 0 is dropped first).
export function whatsappLink(phone, message) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (!String(phone).trim().startsWith('+') && !digits.startsWith(DEFAULT_COUNTRY_CODE)) {
    digits = digits.replace(/^0+/, '');
    digits = DEFAULT_COUNTRY_CODE + digits;
  }
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

// Default greeting for a customer WhatsApp message.
export function whatsappGreeting(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || 'there';
  return `Hello ${first}, this is MiniYo. `;
}
