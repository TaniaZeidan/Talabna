const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');
const { recommendForUser, buildMealCombos } = require('../services/recommendation.service');
const { notify } = require('../services/notification.service');

const REDEEM_VALUE = 0.10; // FR-C7
const DELIVERY_FEE = 2.00;

/* ============================================================
 *  Loyalty (FR-C7)
 * ============================================================
 */
exports.myLoyalty = asyncHandler(async (req, res) => {
  const [[lo]] = await db.query(
    'SELECT accumulatedPts, redeemedPts FROM loyalty WHERE userID = ?', [req.user.userID]);
  res.json({
    accumulated: lo ? lo.accumulatedPts : 0,
    redeemed:    lo ? lo.redeemedPts    : 0,
    redeemValue: REDEEM_VALUE,
  });
});

/* ============================================================
 *  Reviews (FR-C9)
 * ============================================================
 */
exports.submitReview = asyncHandler(async (req, res) => {
  const { orderID, rating, comment } = req.body;
  if (!orderID || !rating) throw new AppError('orderID and rating are required');
  if (rating < 1 || rating > 5) throw new AppError('Rating must be 1–5');

  const [[o]] = await db.query(
    'SELECT customerID, vendorID, orderStatus FROM orders WHERE orderID = ?', [orderID]);
  if (!o) throw new AppError('Order not found', 404);
  if (o.customerID !== req.user.userID) throw new AppError('Not your order', 403);
  if (o.orderStatus !== 'Delivered')
    throw new AppError('Reviews allowed only on delivered orders');

  const [[exists]] = await db.query(
    'SELECT reviewID FROM reviews WHERE orderID = ?', [orderID]);
  if (exists) throw new AppError('Review already submitted for this order', 409);

  await db.query(
    'INSERT INTO reviews (userID, vendorID, orderID, rating, comment) VALUES (?,?,?,?,?)',
    [req.user.userID, o.vendorID, orderID, rating, comment || null]);

  // Recompute vendor rating
  const [[avg]] = await db.query(
    'SELECT AVG(rating) AS r FROM reviews WHERE vendorID = ?', [o.vendorID]);
  await db.query('UPDATE vendors SET rating = ? WHERE vendorID = ?',
    [Number(avg.r).toFixed(2), o.vendorID]);

  res.status(201).json({ message: 'Review submitted' });
});

