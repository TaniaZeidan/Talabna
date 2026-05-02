const db = require('../config/db');
const { AppError, asyncHandler } = require('../middleware/error');

/* ----------- Public vendor browsing (FR-C3) ----------- */

exports.listVendors = asyncHandler(async (req, res) => {
  const { search, category } = req.query;
  let sql = `
    SELECT vendorID, businessName, address, category, rating
    FROM vendors WHERE status = 'approved'`;
  const params = [];

  if (search) {
    sql += ' AND (businessName LIKE ? OR category LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }
  sql += ' ORDER BY rating DESC, businessName ASC';

  const [rows] = await db.query(sql, params);
  res.json(rows);
});

exports.getVendor = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    'SELECT vendorID, businessName, address, category, rating, status FROM vendors WHERE vendorID = ?',
    [req.params.id]
  );
  if (!rows.length) throw new AppError('Vendor not found', 404);
  res.json(rows[0]);
});

/* ----------- Product browsing (FR-C3) ----------- */

exports.listProducts = asyncHandler(async (req, res) => {
  const { vendorID, search, category, minPrice, maxPrice } = req.query;

  let sql = `
    SELECT p.*, v.businessName
    FROM products p
    JOIN vendors v ON p.vendorID = v.vendorID
    WHERE v.status = 'approved'`;
  const params = [];

  if (vendorID)  { sql += ' AND p.vendorID = ?';            params.push(vendorID); }
  if (search)    { sql += ' AND p.name LIKE ?';             params.push(`%${search}%`); }
  if (category)  { sql += ' AND p.category = ?';            params.push(category); }
  if (minPrice)  { sql += ' AND p.price >= ?';              params.push(minPrice); }
  if (maxPrice)  { sql += ' AND p.price <= ?';              params.push(maxPrice); }

  sql += ' ORDER BY p.name ASC';

  const [rows] = await db.query(sql, params);
  res.json(rows);
});

/* ----------- Vendor product CRUD (FR-V2, FR-V3) ----------- */

async function getVendorIdForUser(userID) {
  const [rows] = await db.query('SELECT vendorID FROM vendors WHERE userID = ?', [userID]);
  if (!rows.length) throw new AppError('Vendor profile not found', 404);
  return rows[0].vendorID;
}

function validateProductInput({ name, price, category }) {
  if (!name || !category) throw new AppError('Product name and category are required');
  if (price === undefined || price === null) throw new AppError('Price is required');
  if (Number(price) < 0)   throw new AppError('Price must be a positive numeric value');
  if (Number.isNaN(Number(price))) throw new AppError('Price must be numeric');
}

exports.createProduct = asyncHandler(async (req, res) => {
  validateProductInput(req.body);
  const vendorID = await getVendorIdForUser(req.user.userID);
  const { name, description, price, category, availability = 0, imageUrl } = req.body;

  const [r] = await db.query(
    `INSERT INTO products (vendorID, name, description, price, category, availability, imageUrl)
     VALUES (?,?,?,?,?,?,?)`,
    [vendorID, name, description, price, category, availability, imageUrl]
  );

  res.status(201).json({ productID: r.insertId, message: 'Product created' });
});

exports.updateProduct = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);
  const { id } = req.params;

  // Ownership check
  const [own] = await db.query(
    'SELECT productID FROM products WHERE productID = ? AND vendorID = ?', [id, vendorID]);
  if (!own.length) throw new AppError('Product not found or not owned by you', 404);

  validateProductInput({ ...req.body, name: req.body.name || 'placeholder' });
  const { name, description, price, category, availability, imageUrl } = req.body;

  const fields = ['name=?', 'description=?', 'price=?', 'category=?', 'imageUrl=?'];
  const params = [name, description, price, category, imageUrl ?? ''];

  if (availability !== undefined && availability !== null) {
    fields.push('availability=?');
    params.push(availability);
  }

  params.push(id);
  await db.query(
    `UPDATE products SET ${fields.join(', ')} WHERE productID = ?`,
    params
  );
  res.json({ message: 'Product updated' });
});

exports.deleteProduct = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);
  const [r] = await db.query(
    'DELETE FROM products WHERE productID = ? AND vendorID = ?', [req.params.id, vendorID]);
  if (!r.affectedRows) throw new AppError('Product not found', 404);
  res.json({ message: 'Product removed' });
});

exports.myProducts = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);
  const [rows] = await db.query('SELECT * FROM products WHERE vendorID = ?', [vendorID]);
  res.json(rows);
});

/* ----------- Vendor performance analytics (FR-V6) ----------- */

