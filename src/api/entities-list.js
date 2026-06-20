// Entity names the frontend talks to. Must match server/db.js ENTITIES.
// ProductImage records may carry optional non-destructive framing metadata
// (focal: {x,y}; crop: {x,y,width,height}, all normalized 0..1) consumed by the
// storefront 3:4 card and admin preview. The generic API persists these without
// any field allow-list, so no backend change is needed to save them.
export const ENTITIES = [
  'AuditLog', 'Campaign', 'Category', 'CmsSection', 'Collection', 'Customer',
  'CustomerAddress', 'Discount', 'EmailLog', 'Faq', 'FreeDeliveryCredit',
  'InventoryMovement', 'MediaAsset', 'MembershipHistory', 'MembershipSettings',
  'Order', 'OrderItem', 'OrderStatusHistory', 'Overhead', 'Product',
  'ProductImage', 'ProductVariant', 'PromoCode', 'Purchase', 'Review',
  'ShippingZone', 'SiteSetting', 'User', 'WishlistItem',
];
