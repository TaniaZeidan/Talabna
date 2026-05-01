const db = require('../config/db');

/**
 * Personalized meal recommendations.
 * Now blends 4 signals:
 *   1. Order history (boosts repeat purchases)
 *   2. Time-of-day (matches breakfast/lunch/snack/dinner)
 *   3. Mood preference (optional: comfort | healthy | quick)
 *   4. Budget (filters and ranks by fit)
 */
async function recommendForUser(userID, budget = null, mood = null, limit = 6) {
  const hour = new Date().getHours();
  const timeContext = hourToContext(hour);

  const [products] = await db.query(`
    SELECT p.*, v.businessName, v.rating
    FROM products p
    JOIN vendors v ON p.vendorID = v.vendorID
    WHERE v.status = 'approved'
  `);

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

  const scored = products
    .filter(p => budget == null || Number(p.price) <= budget)
    .map(p => {
      let score = 0;

      // 1. History weight (max +5)
      if (histMap.has(p.productID)) {
        score += Math.min(5, histMap.get(p.productID) * 2);
      }

      // 2. Time-of-day weight (+3 for matching)
      if (matchesTimeContext(p.category, timeContext)) {
        score += 3;
      }

      // 3. Mood preference weight (+4 for matching mood, -1 for opposing)
      if (mood) {
        const m = matchesMood(p, mood);
        score += m;
      }

      // 4. Vendor rating
      score += Number(p.rating) * 0.4;

      // 5. Budget fit bonus (cheaper-within-budget ranks higher)
      if (budget != null) {
        score += 1 - (Number(p.price) / budget);
      }

      return { ...p, _score: Number(score.toFixed(2)) };
    })
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);

  return { context: timeContext, mood: mood || null, items: scored };
}

/**
 * Budget-based meal combinations — "What can I eat with $X?"
 *
 * Generates several different combo options from a single vendor that
 * fit within the budget. Greedy heuristic:
 *   - Pick highest-rated vendor's products
 *   - Build meals as: 1 main + 1 side (or 1 main + 1 dessert/drink)
 *   - Return up to N combos sorted by total price descending (best
 *     value first — closest to budget without exceeding)
 */
async function buildMealCombos(budget, limit = 5) {
  if (!budget || budget <= 0) return [];

  // Load all available products grouped by vendor
  const [products] = await db.query(`
    SELECT p.*, v.businessName, v.rating, v.vendorID AS vid
    FROM products p
    JOIN vendors v ON v.vendorID = p.vendorID
    WHERE v.status = 'approved'
    ORDER BY v.rating DESC, p.price ASC
  `);

  // Group products by vendor
  const byVendor = {};
  for (const p of products) {
    if (!byVendor[p.vid]) byVendor[p.vid] = { vendor: { vendorID: p.vid, businessName: p.businessName, rating: p.rating }, items: [] };
    byVendor[p.vid].items.push(p);
  }

  // Categorize products: mains vs sides
  function isMain(p) {
    const c = (p.category || '').toLowerCase();
    return ['pizza','sushi','burger','pasta','grill','main','asian','mexican','indian','chinese','italian','japanese','lebanese','sandwich'].some(k => c.includes(k));
  }
  function isSide(p) {
    const c = (p.category || '').toLowerCase();
    return ['salad','soup','starter','side','dessert','drink'].some(k => c.includes(k));
  }

  const combos = [];

  for (const v of Object.values(byVendor)) {
    const mains = v.items.filter(isMain);
    const sides = v.items.filter(isSide);

    // Try: 1 main alone (cheap option)
    for (const main of mains) {
      if (Number(main.price) <= budget) {
        combos.push({
          vendor: v.vendor,
          items: [main],
          total: Number(main.price),
          fit: Number(main.price) / budget,
        });
      }
    }

    // Try: 1 main + 1 side
    for (const main of mains) {
      for (const side of sides) {
        const total = Number(main.price) + Number(side.price);
        if (total <= budget) {
          combos.push({
            vendor: v.vendor,
            items: [main, side],
            total: Number(total.toFixed(2)),
            fit: total / budget,
          });
        }
      }
    }

    // Try: 1 main + 2 sides if budget allows
    for (const main of mains) {
      for (let i = 0; i < sides.length; i++) {
        for (let j = i + 1; j < sides.length; j++) {
          const total = Number(main.price) + Number(sides[i].price) + Number(sides[j].price);
          if (total <= budget) {
            combos.push({
              vendor: v.vendor,
              items: [main, sides[i], sides[j]],
              total: Number(total.toFixed(2)),
              fit: total / budget,
            });
          }
        }
      }
    }
  }

  // Sort by best fit (closest to budget without going over)
  // and prefer vendor variety
  combos.sort((a, b) => b.fit - a.fit);

  // De-duplicate: keep best combo per vendor first, then fill remainder
  const seen = new Set();
  const diverse = [];
  for (const c of combos) {
    if (!seen.has(c.vendor.vendorID)) {
      diverse.push(c);
      seen.add(c.vendor.vendorID);
    }
    if (diverse.length >= limit) break;
  }
  // If we don't have enough vendors, fill with best remaining combos
  if (diverse.length < limit) {
    for (const c of combos) {
      if (diverse.length >= limit) break;
      if (!diverse.includes(c)) diverse.push(c);
    }
  }

  return diverse;
}

/* ---------- helpers ---------- */
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

/**
 * Mood scoring:
 *   comfort  → high-calorie/cheesy/fried things (pizza, burger, pasta, dessert)
 *   healthy  → salads, soup, sushi, lighter fare, lower price
 *   quick    → starters, soup, sandwich, small items (cheaper, faster)
 *
 * Returns +4 for strong match, +2 for partial, 0 for neutral.
 */
function matchesMood(product, mood) {
  const cat = (product.category || '').toLowerCase();
  const name = (product.name || '').toLowerCase();
  const text = `${cat} ${name}`;

  const moodMap = {
    comfort: {
      strong:  ['pizza', 'burger', 'pasta', 'dessert', 'tiramisu', 'fried'],
      partial: ['cheese', 'italian', 'mexican'],
    },
    healthy: {
      strong:  ['salad', 'sushi', 'soup', 'edamame', 'starter'],
      partial: ['japanese', 'asian'],
    },
    quick: {
      strong:  ['starter', 'soup', 'sandwich', 'snack', 'salad'],
      partial: ['edamame', 'side'],
    },
  };

  const m = moodMap[mood];
  if (!m) return 0;

  if (m.strong.some(k => text.includes(k)))  return 4;
  if (m.partial.some(k => text.includes(k))) return 2;
  return 0;
}

module.exports = { recommendForUser, buildMealCombos };
