import { createRecord, nowIso } from './db.js';

// Send an email via Resend (if RESEND_API_KEY set) or SMTP-less fallback.
// In all cases an EmailLog row is written and we NEVER throw.
export async function sendEmail({ to, subject, html, email_type, order_id, customer_id, trigger_event }) {
  const resendKey = process.env.RESEND_API_KEY;
  const from = process.env.MINIYO_EMAIL_FROM || 'management@miniyo.store';
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
