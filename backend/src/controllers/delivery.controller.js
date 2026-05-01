const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { logAction } = require('../services/audit.service');
const { notify } = require('../services/notification.service');

const POINTS_PER_DOLLAR = 1; // FR-C7

/* ============================================================
 *  Driver: list available + my deliveries (FR-D2)
 * ============================================================
 */
exports.availableDeliveries = asyncHandler(async (req, res) => {
  // Single-vendor orders: ReadyForPickup + Unassigned (no group)
  const [singles] = await db.query(`
    SELECT o.orderID, o.totalPrice, o.scheduledTime, o.groupID,
           v.businessName, v.address AS pickupAddress
    FROM orders o
    JOIN vendors v ON v.vendorID = o.vendorID
    JOIN deliveries d ON d.orderID = o.orderID
    WHERE o.orderStatus = 'ReadyForPickup' AND d.status = 'Unassigned'
      AND o.groupID IS NULL
    ORDER BY o.createdAt ASC`);

  // Grouped multi-store orders: show as one delivery when ALL vendors
  // in the group have reached ReadyForPickup
  const [groups] = await db.query(`
    SELECT og.groupID, og.totalPrice, og.customerID,
           GROUP_CONCAT(DISTINCT v.businessName SEPARATOR ' + ') AS businessName,
           GROUP_CONCAT(DISTINCT v.address SEPARATOR ' → ') AS pickupAddress,
           MIN(o.createdAt) AS createdAt,
           COUNT(*) AS orderCount,
           SUM(CASE WHEN o.orderStatus = 'ReadyForPickup' THEN 1 ELSE 0 END) AS readyCount
    FROM order_groups og
    JOIN orders o ON o.groupID = og.groupID
    JOIN vendors v ON v.vendorID = o.vendorID
    JOIN deliveries d ON d.orderID = o.orderID
    WHERE og.status = 'ready_for_driver'
      AND d.status = 'Unassigned'
    GROUP BY og.groupID
    HAVING readyCount = orderCount`);

  const groupRows = groups.map(g => ({
    orderID: `group-${g.groupID}`,
    groupID: g.groupID,
    totalPrice: g.totalPrice,
    scheduledTime: null,
    businessName: g.businessName,
    pickupAddress: g.pickupAddress,
    isGroup: true,
    orderCount: g.orderCount,
  }));

  res.json([...singles, ...groupRows]);
});

exports.myDeliveries = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT o.*, v.businessName, v.address AS pickupAddress,
           u.username AS customerName, u.phone AS customerPhone,
           d.deliveryID, d.status AS deliveryStatus, d.pickupTime, d.deliveryTime
    FROM deliveries d
    JOIN orders o   ON d.orderID = o.orderID
    JOIN vendors v  ON v.vendorID = o.vendorID
    JOIN users u    ON u.userID = o.customerID
    WHERE d.driverID = ?
    ORDER BY o.createdAt DESC`, [req.user.userID]);
  res.json(rows);
});

/* ============================================================
 *  Driver: accept a delivery (FR-D2)
 * ============================================================
 */
exports.acceptDelivery = asyncHandler(async (req, res) => {
  const { id } = req.params;            // orderID or groupID
  const driverID = req.user.userID;

  // Check if this is a group acceptance
  const isGroupAccept = String(id).startsWith('group-');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    if (isGroupAccept) {
      const groupID = Number(String(id).replace('group-', ''));
      const [orders] = await conn.query(
        'SELECT o.orderID, o.customerID FROM orders o WHERE o.groupID = ? FOR UPDATE', [groupID]);
      if (!orders.length) throw new AppError('Group not found', 404);

      for (const order of orders) {
        const [[d]] = await conn.query(
          'SELECT status, driverID FROM deliveries WHERE orderID = ? FOR UPDATE', [order.orderID]);
        if (d.status !== 'Unassigned' || d.driverID)
          throw new AppError('Delivery already assigned', 409);
        await conn.query(
          "UPDATE deliveries SET driverID = ?, status = 'Assigned' WHERE orderID = ?",
          [driverID, order.orderID]);
      }
      await conn.query(
        "UPDATE order_groups SET status = 'assigned' WHERE groupID = ?", [groupID]);
      await conn.commit();

      const customerID = orders[0].customerID;
      notify(customerID, `Driver assigned to your multi-store order`, orders[0].orderID);
      res.json({ message: 'Group delivery accepted' });
    } else {
      const [[d]] = await conn.query(
        'SELECT deliveryID, status, driverID FROM deliveries WHERE orderID = ? FOR UPDATE', [id]);
      if (!d) throw new AppError('Delivery not found', 404);
      if (d.status !== 'Unassigned' || d.driverID)
        throw new AppError('Delivery already assigned', 409);

      const [[o]] = await conn.query(
        'SELECT orderStatus, customerID FROM orders WHERE orderID = ?', [id]);
      if (o.orderStatus !== 'ReadyForPickup')
        throw new AppError('Order is not ready for pickup');

      await conn.query(
        "UPDATE deliveries SET driverID = ?, status = 'Assigned' WHERE orderID = ?",
        [driverID, id]);

      await conn.commit();
      notify(o.customerID, `Driver assigned to order #${id}`, id);
      res.json({ message: 'Delivery accepted' });
    }
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/* ============================================================
 *  Driver: update status (FR-D3)
 * ============================================================
 */
