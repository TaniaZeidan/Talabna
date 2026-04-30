const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { logAction } = require('../services/audit.service');
const { notify } = require('../services/notification.service');

/* ----------- FR-A2: approve / reject vendors ----------- */

exports.pendingVendors = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT v.vendorID, v.businessName, v.address, v.category, u.username, u.email, u.phone
    FROM vendors v
    JOIN users u ON v.userID = u.userID
    WHERE v.status = 'pending'
    ORDER BY v.vendorID DESC`);
  res.json(rows);
});

exports.approveVendor = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [[v]] = await db.query(
    'SELECT v.userID FROM vendors v WHERE v.vendorID = ?', [id]);
  if (!v) throw new AppError('Vendor not found', 404);

  await db.query("UPDATE vendors SET status = 'approved' WHERE vendorID = ?", [id]);
  await db.query("UPDATE users SET accountStatus = 'active' WHERE userID = ?", [v.userID]);

  await logAction(req.user.userID, 'VENDOR_APPROVED', `vendorID=${id}`);
  notify(v.userID, 'Your vendor account has been approved. You can now log in.');
  res.json({ message: 'Vendor approved' });
});

exports.rejectVendor = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const [[v]] = await db.query('SELECT userID FROM vendors WHERE vendorID = ?', [id]);
  if (!v) throw new AppError('Vendor not found', 404);

  await db.query("UPDATE vendors SET status = 'rejected' WHERE vendorID = ?", [id]);
  await logAction(req.user.userID, 'VENDOR_REJECTED', `vendorID=${id}`);
  notify(v.userID, 'Your vendor application was rejected.');
  res.json({ message: 'Vendor rejected' });
});

/* ----------- FR-A3: suspend / reactivate users ----------- */

exports.listUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  let sql = 'SELECT userID, username, email, role, accountStatus, createdAt FROM users';
  const params = [];
  if (role) { sql += ' WHERE role = ?'; params.push(role); }
  sql += ' ORDER BY createdAt DESC';
  const [rows] = await db.query(sql, params);
  res.json(rows);
});

exports.suspendUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (Number(id) === req.user.userID) throw new AppError('You cannot suspend yourself');
  await db.query("UPDATE users SET accountStatus = 'suspended' WHERE userID = ?", [id]);
  await logAction(req.user.userID, 'USER_SUSPENDED', `userID=${id}`);
  res.json({ message: 'User suspended' });
});

exports.reactivateUser = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.query("UPDATE users SET accountStatus = 'active' WHERE userID = ?", [id]);
  await logAction(req.user.userID, 'USER_REACTIVATED', `userID=${id}`);
  res.json({ message: 'User reactivated' });
});

/* ----------- FR-A4: monitor system activity ----------- */

exports.activitySummary = asyncHandler(async (req, res) => {
  const [[counts]] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM users    WHERE accountStatus = 'active')   AS activeUsers,
      (SELECT COUNT(*) FROM vendors  WHERE status = 'approved')        AS approvedVendors,
      (SELECT COUNT(*) FROM orders   WHERE orderStatus IN
              ('Pending','Confirmed','InPreparation','ReadyForPickup','OnTheWay'))
                                                                       AS ongoingOrders,
      (SELECT COUNT(*) FROM orders   WHERE orderStatus = 'Delivered'
              AND createdAt >= NOW() - INTERVAL 1 DAY)                 AS deliveredToday`);

  const [recent] = await db.query(`
    SELECT logID, userID, action, details, timestamp
    FROM audit_logs ORDER BY timestamp DESC LIMIT 30`);

  res.json({ counts, recentActivity: recent });
});

/* ----------- FR-A5: reports ----------- */

exports.reports = asyncHandler(async (req, res) => {
  const { range = 'week' } = req.query;          // 'day' | 'week' | 'month'
  const interval = range === 'day'   ? '1 DAY'
                : range === 'month' ? '30 DAY'
                : '7 DAY';

  const [[ordersAgg]] = await db.query(`
    SELECT COUNT(*) AS totalOrders,
           COALESCE(SUM(totalPrice), 0) AS revenue
    FROM orders
    WHERE orderStatus = 'Delivered' AND createdAt >= NOW() - INTERVAL ${interval}`);

  const [byVendor] = await db.query(`
    SELECT v.businessName, COUNT(o.orderID) AS orders,
           COALESCE(SUM(o.totalPrice), 0) AS revenue
    FROM vendors v
    LEFT JOIN orders o ON o.vendorID = v.vendorID
        AND o.orderStatus = 'Delivered'
        AND o.createdAt >= NOW() - INTERVAL ${interval}
    GROUP BY v.vendorID, v.businessName
    ORDER BY orders DESC LIMIT 10`);

  const [[loyaltyAgg]] = await db.query(`
    SELECT COALESCE(SUM(accumulatedPts),0) AS pointsEarned,
           COALESCE(SUM(redeemedPts),0)    AS pointsRedeemed
    FROM loyalty`);

  const [[customerActivity]] = await db.query(`
    SELECT COUNT(DISTINCT customerID) AS activeCustomers
    FROM orders WHERE createdAt >= NOW() - INTERVAL ${interval}`);

  res.json({
    range,
    orders: ordersAgg,
    customerActivity,
    byVendor,
    loyalty: loyaltyAgg,
  });
});
