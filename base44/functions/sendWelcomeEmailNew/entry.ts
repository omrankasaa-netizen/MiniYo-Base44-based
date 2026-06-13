import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Resend } from 'npm:resend@4.0.1';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { customer_id, email, name } = await req.json();

    if (!customer_id || !email) {
      return Response.json({ error: 'customer_id and email required' }, { status: 400 });
    }

    // Check idempotency
    const existingLogs = await base44.asServiceRole.entities.EmailLog.filter({
      email_type: 'welcome',
      customer_id,
      status: 'sent'
    }, 'sent_at', 1);

    if (existingLogs.length > 0) {
      return Response.json({ status: 'already_sent', message: 'Welcome email already sent' });
    }

    // Detect language from browser or default to EN
    const lang = 'en'; // Can be enhanced to detect from user settings
    const isAr = lang === 'ar';
    const senderEmail = 'management@miniyo.store';
    const subject = isAr ? 'مرحباً بك في MiniYo' : 'Welcome to MiniYo';

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
    .logo { font-size: 32px; font-weight: bold; color: #2F5D57; margin-bottom: 10px; }
    .content { background: white; padding: 30px; border-radius: 16px; border: 1px solid #E5E5E5; }
    .welcome-heading { font-size: 28px; color: #2F5D57; text-align: center; margin-top: 0; }
    .benefit-box { background: #FAF7F2; padding: 20px; border-radius: 12px; margin: 20px 0; border-left: 4px solid #2F5D57; }
    .benefit-title { font-weight: 600; color: #2F5D57; margin: 0 0 8px 0; }
    .benefit-text { margin: 0; color: #666; font-size: 14px; }
    .cta-button { display: inline-block; background: #2F5D57; color: white; padding: 14px 32px; text-decoration: none; border-radius: 12px; margin-top: 20px; font-weight: 600; }
    .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">MiniYo</div>
    </div>

    <div class="content">
      <h1 class="welcome-heading">${isAr ? 'مرحباً بك! 🎉' : 'Welcome! 🎉'}</h1>
      <p style="text-align: center; color: #666; font-size: 16px;">
        ${isAr ? 'شكراً لانضمامك إلى عائلة MiniYo' : 'Thank you for joining the MiniYo family'}
      </p>

      <div style="margin: 30px 0; text-align: center;">
        <p style="color: #666;">${isAr ? 'أنت الآن عضو برونزي مع مزايا حصرية!' : 'You\'re now a Bronze member with exclusive benefits!'}</p>
      </div>

      <div class="benefit-box">
        <p class="benefit-title">💝 ${isAr ? 'اثنتا توصيل مجاني' : '2 Free Deliveries'}</p>
        <p class="benefit-text">${isAr ? 'استمتع بـ مجاني على أول طلبين لك' : 'Get free shipping on your first two orders'}</p>
      </div>

      <div class="benefit-box">
        <p class="benefit-title">🎁 ${isAr ? 'خصم 5%' : '5% Discount'}</p>
        <p class="benefit-text">${isAr ? 'احصل على 5% خصم على جميع الطلبات' : 'Enjoy 5% off all purchases'}</p>
      </div>

      <div class="benefit-box">
        <p class="benefit-title">⬆️ ${isAr ? 'الترقية تلقائياً' : 'Auto-upgrade'}</p>
        <p class="benefit-text">${isAr ? 'ارقَ إلى Silver و Gold مع المزيد من المزايا' : 'Upgrade to Silver & Gold tiers for more benefits'}</p>
      </div>

      <center>
        <a href="https://miniyo.store/shop" class="cta-button">
          ${isAr ? 'ابدأ التسوق' : 'Start Shopping'} →
        </a>
      </center>

      <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #E5E5E5; text-align: center; font-size: 13px; color: #999;">
        ${isAr ? 'نحن هنا لمساعدتك. تواصل معنا عبر WhatsApp أو البريد الإلكتروني' : 'We\'re here to help. Reach out via WhatsApp or email'}
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
      to: email,
      subject,
      html,
    });

    // Log the email
    const logRecord = await base44.asServiceRole.entities.EmailLog.create({
      email_type: 'welcome',
      recipient_email: email,
      subject,
      customer_id,
      status: emailRes.error ? 'failed' : 'sent',
      error_message: emailRes.error ? JSON.stringify(emailRes.error) : null,
      sent_at: new Date().toISOString(),
      trigger_event: 'account_created',
    });

    if (emailRes.error) {
      return Response.json({ status: 'failed', error: emailRes.error }, { status: 500 });
    }

    return Response.json({ status: 'sent', id: emailRes.id, log_id: logRecord.id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});