exports.updateDeliveryStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;            // orderID
  const { status } = req.body;          // 'PickedUp' | 'Delivered' | 'Failed'
  const driverID = req.user.userID;

  if (!['PickedUp', 'Delivered', 'Failed'].includes(status))
    throw new AppError('Invalid delivery status');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[d]] = await conn.query(
      'SELECT * FROM deliveries WHERE orderID = ? FOR UPDATE', [id]);
    if (!d || d.driverID !== driverID) throw new AppError('Delivery not found', 404);

    const [[o]] = await conn.query(
      'SELECT customerID, totalPrice, orderStatus FROM orders WHERE orderID = ?', [id]);

    let newOrderStatus = o.orderStatus;
    let pickupTime = d.pickupTime;
    let deliveryTime = d.deliveryTime;

    if (status === 'PickedUp') {
      if (d.status !== 'Assigned') throw new AppError('Delivery not in Assigned state');
      newOrderStatus = 'OnTheWay';
      pickupTime = new Date();
    } else if (status === 'Delivered') {
      if (!['Assigned', 'PickedUp', 'OnTheWay'].includes(d.status))
        throw new AppError('Cannot mark delivered from current state');
      newOrderStatus = 'Delivered';
      deliveryTime = new Date();

      // FR-C7: award loyalty points on successful delivery
      const earned = Math.floor(Number(o.totalPrice) * POINTS_PER_DOLLAR);
      if (earned > 0) {
        await conn.query(
          'UPDATE loyalty SET accumulatedPts = accumulatedPts + ? WHERE userID = ?',
          [earned, o.customerID]);
      }
    } else if (status === 'Failed') {
      newOrderStatus = 'DeliveryFailed';
    }

    await conn.query(
      'UPDATE deliveries SET status = ?, pickupTime = ?, deliveryTime = ? WHERE orderID = ?',
      [status === 'PickedUp' ? 'PickedUp' :
       status === 'Delivered' ? 'Delivered' : 'Failed',
       pickupTime, deliveryTime, id]);

    await conn.query(
      'UPDATE orders SET orderStatus = ? WHERE orderID = ?', [newOrderStatus, id]);

    await conn.commit();

    if (status === 'Delivered') {
      await logAction(driverID, 'DELIVERY_COMPLETED', `orderID=${id}`);
      notify(o.customerID, `Order #${id} has been delivered. Loyalty points earned!`, id);
    } else if (status === 'PickedUp') {
      notify(o.customerID, `Order #${id} picked up by driver, on the way`, id);
    } else {
      notify(o.customerID, `Order #${id} delivery failed.`, id);
    }

    res.json({ message: 'Status updated' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/* ============================================================
 *  Driver: report issue (FR-D4)
 * ============================================================
 */
exports.reportIssue = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { issue } = req.body;
  if (!issue) throw new AppError('Issue description required');

  const [[d]] = await db.query(
    'SELECT * FROM deliveries WHERE orderID = ?', [id]);
  if (!d || d.driverID !== req.user.userID)
    throw new AppError('Delivery not found', 404);

  await db.query('UPDATE deliveries SET issueReport = ? WHERE orderID = ?', [issue, id]);
  await logAction(req.user.userID, 'DELIVERY_ISSUE', `orderID=${id}: ${issue}`);

  // Notify all admins
  const [admins] = await db.query("SELECT userID FROM users WHERE role = 'admin'");
  for (const a of admins) {
    notify(a.userID, `Driver issue on order #${id}: ${issue}`, id);
  }
  res.json({ message: 'Issue reported' });
});
