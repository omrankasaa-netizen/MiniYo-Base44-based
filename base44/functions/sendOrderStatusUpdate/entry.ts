import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Resend } from 'npm:resend@4.0.1';

const STATUS_TEMPLATES = {
  'Confirmed': {
    en: { subject: 'Order Confirmed', icon: '✓', message: 'Your order has been confirmed and we\'re preparing it for shipment.' },
    ar: { subject: 'تم تأكيد طلبك', icon: '✓', message: 'تم تأكيد طلبك وجاري تحضيره للشحن.' }
  },
  'Packed': {
    en: { subject: 'Order Packed', icon: '📦', message: 'Your order has been packed and is ready to ship.' },
    ar: { subject: 'تم تغليف الطلب', icon: '📦', message: 'تم تغليف طلبك وهو جاهز للشحن.' }
  },
  'Out for Delivery': {
    en: { subject: 'Out for Delivery', icon: '🚚', message: 'Your order is on its way to you.' },
    ar: { subject: 'جارٍ التسليم', icon: '🚚', message: 'طلبك في طريقه إليك.' }
  },
  'Delivered': {
    en: { subject: 'Order Delivered', icon: '🎉', message: 'Your order has been delivered. We hope you enjoy!' },
    ar: { subject: 'تم تسليم الطلب', icon: '🎉', message: 'تم تسليم طلبك. نتمنى أن تستمتع به!' }
  },
  'Cancelled': {
    en: { subject: 'Order Cancelled', icon: '✕', message: 'Your order has been cancelled. If you have any questions, please contact us.' },
    ar: { subject: 'تم إلغاء الطلب', icon: '✕', message: 'تم إلغاء طلبك. إذا كان لديك أي أسئلة، يرجى التواصل معنا.' }
  }
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id, new_status } = await req.json();

    if (!order_id || !new_status) {
      return Response.json({ error: 'order_id and new_status required' }, { status: 400 });
    }

    if (!STATUS_TEMPLATES[new_status]) {
      return Response.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Fetch order
    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check idempotency
    const existingLogs = await base44.asServiceRole.entities.EmailLog.filter({
      email_type: 'order_status_update',
      order_id,
      status: 'sent',
      trigger_event: `status_changed_to_${new_status}`
    }, 'sent_at', 1);

    if (existingLogs.length > 0) {
      return Response.json({ status: 'already_sent', message: `${new_status} email already sent` });
    }

    const lang = order.lang || 'en';
    const isAr = lang === 'ar';
    const template = STATUS_TEMPLATES[new_status][isAr ? 'ar' : 'en'];
    const senderEmail = 'management@miniyo.store';

    const html = `
<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${template.subject}</title>
  <style>
    body { font-family: Poppins, Arial, sans-serif; color: #2B2B2B; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #FAF7F2; padding: 40px 20px; }
    .content { background: white; padding: 30px; border-radius: 16px; border: 1px solid #E5E5E5; }
    .status-icon { font-size: 48px; text-align: center; margin-bottom: 20px; }
    h2 { text-align: center; color: #2F5D57; margin: 0 0 10px 0; }
    .message { text-align: center; color: #666; font-size: 16px; margin-bottom: 30px; }
    .order-info { background: #FAF7F2; padding: 20px; border-radius: 12px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #E5E5E5; }
    .info-row:last-child { border-bottom: none; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="content">
      <div class="status-icon">${template.icon}</div>
      <h2>${template.subject}</h2>
      <p class="message">${template.message}</p>

      <div class="order-info">
        <div class="info-row">
          <span>${isAr ? 'رقم الطلب' : 'Order #'}</span>
          <span style="font-weight: 600;">${order.order_number}</span>
        </div>
        <div class="info-row">
          <span>${isAr ? 'الحالة' : 'Status'}</span>
          <span style="font-weight: 600; color: #2F5D57;">${new_status}</span>
        </div>
        <div class="info-row">
          <span>${isAr ? 'المجموع' : 'Total'}</span>
          <span style="font-weight: 600;">$${order.grand_total_usd.toFixed(2)}</span>
        </div>
      </div>

      <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E5E5; text-align: center; font-size: 13px; color: #999;">
        ${isAr ? 'لأي أسئلة، تواصل معنا عبر WhatsApp' : 'For any questions, contact us via WhatsApp'}
      </p>
    </div>
  </div>
</body>
</html>
    `;

    // Send email
    const resend = new Resend({ auth: Deno.env.get('RESEND_API_KEY') });
    const emailRes = await resend.emails.send({
      from: senderEmail,
      to: order.customer_email,
      subject: template.subject,
      html,
    });

    // Log the email
    const logRecord = await base44.asServiceRole.entities.EmailLog.create({
      email_type: 'order_status_update',
      recipient_email: order.customer_email,
      subject: template.subject,
      order_id,
      status: emailRes.error ? 'failed' : 'sent',
      error_message: emailRes.error ? JSON.stringify(emailRes.error) : null,
      sent_at: new Date().toISOString(),
      trigger_event: `status_changed_to_${new_status}`,
    });

    if (emailRes.error) {
      return Response.json({ status: 'failed', error: emailRes.error }, { status: 500 });
    }

    return Response.json({ status: 'sent', id: emailRes.id, log_id: logRecord.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});