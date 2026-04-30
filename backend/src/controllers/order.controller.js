const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { logAction } = require('../services/audit.service');
const { notify } = require('../services/notification.service');

const POINTS_PER_DOLLAR = 1;       // FR-C7: earn rate
const REDEEM_VALUE      = 0.10;    // FR-C7: 10 points = $1 discount

/* ============================================================
 *  Customer: place order (FR-C4)
 * ============================================================
 */
exports.placeOrder = asyncHandler(async (req, res) => {
  const customerID = req.user.userID;
  const { vendorID, items, scheduledTime, redeemPoints = 0, cartID = null } = req.body;

  if (!vendorID || !Array.isArray(items) || !items.length)
    throw new AppError('Vendor and at least one item are required');

  // Schedule check (FR-C6) — operational hours: 09:00–22:00
  if (scheduledTime) {
    const dt = new Date(scheduledTime);
    const h = dt.getHours();
    if (Number.isNaN(dt.getTime()) || h < 9 || h >= 22)
      throw new AppError('Invalid delivery time. Operational hours are 09:00–22:00.');
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Validate availability for each line and compute totals (FR-C4 condition table)
    let subtotal = 0;
    for (const it of items) {
      const [[p]] = await conn.query(
        'SELECT price, availability, vendorID FROM products WHERE productID = ? FOR UPDATE',
        [it.productID]
      );
      if (!p) throw new AppError(`Product ${it.productID} not found`, 404);
      if (p.vendorID !== Number(vendorID))
        throw new AppError('All items must come from the same vendor');
      if (p.availability < it.quantity)
        throw new AppError(`Product ${it.productID} is out of stock`);
      subtotal += Number(p.price) * Number(it.quantity);
      it._unitPrice = Number(p.price);
    }

    // 2. Loyalty redemption (FR-C7)
    let discount = 0;
    if (redeemPoints > 0) {
      const [[lo]] = await conn.query(
        'SELECT accumulatedPts FROM loyalty WHERE userID = ? FOR UPDATE', [customerID]);
      if (!lo || lo.accumulatedPts < redeemPoints)
        throw new AppError('Insufficient loyalty points');
      discount = Number(redeemPoints) * REDEEM_VALUE;
      if (discount > subtotal) discount = subtotal;
      await conn.query(
        'UPDATE loyalty SET accumulatedPts = accumulatedPts - ?, redeemedPts = redeemedPts + ? WHERE userID = ?',
        [redeemPoints, redeemPoints, customerID]
      );
    }

    const total = Number((subtotal - discount).toFixed(2));

    // 3. Insert order
    const [oRes] = await conn.query(
      `INSERT INTO orders (customerID, vendorID, orderStatus, totalPrice, pointsRedeemed, scheduledTime, cartID)
       VALUES (?,?,?,?,?,?,?)`,
      [customerID, vendorID, 'Pending', total, redeemPoints || 0, scheduledTime || null, cartID]
    );
    const orderID = oRes.insertId;

    // 4. Insert items + decrement stock
    for (const it of items) {
      await conn.query(
        'INSERT INTO order_items (orderID, productID, quantity, unitPrice) VALUES (?,?,?,?)',
        [orderID, it.productID, it.quantity, it._unitPrice]
      );
      await conn.query(
        'UPDATE products SET availability = availability - ? WHERE productID = ?',
        [it.quantity, it.productID]
      );
    }

    // 5. Create unassigned delivery shell
    await conn.query('INSERT INTO deliveries (orderID, status) VALUES (?, ?)', [orderID, 'Unassigned']);

    await conn.commit();

    // 6. Audit + notify the vendor
    await logAction(customerID, 'ORDER_PLACED', `orderID=${orderID}, total=${total}`);

    const [[vu]] = await db.query('SELECT userID FROM vendors WHERE vendorID = ?', [vendorID]);
    if (vu) notify(vu.userID, `New order #${orderID} placed`, orderID);

    res.status(201).json({ orderID, total, message: 'Order placed' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/* ============================================================
 *  Customer: list / track orders (FR-C5)
 * ============================================================
 */
exports.myOrders = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT o.*, v.businessName,
           d.status AS deliveryStatus, d.driverID, d.pickupTime, d.deliveryTime
    FROM orders o
    JOIN vendors v ON v.vendorID = o.vendorID
    LEFT JOIN deliveries d ON d.orderID = o.orderID
    WHERE o.customerID = ?
    ORDER BY o.createdAt DESC`, [req.user.userID]);
  res.json(rows);
});

exports.getOrder = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [[order]] = await db.query(`
    SELECT o.*, v.businessName,
           d.status AS deliveryStatus, d.driverID, d.pickupTime, d.deliveryTime
    FROM orders o
    JOIN vendors v ON v.vendorID = o.vendorID
    LEFT JOIN deliveries d ON d.orderID = o.orderID
    WHERE o.orderID = ?`, [id]);
  if (!order) throw new AppError('Order not found', 404);

  // Ownership check (customer/vendor/driver/admin can view if related)
  const u = req.user;
  const isMine =
    u.role === 'admin' ||
    (u.role === 'customer' && order.customerID === u.userID) ||
    (u.role === 'driver'   && order.driverID   === u.userID);

  let isVendor = false;
  if (u.role === 'vendor') {
    const [[v]] = await db.query(
      'SELECT vendorID FROM vendors WHERE userID = ?', [u.userID]);
    isVendor = v && v.vendorID === order.vendorID;
  }
  if (!isMine && !isVendor) throw new AppError('Forbidden', 403);

  const [items] = await db.query(`
    SELECT oi.*, p.name FROM order_items oi
    JOIN products p ON oi.productID = p.productID
    WHERE oi.orderID = ?`, [id]);

  res.json({ ...order, items });
});

/* ============================================================
 *  Vendor: list / confirm / reject / update prep (FR-V4, FR-V5)
 * ============================================================
 */
async function vendorIdForUser(userID) {
  const [[v]] = await db.query('SELECT vendorID FROM vendors WHERE userID = ?', [userID]);
  if (!v) throw new AppError('Vendor profile not found', 404);
  return v.vendorID;
}

exports.vendorOrders = asyncHandler(async (req, res) => {
  const vendorID = await vendorIdForUser(req.user.userID);
  const [rows] = await db.query(`
    SELECT o.*, u.username AS customerName
    FROM orders o
    JOIN users u ON u.userID = o.customerID
    WHERE o.vendorID = ?
    ORDER BY o.createdAt DESC`, [vendorID]);
  res.json(rows);
});

exports.confirmOrder = asyncHandler(async (req, res) => {
  const vendorID = await vendorIdForUser(req.user.userID);
  const { id } = req.params;

  const [[o]] = await db.query(
    'SELECT customerID, orderStatus, vendorID FROM orders WHERE orderID = ?', [id]);
  if (!o || o.vendorID !== vendorID) throw new AppError('Order not found', 404);
  if (o.orderStatus !== 'Pending') throw new AppError('Order is not in Pending state');

  await db.query("UPDATE orders SET orderStatus = 'Confirmed' WHERE orderID = ?", [id]);
  notify(o.customerID, `Order #${id} confirmed by vendor`, id);
  res.json({ message: 'Order confirmed' });
});

exports.rejectOrder = asyncHandler(async (req, res) => {
  const vendorID = await vendorIdForUser(req.user.userID);
  const { id } = req.params;

  const [[o]] = await db.query(
    'SELECT customerID, orderStatus, vendorID, pointsRedeemed FROM orders WHERE orderID = ?', [id]);
  if (!o || o.vendorID !== vendorID) throw new AppError('Order not found', 404);
  if (!['Pending', 'Confirmed'].includes(o.orderStatus))
    throw new AppError('Order can no longer be rejected');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("UPDATE orders SET orderStatus = 'Cancelled' WHERE orderID = ?", [id]);

    // Restore stock
    const [items] = await conn.query(
      'SELECT productID, quantity FROM order_items WHERE orderID = ?', [id]);
    for (const it of items) {
      await conn.query(
        'UPDATE products SET availability = availability + ? WHERE productID = ?',
        [it.quantity, it.productID]);
    }

    // Refund redeemed points
    if (o.pointsRedeemed > 0) {
      await conn.query(
        'UPDATE loyalty SET accumulatedPts = accumulatedPts + ?, redeemedPts = redeemedPts - ? WHERE userID = ?',
        [o.pointsRedeemed, o.pointsRedeemed, o.customerID]);
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback(); throw err;
  } finally {
    conn.release();
  }

  notify(o.customerID, `Order #${id} rejected by vendor. Points refunded.`, id);
  res.json({ message: 'Order rejected' });
});

exports.updatePrepStatus = asyncHandler(async (req, res) => {
  const vendorID = await vendorIdForUser(req.user.userID);
  const { id } = req.params;
  const { status } = req.body;          // 'InPreparation' | 'ReadyForPickup'

  if (!['InPreparation', 'ReadyForPickup'].includes(status))
    throw new AppError('Invalid preparation status');

  const [[o]] = await db.query(
    'SELECT customerID, orderStatus, vendorID FROM orders WHERE orderID = ?', [id]);
  if (!o || o.vendorID !== vendorID) throw new AppError('Order not found', 404);

  // FR-V5 pre-condition
  if (status === 'InPreparation' && o.orderStatus !== 'Confirmed')
    throw new AppError('Order must be Confirmed before preparation');
  if (status === 'ReadyForPickup' && o.orderStatus !== 'InPreparation')
    throw new AppError('Order must be InPreparation before ready');

  await db.query('UPDATE orders SET orderStatus = ? WHERE orderID = ?', [status, id]);
  notify(o.customerID, `Order #${id}: ${status}`, id);

  // FR-V5 post-condition: notify all available drivers when ready
  if (status === 'ReadyForPickup') {
    const [drivers] = await db.query(
      "SELECT userID FROM users WHERE role = 'driver' AND accountStatus = 'active'");
    for (const d of drivers) {
      notify(d.userID, `Order #${id} is ready for pickup`, id);
    }
  }

  res.json({ message: 'Status updated' });
});

/* ============================================================
 *  FR-V4 auto-cancel timeout
 *  Sweeper that cancels Pending orders older than VENDOR_TIMEOUT_MIN.
 *  Mounted by server.js as a setInterval.
 * ============================================================
 */
exports.runAutoCancelSweep = async () => {
  const minutes = Number(process.env.VENDOR_TIMEOUT_MIN || 10);
  try {
    const [stale] = await db.query(`
      SELECT orderID, customerID, pointsRedeemed FROM orders
      WHERE orderStatus = 'Pending'
        AND createdAt < NOW() - INTERVAL ? MINUTE`, [minutes]);

    for (const o of stale) {
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query("UPDATE orders SET orderStatus = 'Cancelled' WHERE orderID = ?", [o.orderID]);

        const [items] = await conn.query(
          'SELECT productID, quantity FROM order_items WHERE orderID = ?', [o.orderID]);
        for (const it of items) {
          await conn.query('UPDATE products SET availability = availability + ? WHERE productID = ?',
            [it.quantity, it.productID]);
        }
        if (o.pointsRedeemed > 0) {
          await conn.query(
            'UPDATE loyalty SET accumulatedPts = accumulatedPts + ?, redeemedPts = redeemedPts - ? WHERE userID = ?',
            [o.pointsRedeemed, o.pointsRedeemed, o.customerID]);
        }
        await conn.commit();
        await logAction(null, 'ORDER_AUTOCANCELLED', `orderID=${o.orderID}`);
        notify(o.customerID, `Order #${o.orderID} auto-cancelled (vendor did not respond)`, o.orderID);
      } catch (err) {
        await conn.rollback();
        console.error('[sweeper] failed for order', o.orderID, err.message);
      } finally {
        conn.release();
      }
    }
  } catch (err) {
    console.error('[sweeper] sweep failed:', err.message);
  }
};

module.exports.POINTS_PER_DOLLAR = POINTS_PER_DOLLAR;
