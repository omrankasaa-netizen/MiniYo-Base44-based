import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (!event || event.type !== 'create') {
      return Response.json({ ok: true }, { status: 200 });
    }

    const user = data;
    if (!user || !user.email) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (!resendKey) {
      console.error('RESEND_API_KEY not set');
      return Response.json({ ok: true }, { status: 200 });
    }

    const firstName = user.full_name?.split(' ')[0] || 'Friend';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'hello@minyo.com',
        to: user.email,
        subject: 'Welcome to MiniYo! 👶',
        html: `
          <h2>Welcome to MiniYo, ${firstName}!</h2>
          <p>We're thrilled to have you join our community of parents who love quality kids clothing.</p>
          <p><strong>What's inside:</strong></p>
          <ul>
            <li>Exclusive deals on premium baby & kids fashion</li>
            <li>New arrivals curated for Lebanese families</li>
            <li>Member rewards & loyalty tiers</li>
            <li>Direct WhatsApp support</li>
          </ul>
          <p><a href="https://minyo.com/shop" style="display: inline-block; padding: 12px 28px; background: #2F5D57; color: white; text-decoration: none; border-radius: 12px; font-weight: bold;">Start Shopping</a></p>
          <p style="margin-top: 32px; font-size: 12px; color: #666;">Questions? Reply to this email or WhatsApp us anytime. We're here to help! 💚</p>
        `,
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', await res.text());
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Welcome email error:', error.message);
    return Response.json({ ok: true }, { status: 200 });
  }
});