exports.vendorReviews = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT r.*, u.username
    FROM reviews r JOIN users u ON u.userID = r.userID
    WHERE r.vendorID = ?
    ORDER BY r.timestamp DESC LIMIT 50`, [req.params.id]);
  res.json(rows);
});

/* ============================================================
 *  Recommendations (US-016)
 * ============================================================
 */
exports.recommend = asyncHandler(async (req, res) => {
  const budget = req.query.budget ? Number(req.query.budget) : null;
  const mood   = req.query.mood || null; // 'comfort' | 'healthy' | 'quick'
  if (req.query.budget && (Number.isNaN(budget) || budget <= 0))
    throw new AppError('Invalid budget');
  if (mood && !['comfort','healthy','quick'].includes(mood))
    throw new AppError('Invalid mood');
  const result = await recommendForUser(req.user.userID, budget, mood);
  res.json(result);
});

/* ============================================================
 *  Budget-based meal combos (FR — "What can I eat with $X?")
 * ============================================================
 */
exports.mealCombos = asyncHandler(async (req, res) => {
  const budget = Number(req.query.budget);
  if (!budget || Number.isNaN(budget) || budget <= 0)
    throw new AppError('Provide a valid positive budget');
  const combos = await buildMealCombos(budget);
  res.json({ budget, combos });
});

/* ============================================================
 *  Favorites (save / unsave / list)
 * ============================================================
 */
exports.listFavorites = asyncHandler(async (req, res) => {
  const [rows] = await db.query(`
    SELECT v.vendorID, v.businessName, v.address, v.category, v.rating
    FROM favorites f
    JOIN vendors v ON v.vendorID = f.vendorID
    WHERE f.userID = ? AND v.status = 'approved'
    ORDER BY f.createdAt DESC`, [req.user.userID]);
  res.json(rows);
});

exports.addFavorite = asyncHandler(async (req, res) => {
  const { vendorID } = req.body;
  if (!vendorID) throw new AppError('vendorID required');
  const [[v]] = await db.query("SELECT vendorID FROM vendors WHERE vendorID = ? AND status = 'approved'", [vendorID]);
  if (!v) throw new AppError('Vendor not found', 404);
  await db.query('INSERT IGNORE INTO favorites (userID, vendorID) VALUES (?, ?)', [req.user.userID, vendorID]);
  res.status(201).json({ message: 'Favorited' });
});

exports.removeFavorite = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await db.query('DELETE FROM favorites WHERE userID = ? AND vendorID = ?', [req.user.userID, id]);
  res.json({ message: 'Unfavorited' });
});

/* ============================================================
 *  Multi-store ordering (single session, multiple vendors)
 *  Body: { groups: [ { vendorID, items: [...], scheduledTime?, redeemPoints? } ] }
 * ============================================================
 */
exports.placeMultiStoreOrder = asyncHandler(async (req, res) => {
  const customerID = req.user.userID;
  const { groups, paymentMethod = 'cash' } = req.body;
  if (!Array.isArray(groups) || !groups.length)
    throw new AppError('Provide at least one vendor group');
  if (groups.length === 1)
    throw new AppError('Use the regular order endpoint for single-vendor orders');
  if (!['cash', 'card'].includes(paymentMethod))
    throw new AppError('paymentMethod must be "cash" or "card"');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Create the session order group
    const [g] = await conn.query(
      'INSERT INTO order_groups (customerID, totalPrice) VALUES (?, 0)', [customerID]);
    const groupID = g.insertId;

    let grandTotal = 0;
    const createdOrders = [];

    for (const grp of groups) {
      const { vendorID, items, scheduledTime } = grp;
      if (!vendorID || !Array.isArray(items) || !items.length)
        throw new AppError('Each group must have vendorID and items');

      if (scheduledTime) {
        const dt = new Date(scheduledTime);
        const h = dt.getHours();
        if (Number.isNaN(dt.getTime()) || h < 9 || h >= 22)
          throw new AppError('Scheduled time outside operational hours (9-22)');
      }

      let subtotal = 0;
      for (const it of items) {
        const [[p]] = await conn.query(
          'SELECT price, vendorID FROM products WHERE productID = ?',
          [it.productID]);
        if (!p) throw new AppError(`Product ${it.productID} not found`, 404);
        if (p.vendorID !== Number(vendorID))
          throw new AppError('All items in a group must come from the same vendor');
        subtotal += Number(p.price) * Number(it.quantity);
        it._unitPrice = Number(p.price);
      }
      const total = Number(subtotal.toFixed(2));

      const [oRes] = await conn.query(
        `INSERT INTO orders (customerID, vendorID, orderStatus, totalPrice, scheduledTime, groupID, paymentMethod)
         VALUES (?,?,?,?,?,?,?)`,
        [customerID, vendorID, 'Pending', total, scheduledTime || null, groupID, paymentMethod]);
      const orderID = oRes.insertId;

      for (const it of items) {
        await conn.query(
          'INSERT INTO order_items (orderID, productID, quantity, unitPrice, specialInstructions) VALUES (?,?,?,?,?)',
          [orderID, it.productID, it.quantity, it._unitPrice, it.specialInstructions || null]);
      }
      // For grouped orders, deliveries are created per-order but drivers won't see
      // them until all vendors in the group have confirmed
      await conn.query('INSERT INTO deliveries (orderID, status) VALUES (?, ?)', [orderID, 'Unassigned']);

      grandTotal += total;
      createdOrders.push({ orderID, vendorID, total });
    }

    grandTotal += DELIVERY_FEE;
    await conn.query(
      "UPDATE order_groups SET totalPrice = ?, status = 'pending_vendors' WHERE groupID = ?",
      [grandTotal.toFixed(2), groupID]);
    await conn.commit();

    // Notify each vendor outside the transaction
    for (const o of createdOrders) {
      const [[vu]] = await db.query('SELECT userID FROM vendors WHERE vendorID = ?', [o.vendorID]);
      if (vu) await notify(vu.userID, `New order #${o.orderID} placed (multi-store session)`, o.orderID);
    }

    res.status(201).json({ groupID, orders: createdOrders, grandTotal: Number(grandTotal.toFixed(2)) });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/* ============================================================
 *  Shared cart / group ordering (FR-C8)
 * ============================================================
 */
