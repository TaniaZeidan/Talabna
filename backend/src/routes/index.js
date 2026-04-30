const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');

const auth     = require('../controllers/auth.controller');
const vendor   = require('../controllers/vendor.controller');
const order    = require('../controllers/order.controller');
const delivery = require('../controllers/delivery.controller');
const admin    = require('../controllers/admin.controller');
const customer = require('../controllers/customer.controller');
const notif    = require('../controllers/notification.controller');

/* ----------- Public auth (FR-C1, FR-C2) ----------- */
router.post('/auth/register', auth.register);
router.post('/auth/login',    auth.login);
router.get ('/auth/me',       authenticate, auth.me);

/* ----------- Public browsing (FR-C3) ----------- */
router.get('/vendors',        vendor.listVendors);
router.get('/vendors/:id',    vendor.getVendor);
router.get('/products',       vendor.listProducts);
router.get('/vendors/:id/reviews', customer.vendorReviews);

/* ----------- Vendor-only (FR-V2..FR-V6) ----------- */
router.get   ('/vendor/products',   authenticate, requireRole('vendor'), vendor.myProducts);
router.post  ('/vendor/products',   authenticate, requireRole('vendor'), vendor.createProduct);
router.put   ('/vendor/products/:id', authenticate, requireRole('vendor'), vendor.updateProduct);
router.delete('/vendor/products/:id', authenticate, requireRole('vendor'), vendor.deleteProduct);

router.get  ('/vendor/orders',          authenticate, requireRole('vendor'), order.vendorOrders);
router.post ('/vendor/orders/:id/confirm', authenticate, requireRole('vendor'), order.confirmOrder);
router.post ('/vendor/orders/:id/reject',  authenticate, requireRole('vendor'), order.rejectOrder);
router.post ('/vendor/orders/:id/prepare', authenticate, requireRole('vendor'), order.updatePrepStatus);
router.get  ('/vendor/analytics',       authenticate, requireRole('vendor'), vendor.analytics);

/* ----------- Customer-only (FR-C4..C9) ----------- */
router.post('/orders',            authenticate, requireRole('customer'), order.placeOrder);
router.get ('/orders/me',         authenticate, requireRole('customer'), order.myOrders);
router.get ('/orders/:id',        authenticate, order.getOrder);

router.get ('/loyalty/me',        authenticate, requireRole('customer'), customer.myLoyalty);
router.post('/reviews',           authenticate, requireRole('customer'), customer.submitReview);
router.get ('/recommendations',   authenticate, requireRole('customer'), customer.recommend);

// Shared cart / group order (FR-C8)
router.post  ('/carts',                  authenticate, requireRole('customer'), customer.createSharedCart);
router.post  ('/carts/join',             authenticate, requireRole('customer'), customer.joinSharedCart);
router.get   ('/carts/:id',              authenticate, requireRole('customer'), customer.viewSharedCart);
router.post  ('/carts/:id/items',        authenticate, requireRole('customer'), customer.addItemToSharedCart);
router.delete('/carts/:id/items/:itemID',authenticate, requireRole('customer'), customer.removeItemFromSharedCart);
router.post  ('/carts/:id/checkout',     authenticate, requireRole('customer'), customer.checkoutSharedCart);

/* ----------- Driver-only (FR-D2..FR-D4) ----------- */
router.get ('/driver/available',           authenticate, requireRole('driver'), delivery.availableDeliveries);
router.get ('/driver/deliveries',          authenticate, requireRole('driver'), delivery.myDeliveries);
router.post('/driver/deliveries/:id/accept', authenticate, requireRole('driver'), delivery.acceptDelivery);
router.post('/driver/deliveries/:id/status', authenticate, requireRole('driver'), delivery.updateDeliveryStatus);
router.post('/driver/deliveries/:id/issue',  authenticate, requireRole('driver'), delivery.reportIssue);

/* ----------- Admin-only (FR-A2..FR-A5) ----------- */
router.get ('/admin/vendors/pending',  authenticate, requireRole('admin'), admin.pendingVendors);
router.post('/admin/vendors/:id/approve', authenticate, requireRole('admin'), admin.approveVendor);
router.post('/admin/vendors/:id/reject',  authenticate, requireRole('admin'), admin.rejectVendor);

router.get ('/admin/users',            authenticate, requireRole('admin'), admin.listUsers);
router.post('/admin/users/:id/suspend',  authenticate, requireRole('admin'), admin.suspendUser);
router.post('/admin/users/:id/reactivate', authenticate, requireRole('admin'), admin.reactivateUser);

router.get ('/admin/activity',         authenticate, requireRole('admin'), admin.activitySummary);
router.get ('/admin/reports',          authenticate, requireRole('admin'), admin.reports);

/* ----------- Notifications ----------- */
router.get ('/notifications',          authenticate, notif.list);
router.post('/notifications/:id/read', authenticate, notif.markRead);

module.exports = router;
