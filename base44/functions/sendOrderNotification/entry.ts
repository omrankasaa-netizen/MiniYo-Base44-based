import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (!event || event.type !== 'update') {
      return Response.json({ ok: true }, { status: 200 });
    }

    const order = data;
    if (!order || !order.customer_email && !order.email) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const email = order.customer_email || order.email;
    const resendKey = Deno.env.get('RESEND_API_KEY');

    if (!resendKey) {
      console.error('RESEND_API_KEY not set');
      return Response.json({ ok: true }, { status: 200 });
    }

    // Status-specific email templates
    const templates = {
      New: {
        subject: `Order Confirmed: ${order.order_number} - MiniYo`,
        html: `
          <h2>Thank you for your order!</h2>
          <p>Order #${order.order_number} has been received.</p>
          <p><strong>Amount:</strong> $${order.grand_total_usd?.toFixed(2)}</p>
          <p>We'll notify you when your order ships.</p>
        `,
      },
      Confirmed: {
        subject: `Order Confirmed: ${order.order_number} - MiniYo`,
        html: `
          <h2>Your order has been confirmed!</h2>
          <p>Order #${order.order_number} is confirmed and being prepared.</p>
          <p><strong>Amount:</strong> $${order.grand_total_usd?.toFixed(2)}</p>
        `,
      },
      Packed: {
        subject: `Order Packed: ${order.order_number} - MiniYo`,
        html: `
          <h2>Your order is packed and ready!</h2>
          <p>Order #${order.order_number} has been packed and will ship soon.</p>
        `,
      },
      'Out for Delivery': {
        subject: `Out for Delivery: ${order.order_number} - MiniYo`,
        html: `
          <h2>Your order is out for delivery!</h2>
          <p>Order #${order.order_number} is on its way to you.</p>
          <p>Expected delivery: Today</p>
        `,
      },
      Delivered: {
        subject: `Delivered: ${order.order_number} - MiniYo`,
        html: `
          <h2>Your order has been delivered!</h2>
          <p>Order #${order.order_number} was delivered.</p>
          <p>Thank you for shopping with MiniYo! <a href="https://minyo.com/account/orders">View Order</a></p>
        `,
      },
    };

    const template = templates[order.order_status];
    if (!template) {
      return Response.json({ ok: true }, { status: 200 });
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'orders@minyo.com',
        to: email,
        subject: template.subject,
        html: template.html,
      }),
    });

    if (!res.ok) {
      console.error('Resend error:', await res.text());
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (error) {
    console.error('Order notification error:', error.message);
    return Response.json({ ok: true }, { status: 200 });
  }
});