function generateInviteCode() {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
}

exports.createSharedCart = asyncHandler(async (req, res) => {
  const { vendorID } = req.body;
  if (!vendorID) throw new AppError('vendorID is required');

  const [[v]] = await db.query(
    "SELECT vendorID FROM vendors WHERE vendorID = ? AND status = 'approved'", [vendorID]);
  if (!v) throw new AppError('Vendor not found or not approved', 404);

  const inviteCode = generateInviteCode();
  const [r] = await db.query(
    `INSERT INTO shared_carts (ownerID, vendorID, inviteCode) VALUES (?,?,?)`,
    [req.user.userID, vendorID, inviteCode]);

  await db.query(
    'INSERT INTO cart_members (cartID, userID) VALUES (?, ?)', [r.insertId, req.user.userID]);

  res.status(201).json({ cartID: r.insertId, inviteCode });
});

exports.joinSharedCart = asyncHandler(async (req, res) => {
  const { inviteCode } = req.body;
  if (!inviteCode) throw new AppError('inviteCode is required');

  const [[c]] = await db.query(
    "SELECT cartID, status FROM shared_carts WHERE inviteCode = ?", [inviteCode]);
  if (!c) throw new AppError('Cart not found', 404);
  if (c.status !== 'open') throw new AppError('Cart is no longer open');

  await db.query(
    'INSERT IGNORE INTO cart_members (cartID, userID) VALUES (?, ?)', [c.cartID, req.user.userID]);

  res.json({ cartID: c.cartID, message: 'Joined cart' });
});

exports.viewSharedCart = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const [[cart]] = await db.query(
    `SELECT sc.*, v.businessName FROM shared_carts sc
     JOIN vendors v ON v.vendorID = sc.vendorID WHERE sc.cartID = ?`, [id]);
  if (!cart) throw new AppError('Cart not found', 404);

  // Membership check
  const [[mem]] = await db.query(
    'SELECT 1 AS ok FROM cart_members WHERE cartID = ? AND userID = ?', [id, req.user.userID]);
  if (!mem) throw new AppError('Forbidden', 403);

  const [items] = await db.query(`
    SELECT ci.*, p.name, p.price, u.username AS contributor
    FROM cart_items ci
    JOIN products p ON p.productID = ci.productID
    JOIN users u ON u.userID = ci.userID
    WHERE ci.cartID = ?`, [id]);

  // Per-member contribution totals
  const [contributions] = await db.query(`
    SELECT u.userID, u.username,
           COALESCE(SUM(ci.quantity * p.price),0) AS total
    FROM cart_members m
    JOIN users u ON u.userID = m.userID
    LEFT JOIN cart_items ci ON ci.cartID = m.cartID AND ci.userID = m.userID
    LEFT JOIN products p ON p.productID = ci.productID
    WHERE m.cartID = ?
    GROUP BY u.userID, u.username`, [id]);

  res.json({ cart, items, contributions });
});