exports.analytics = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);

  const [[totals]] = await db.query(`
    SELECT COUNT(*) AS totalOrders,
           COALESCE(SUM(totalPrice), 0) AS totalRevenue
    FROM orders WHERE vendorID = ? AND orderStatus = 'Delivered'`, [vendorID]);

  const [topProducts] = await db.query(`
    SELECT p.productID, p.name, SUM(oi.quantity) AS unitsSold,
           SUM(oi.quantity * oi.unitPrice) AS revenue
    FROM order_items oi
    JOIN orders o   ON oi.orderID = o.orderID
    JOIN products p ON oi.productID = p.productID
    WHERE o.vendorID = ? AND o.orderStatus = 'Delivered'
    GROUP BY p.productID, p.name
    ORDER BY unitsSold DESC
    LIMIT 5`, [vendorID]);

  const [[avgPrep]] = await db.query(`
    SELECT AVG(TIMESTAMPDIFF(MINUTE, o.createdAt, d.pickupTime)) AS avgPrepMinutes
    FROM orders o
    JOIN deliveries d ON d.orderID = o.orderID
    WHERE o.vendorID = ? AND d.pickupTime IS NOT NULL`, [vendorID]);

  res.json({
    totalOrders:    Number(totals.totalOrders),
    totalRevenue:   Number(totals.totalRevenue),
    avgPrepMinutes: avgPrep.avgPrepMinutes ? Number(avgPrep.avgPrepMinutes).toFixed(1) : null,
    topProducts,
  });
});

/* ----------- End-of-day summary ----------- */

exports.dailySummary = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);
  const dateParam = req.query.date || new Date().toISOString().slice(0, 10);

  const [[summary]] = await db.query(`
    SELECT COUNT(*) AS totalOrders,
           COALESCE(SUM(CASE WHEN orderStatus = 'Delivered' THEN totalPrice ELSE 0 END), 0) AS revenue,
           SUM(CASE WHEN orderStatus = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN orderStatus = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled,
           SUM(CASE WHEN orderStatus IN ('Pending','Confirmed','InPreparation','ReadyForPickup','OnTheWay') THEN 1 ELSE 0 END) AS active
    FROM orders
    WHERE vendorID = ? AND DATE(createdAt) = ?`, [vendorID, dateParam]);

  const [topItems] = await db.query(`
    SELECT p.name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unitPrice) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.orderID = o.orderID
    JOIN products p ON oi.productID = p.productID
    WHERE o.vendorID = ? AND DATE(o.createdAt) = ? AND o.orderStatus = 'Delivered'
    GROUP BY p.productID, p.name
    ORDER BY qty DESC
    LIMIT 5`, [vendorID, dateParam]);

  res.json({
    date: dateParam,
    totalOrders: Number(summary.totalOrders),
    revenue: Number(summary.revenue),
    delivered: Number(summary.delivered),
    cancelled: Number(summary.cancelled),
    active: Number(summary.active),
    topItems,
  });
});

/* ----------- Monthly overview ----------- */

exports.monthlyOverview = asyncHandler(async (req, res) => {
  const vendorID = await getVendorIdForUser(req.user.userID);
  const month = req.query.month || new Date().toISOString().slice(0, 7); // YYYY-MM

  const [[summary]] = await db.query(`
    SELECT COUNT(*) AS totalOrders,
           COALESCE(SUM(CASE WHEN orderStatus = 'Delivered' THEN totalPrice ELSE 0 END), 0) AS revenue,
           SUM(CASE WHEN orderStatus = 'Delivered' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN orderStatus = 'Cancelled' THEN 1 ELSE 0 END) AS cancelled
    FROM orders
    WHERE vendorID = ? AND DATE_FORMAT(createdAt, '%Y-%m') = ?`, [vendorID, month]);

  const [dailyBreakdown] = await db.query(`
    SELECT DATE(createdAt) AS day,
           COUNT(*) AS orders,
           COALESCE(SUM(CASE WHEN orderStatus = 'Delivered' THEN totalPrice ELSE 0 END), 0) AS revenue
    FROM orders
    WHERE vendorID = ? AND DATE_FORMAT(createdAt, '%Y-%m') = ?
    GROUP BY DATE(createdAt)
    ORDER BY day ASC`, [vendorID, month]);

  const [[bestSeller]] = await db.query(`
    SELECT p.productID, p.name, p.imageUrl, SUM(oi.quantity) AS unitsSold,
           SUM(oi.quantity * oi.unitPrice) AS revenue
    FROM order_items oi
    JOIN orders o ON oi.orderID = o.orderID
    JOIN products p ON oi.productID = p.productID
    WHERE o.vendorID = ? AND DATE_FORMAT(o.createdAt, '%Y-%m') = ? AND o.orderStatus = 'Delivered'
    GROUP BY p.productID, p.name, p.imageUrl
    ORDER BY unitsSold DESC
    LIMIT 1`, [vendorID, month]);

  res.json({
    month,
    totalOrders: Number(summary.totalOrders),
    revenue: Number(summary.revenue),
    delivered: Number(summary.delivered),
    cancelled: Number(summary.cancelled),
    dailyBreakdown,
    bestSeller: bestSeller || null,
  });
});
