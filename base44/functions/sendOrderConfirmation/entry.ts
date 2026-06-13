import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Resend } from 'npm:resend@4.0.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { order_id } = await req.json();

    if (!order_id) {
      return Response.json({ error: 'order_id required' }, { status: 400 });
    }

    // Fetch order and items
    const order = await base44.asServiceRole.entities.Order.get(order_id);
    if (!order) {
      return Response.json({ error: 'Order not found' }, { status: 404 });
    }

    // Check for idempotency — already sent?
    const existingLogs = await base44.asServiceRole.entities.EmailLog.filter({
      email_type: 'order_confirmation',
      order_id,
      status: 'sent'
    }, 'sent_at', 1);

    if (existingLogs.length > 0) {
      return Response.json({ status: 'already_sent', message: 'Confirmation email already sent for this order' });
    }

    // Fetch order items
    const items = await base44.asServiceRole.entities.OrderItem.filter({ order_id });

    // Fetch site settings for branding
    const settings = await base44.asServiceRole.entities.SiteSetting.filter({});
    const settingsMap = {};
    for (const s of settings) settingsMap[s.setting_key] = s.setting_value;

    const lang = order.lang || 'en';
    const isAr = lang === 'ar';
    const senderEmail = 'management@miniyo.store';
    const storeName = settingsMap.store_name || 'MiniYo';
    const subject = isAr ? 'تأكيد طلبك' : 'Order Confirmation';

    // Build email body
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: ${isAr ? 'right' : 'left'};">
          <p style="margin: 0; font-weight: 500; color: #2B2B2B;">${item.product_name}</p>
          ${item.size || item.color ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">${[item.size, item.color].filter(Boolean).join(' / ')}</p>` : ''}
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: center; color: #666;">×${item.quantity}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: ${isAr ? 'left' : 'right'}; color: #666;">$${item.unit_price_usd.toFixed(2)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e5e5; text-align: ${isAr ? 'left' : 'right'}; font-weight: 500; color: #2B2B2B;">$${item.line_total_usd.toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `
<!DOCTYPE html>
<html dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body { font-family: Poppins, Arial, sans-serif; color: #2B2B2B; line-height: 1.6; }
    .container { max-width: 600px; margin: 0 auto; background: #FAF7F2; padding: 40px 20px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; font-weight: bold; color: #2F5D57; margin-bottom: 10px; }
    .content { background: white; padding: 30px; border-radius: 16px; border: 1px solid #E5E5E5; }
    .order-number { font-size: 18px; font-weight: bold; color: #2F5D57; margin: 20px 0; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    .summary-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #E5E5E5; }
    .summary-total { font-size: 18px; font-weight: bold; color: #2F5D57; padding: 20px 0; display: flex; justify-content: space-between; }
    .track-button { display: inline-block; background: #2F5D57; color: white; padding: 12px 24px; text-decoration: none; border-radius: 12px; margin-top: 20px; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">${storeName}</div>
      <p style="color: #999; margin: 0;">${isAr ? 'شكراً لطلبك' : 'Thank you for your order'}</p>
    </div>

    <div class="content">
      <h2 style="color: #2F5D57; margin-top: 0;">${isAr ? 'تأكيد طلبك' : 'Order Confirmation'}</h2>
      <p style="color: #666;">${isAr ? 'سعدنا باستقبال طلبك. إليك تفاصيل الطلب:' : 'We\'ve received your order. Here are your order details:'}</p>

      <div class="order-number">
        ${isAr ? 'رقم الطلب' : 'Order #'}: <span style="color: #2F5D57;">${order.order_number}</span>
      </div>

      <table>
        <thead>
          <tr style="background: #FAF7F2;">
            <th style="padding: 12px; text-align: ${isAr ? 'right' : 'left'}; font-weight: 600; color: #2B2B2B;">${isAr ? 'المنتج' : 'Product'}</th>
            <th style="padding: 12px; text-align: center; font-weight: 600; color: #2B2B2B;">${isAr ? 'الكمية' : 'Qty'}</th>
            <th style="padding: 12px; text-align: ${isAr ? 'left' : 'right'}; font-weight: 600; color: #2B2B2B;">${isAr ? 'السعر' : 'Price'}</th>
            <th style="padding: 12px; text-align: ${isAr ? 'left' : 'right'}; font-weight: 600; color: #2B2B2B;">${isAr ? 'المجموع' : 'Total'}</th>
          </tr>
        </thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="background: #FAF7F2; padding: 20px; border-radius: 12px; margin: 20px 0;">
        <div class="summary-row">
          <span>${isAr ? 'المجموع الفرعي' : 'Subtotal'}</span>
          <span>$${order.subtotal_usd.toFixed(2)}</span>
        </div>
        ${order.discount_usd > 0 ? `<div class="summary-row">
          <span>${isAr ? 'الخصم' : 'Discount'}</span>
          <span style="color: #E8C7C4;">-$${order.discount_usd.toFixed(2)}</span>
        </div>` : ''}
        <div class="summary-row">
          <span>${isAr ? 'التوصيل' : 'Shipping'}</span>
          <span>${order.delivery_fee_usd === 0 ? (isAr ? 'مجاني' : 'Free') : '$' + order.delivery_fee_usd.toFixed(2)}</span>
        </div>
        <div class="summary-total">
          <span>${isAr ? 'المجموع' : 'Total'}</span>
          <span>$${order.grand_total_usd.toFixed(2)}</span>
        </div>
      </div>

      <div style="background: #E8C7C4; padding: 16px; border-radius: 12px; margin: 20px 0; color: #2B2B2B;">
        <p style="margin: 0; font-weight: 600;">🚚 ${isAr ? 'معلومات التسليم' : 'Delivery Info'}</p>
        <p style="margin: 8px 0 0 0; font-size: 14px;">
          ${isAr ? 'المنطقة' : 'Area'}: <strong>${order.delivery_zone}</strong><br>
          ${isAr ? 'الطريقة' : 'Method'}: <strong>${order.payment_method}</strong>
        </p>
      </div>

      <center>
        <a href="https://miniyo.store/track?order=${order.order_number}" class="track-button">
          ${isAr ? 'تتبع الطلب' : 'Track Your Order'} →
        </a>
      </center>

      <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E5E5; font-size: 13px; color: #999;">
        ${isAr ? 'شكراً لاختيارك MiniYo' : 'Thank you for choosing MiniYo'}
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
      subject,
      html,
    });

    // Log the email
    const logRecord = await base44.asServiceRole.entities.EmailLog.create({
      email_type: 'order_confirmation',
      recipient_email: order.customer_email,
      subject,
      order_id,
      status: emailRes.error ? 'failed' : 'sent',
      error_message: emailRes.error ? JSON.stringify(emailRes.error) : null,
      sent_at: new Date().toISOString(),
      trigger_event: 'order_created',
    });

    if (emailRes.error) {
      return Response.json({ status: 'failed', error: emailRes.error }, { status: 500 });
    }

    return Response.json({ status: 'sent', id: emailRes.id, log_id: logRecord.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});