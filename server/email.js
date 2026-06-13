import { createRecord, nowIso } from './db.js';

// Send an email via Resend (if RESEND_API_KEY set) or SMTP-less fallback.
// In all cases an EmailLog row is written and we NEVER throw.
// Normalize a `from` value into a Resend-valid `Name <email>` or `email` form.
// Strips stray quotes/whitespace and validates an email is present; falls back safely.
export function normalizeFrom(raw) {
  const fallback = 'MiniYo <onboarding@resend.dev>';
  if (!raw) return fallback;
  let v = String(raw).trim().replace(/^["']|["']$/g, '').trim();
  // Extract any email-looking token.
  const emailMatch = v.match(/[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+/);
  if (!emailMatch) return fallback;
  const email = emailMatch[0];
  // If value already has a display name like `Name <email>`, normalize spacing.
  const nameMatch = v.match(/^(.*?)<\s*[^<>]+\s*>$/);
  if (nameMatch && nameMatch[1].trim()) {
    const name = nameMatch[1].trim().replace(/^["']+|["']+$/g, '').trim();
    if (name) return `${name} <${email}>`;
    return email;
  }
  return email;
}

export async function sendEmail({ to, subject, html, email_type, order_id, customer_id, trigger_event }) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = normalizeFrom(process.env.MINIYO_EMAIL_FROM);
  let status = 'pending';
  let error_message = null;

  if (resendKey) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, html }),
      });
      if (res.ok) {
        status = 'sent';
      } else {
        status = 'failed';
        error_message = await res.text().catch(() => 'send failed');
      }
    } catch (e) {
      status = 'failed';
      error_message = e?.message || 'send error';
    }
  } else {
    // No mail provider configured — record it as logged so the flow succeeds.
    status = 'sent';
    error_message = 'logged_only_no_provider';
  }

  const log = createRecord('EmailLog', {
    email_type,
    recipient_email: to,
    subject,
    order_id: order_id || '',
    customer_id: customer_id || '',
    status,
    error_message,
    sent_at: nowIso(),
    trigger_event: trigger_event || '',
  });

  return { status, log_id: log.id, error_message };
}
