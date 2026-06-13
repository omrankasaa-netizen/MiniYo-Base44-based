import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { action, customer_id, order_grand_total, user_email } = await req.json();

    if (action === 'grant_bronze_credits') {
      // Called on customer registration
      const settings = await base44.asServiceRole.entities.MembershipSettings.list();
      const config = settings[0] || { bronze_credits: 2 };
      
      const expiresAt = config.credit_expiry_days && config.credit_expiry_days > 0
        ? new Date(Date.now() + config.credit_expiry_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      for (let i = 0; i < config.bronze_credits; i++) {
        await base44.asServiceRole.entities.FreeDeliveryCredit.create({
          customer_id,
          source_tier: 'Bronze',
          granted_at: new Date().toISOString(),
          expires_at: expiresAt,
          status: 'available'
        });
      }

      await base44.asServiceRole.entities.Customer.update(customer_id, {
        current_tier: 'Bronze',
        free_delivery_credits_remaining: config.bronze_credits
      });

      return Response.json({ success: true, creditsGranted: config.bronze_credits });
    }

    if (action === 'check_tier_upgrade') {
      // Called after order is placed; checks if customer crossed a threshold
      const customer = await base44.asServiceRole.entities.Customer.get(customer_id);
      if (!customer) return Response.json({ error: 'Customer not found' }, { status: 404 });

      const settings = await base44.asServiceRole.entities.MembershipSettings.list();
      const config = settings[0] || {
        silver_threshold_usd: 100,
        silver_credits: 4,
        gold_threshold_usd: 250,
        gold_credits: 6
      };

      const spend = customer.lifetime_spend_usd || 0;
      const currentTier = customer.current_tier || 'Bronze';

      const expiresAt = config.credit_expiry_days && config.credit_expiry_days > 0
        ? new Date(Date.now() + config.credit_expiry_days * 24 * 60 * 60 * 1000).toISOString()
        : null;

      let upgraded = false;

      // Check Silver upgrade
      if (currentTier !== 'Gold' && spend >= config.silver_threshold_usd && !customer.silver_granted) {
        for (let i = 0; i < config.silver_credits; i++) {
          await base44.asServiceRole.entities.FreeDeliveryCredit.create({
            customer_id,
            source_tier: 'Silver',
            granted_at: new Date().toISOString(),
            expires_at: expiresAt,
            status: 'available'
          });
        }
        await base44.asServiceRole.entities.Customer.update(customer_id, {
          current_tier: 'Silver',
          silver_granted: true,
          free_delivery_credits_remaining: (customer.free_delivery_credits_remaining || 0) + config.silver_credits
        });
        upgraded = true;
      }

      // Check Gold upgrade
      if (spend >= config.gold_threshold_usd && !customer.gold_granted) {
        for (let i = 0; i < config.gold_credits; i++) {
          await base44.asServiceRole.entities.FreeDeliveryCredit.create({
            customer_id,
            source_tier: 'Gold',
            granted_at: new Date().toISOString(),
            expires_at: expiresAt,
            status: 'available'
          });
        }
        await base44.asServiceRole.entities.Customer.update(customer_id, {
          current_tier: 'Gold',
          gold_granted: true,
          free_delivery_credits_remaining: (customer.free_delivery_credits_remaining || 0) + config.gold_credits
        });
        upgraded = true;
      }

      return Response.json({ upgraded, newTier: customer.current_tier });
    }

    if (action === 'consume_credit') {
      // Consume one available credit for an order
      const credits = await base44.asServiceRole.entities.FreeDeliveryCredit.filter(
        { customer_id, status: 'available' },
        'granted_at',
        1
      );

      if (credits.length === 0) {
        return Response.json({ consumed: false, reason: 'No available credits' });
      }

      const credit = credits[0];
      await base44.asServiceRole.entities.FreeDeliveryCredit.update(credit.id, {
        status: 'used',
        used_at: new Date().toISOString(),
        used_on_order: ''
      });

      const customer = await base44.asServiceRole.entities.Customer.get(customer_id);
      await base44.asServiceRole.entities.Customer.update(customer_id, {
        free_delivery_credits_remaining: Math.max(0, (customer.free_delivery_credits_remaining || 1) - 1)
      });

      return Response.json({ consumed: true, creditsRemaining: customer.free_delivery_credits_remaining - 1 });
    }

    if (action === 'expire_old_credits') {
      // Scheduled task to mark expired credits
      const settings = await base44.asServiceRole.entities.MembershipSettings.list();
      const config = settings[0];

      if (!config || !config.credit_expiry_days || config.credit_expiry_days <= 0) {
        return Response.json({ expired: 0 });
      }

      const credits = await base44.asServiceRole.entities.FreeDeliveryCredit.filter(
        { status: 'available' },
        '-granted_at',
        1000
      );

      let expiredCount = 0;
      const now = new Date();

      for (const credit of credits) {
        if (credit.expires_at && new Date(credit.expires_at) < now) {
          await base44.asServiceRole.entities.FreeDeliveryCredit.update(credit.id, { status: 'expired' });
          
          // Decrement customer's available count
          const customer = await base44.asServiceRole.entities.Customer.get(credit.customer_id);
          if (customer && customer.free_delivery_credits_remaining > 0) {
            await base44.asServiceRole.entities.Customer.update(credit.customer_id, {
              free_delivery_credits_remaining: customer.free_delivery_credits_remaining - 1
            });
          }
          expiredCount++;
        }
      }

      return Response.json({ expired: expiredCount });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});