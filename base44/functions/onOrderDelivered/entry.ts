import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Called by entity automation when Order status changes to "Delivered"
// Updates customer totals and tier, logs membership change if tier upgraded.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const order = body.data;
    if (!order || order.order_status !== 'Delivered') {
      return Response.json({ skipped: true });
    }

    // Find customer by phone (how orders are linked without user_id)
    const customers = await base44.asServiceRole.entities.Customer.filter(
      { phone: order.customer_phone }, 'name', 1
    );
    if (customers.length === 0) {
      return Response.json({ skipped: true, reason: 'no customer found' });
    }
    const customer = customers[0];

    // Compute new totals
    const newTotalOrders = (customer.total_orders || 0) + 1;
    const newTotalSpent  = (customer.total_spent_usd || 0) + (order.grand_total_usd || 0);

    // Compute new tier
    const thresholds = { bronze: 0, silver: 500, gold: 1000, vip: 1500 };
    function computeTier(spent) {
      if (spent >= thresholds.vip)    return 'VIP';
      if (spent >= thresholds.gold)   return 'Gold';
      if (spent >= thresholds.silver) return 'Silver';
      return 'Bronze';
    }

    const oldTier = customer.membership_tier || 'Bronze';
    const newTier = computeTier(newTotalSpent);

    // Update customer
    await base44.asServiceRole.entities.Customer.update(customer.id, {
      total_orders:      newTotalOrders,
      total_spent_usd:   newTotalSpent,
      membership_tier:   newTier,
    });

    // Log tier change if upgraded
    if (newTier !== oldTier) {
      await base44.asServiceRole.entities.MembershipHistory.create({
        customer_id:            customer.id,
        user_id:                customer.user_id || null,
        old_tier:               oldTier,
        new_tier:               newTier,
        trigger_order_id:       order.id,
        total_spent_at_change:  newTotalSpent,
        changed_at:             new Date().toISOString(),
      });
    }

    return Response.json({ success: true, customerId: customer.id, newTier, newTotalSpent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});