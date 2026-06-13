import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Admin check
    if (user?.role !== 'admin' && user?.role !== 'super_admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Check if zones already exist
    const existingZones = await base44.asServiceRole.entities.ShippingZone.list('sort_order', 100);
    if (existingZones.length > 0) {
      return Response.json({ message: 'Zones already exist', count: existingZones.length }, { status: 200 });
    }

    // Seed default zones
    const defaultZones = [
      { area_name: 'Tripoli', area_name_ar: 'طرابلس', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 0 },
      { area_name: 'Koura', area_name_ar: 'الكورة', fee_usd: 4, is_active: true, is_catchall: false, sort_order: 1 },
      { area_name: 'Beirut', area_name_ar: 'بيروت', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 2 },
      { area_name: 'Akkar', area_name_ar: 'عكار', fee_usd: 5, is_active: true, is_catchall: false, sort_order: 3 },
      { area_name: 'All other areas / districts', area_name_ar: 'جميع المناطق الأخرى', fee_usd: 6, is_active: true, is_catchall: true, sort_order: 99 },
    ];

    const created = await base44.asServiceRole.entities.ShippingZone.bulkCreate(defaultZones);
    return Response.json({ message: 'Default zones seeded', count: created.length }, { status: 200 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});