exports.addItemToSharedCart = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { productID, quantity } = req.body;
  if (!productID || !quantity || quantity <= 0)
    throw new AppError('productID and positive quantity required');

  const [[mem]] = await db.query(
    'SELECT 1 AS ok FROM cart_members WHERE cartID = ? AND userID = ?', [id, req.user.userID]);
  if (!mem) throw new AppError('Forbidden', 403);

  const [[cart]] = await db.query(
    'SELECT vendorID, status FROM shared_carts WHERE cartID = ?', [id]);
  if (cart.status !== 'open') throw new AppError('Cart is closed');

  const [[p]] = await db.query(
    'SELECT vendorID FROM products WHERE productID = ?', [productID]);
  if (!p || p.vendorID !== cart.vendorID)
    throw new AppError('Product not from this vendor');

  await db.query(
    'INSERT INTO cart_items (cartID, userID, productID, quantity) VALUES (?,?,?,?)',
    [id, req.user.userID, productID, quantity]);
  res.status(201).json({ message: 'Added' });
});

exports.removeItemFromSharedCart = asyncHandler(async (req, res) => {
  const { id, itemID } = req.params;
  const [r] = await db.query(
    'DELETE FROM cart_items WHERE cartItemID = ? AND cartID = ? AND userID = ?',
    [itemID, id, req.user.userID]);
  if (!r.affectedRows) throw new AppError('Item not found or not yours', 404);
  res.json({ message: 'Removed' });
});

exports.checkoutSharedCart = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userID = req.user.userID;

  const [[cart]] = await db.query(
    'SELECT * FROM shared_carts WHERE cartID = ?', [id]);
  if (!cart) throw new AppError('Cart not found', 404);
  if (cart.ownerID !== userID) throw new AppError('Only the cart owner can checkout', 403);
  if (cart.status !== 'open') throw new AppError('Cart already checked out');

  const [items] = await db.query('SELECT * FROM cart_items WHERE cartID = ?', [id]);
  if (!items.length) throw new AppError('Cart is empty');

  // Aggregate items by productID for the order
  const aggregated = items.reduce((acc, it) => {
    acc[it.productID] = (acc[it.productID] || 0) + it.quantity;
    return acc;
  }, {});

  // Place a single order through the orders table directly
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    let subtotal = 0;
    const checkedItems = [];

    for (const [productID, quantity] of Object.entries(aggregated)) {
      const [[p]] = await conn.query(
        'SELECT price FROM products WHERE productID = ?', [productID]);
      if (!p) throw new AppError(`Product ${productID} not found`);
      subtotal += Number(p.price) * Number(quantity);
      checkedItems.push({ productID, quantity, unitPrice: Number(p.price) });
    }

    const total = Number((subtotal + DELIVERY_FEE).toFixed(2));
    const [oRes] = await conn.query(
      `INSERT INTO orders (customerID, vendorID, orderStatus, totalPrice, cartID, deliveryFee)
       VALUES (?,?,?,?,?,?)`,
      [userID, cart.vendorID, 'Pending', total, id, DELIVERY_FEE]);
    const orderID = oRes.insertId;

    for (const it of checkedItems) {
      await conn.query(
        'INSERT INTO order_items (orderID, productID, quantity, unitPrice) VALUES (?,?,?,?)',
        [orderID, it.productID, it.quantity, it.unitPrice]);
    }

    await conn.query('INSERT INTO deliveries (orderID, status) VALUES (?, ?)', [orderID, 'Unassigned']);
    await conn.query("UPDATE shared_carts SET status = 'checked_out', totalPrice = ? WHERE cartID = ?",
      [total, id]);

    await conn.commit();

    const [[vu]] = await db.query('SELECT userID FROM vendors WHERE vendorID = ?', [cart.vendorID]);
    if (vu) notify(vu.userID, `New group order #${orderID}`, orderID);

    // Notify all members
    const [members] = await db.query('SELECT userID FROM cart_members WHERE cartID = ?', [id]);
    for (const m of members) {
      notify(m.userID, `Group order #${orderID} placed (total $${total})`, orderID);
    }

    res.status(201).json({ orderID, total, message: 'Group order placed' });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});
