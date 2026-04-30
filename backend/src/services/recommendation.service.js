const db = require('../config/db');

/**
 * Personalized meal recommendations (US-016 / FR proposal feature).
 *
 * Heuristic blends three signals:
 *   1. Order history    — products previously ordered by the customer get a boost.
 *   2. Time-of-day      — categories popular at the current hour get a boost.
 *   3. Budget           — only products within the customer's budget are included.
 *
 * Returns the top N (default 6) products with a relevance score.
 */
async function recommendForUser(userID, budget = null, limit = 6) {
  const hour = new Date().getHours();
  const timeContext = hourToContext(hour); // 'breakfast' | 'lunch' | 'dinner' | 'snack'

  // 1. Pull all available products, with vendor info
  const [products] = await db.query(`
    SELECT p.*, v.businessName, v.rating
    FROM products p
    JOIN vendors v ON p.vendorID = v.vendorID
    WHERE p.availability > 0 AND v.status = 'approved'
  `);

  // 2. Pull customer's past order item product IDs (last 30 days)
  const [history] = await db.query(`
    SELECT oi.productID, COUNT(*) AS freq
    FROM order_items oi
    JOIN orders o ON oi.orderID = o.orderID
    WHERE o.customerID = ?
      AND o.orderStatus = 'Delivered'
      AND o.createdAt >= NOW() - INTERVAL 30 DAY
    GROUP BY oi.productID
  `, [userID]);

  const histMap = new Map(history.map(h => [h.productID, h.freq]));

  // 3. Score each candidate
  const scored = products
    .filter(p => budget == null || Number(p.price) <= budget)
    .map(p => {
      let score = 0;

      // History weight (max +5)
      if (histMap.has(p.productID)) {
        score += Math.min(5, histMap.get(p.productID) * 2);
      }

      // Time-of-day weight (+3 for matching category)
      if (matchesTimeContext(p.category, timeContext)) {
        score += 3;
      }

      // Vendor rating (+0..2)
      score += Number(p.rating) * 0.4;

      // Budget fit bonus: cheaper products within budget rank slightly higher
      if (budget != null) {
        score += 1 - (Number(p.price) / budget); // 0..1 range
      }

      return { ...p, _score: Number(score.toFixed(2)) };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return { context: timeContext, items: scored };
}

function hourToContext(hour) {
  if (hour >= 6  && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 15 && hour < 18) return 'snack';
  return 'dinner';
}

function matchesTimeContext(category, ctx) {
  const cat = (category || '').toLowerCase();
  const map = {
    breakfast: ['breakfast', 'bakery', 'coffee', 'pastry', 'starter'],
    lunch:     ['salad', 'sandwich', 'burger', 'pizza', 'sushi', 'soup'],
    snack:     ['dessert', 'snack', 'starter', 'bakery'],
    dinner:    ['pizza', 'sushi', 'pasta', 'grill', 'italian', 'japanese', 'main']
  };
  return map[ctx].some(k => cat.includes(k));
}

module.exports = { recommendForUser };
