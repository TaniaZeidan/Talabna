const db = require('../src/config/db');
const { resetMocks } = require('./helpers');
const { recommendForUser, buildMealCombos } = require('../src/services/recommendation.service');

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
    dinner:    ['pizza', 'sushi', 'pasta', 'grill', 'italian', 'japanese', 'main'],
  };
  return map[ctx].some(k => cat.includes(k));
}

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

beforeEach(() => {
  resetMocks(db);
});

/* ===================== hourToContext ===================== */

describe('hourToContext', () => {
  test('boundary: 6 → breakfast', () => expect(hourToContext(6)).toBe('breakfast'));
  test('mid: 8 → breakfast',      () => expect(hourToContext(8)).toBe('breakfast'));
  test('boundary: 10 → breakfast', () => expect(hourToContext(10)).toBe('breakfast'));
  test('boundary: 11 → lunch',    () => expect(hourToContext(11)).toBe('lunch'));
  test('mid: 13 → lunch',         () => expect(hourToContext(13)).toBe('lunch'));
  test('boundary: 14 → lunch',    () => expect(hourToContext(14)).toBe('lunch'));
  test('boundary: 15 → snack',    () => expect(hourToContext(15)).toBe('snack'));
  test('mid: 16 → snack',         () => expect(hourToContext(16)).toBe('snack'));
  test('boundary: 17 → snack',    () => expect(hourToContext(17)).toBe('snack'));
  test('boundary: 18 → dinner',   () => expect(hourToContext(18)).toBe('dinner'));
  test('late: 23 → dinner',       () => expect(hourToContext(23)).toBe('dinner'));
  test('early: 0 → dinner',       () => expect(hourToContext(0)).toBe('dinner'));
  test('pre-dawn: 5 → dinner',    () => expect(hourToContext(5)).toBe('dinner'));
});

/* ===================== matchesTimeContext ===================== */

describe('matchesTimeContext', () => {
  test('breakfast matches bakery',    () => expect(matchesTimeContext('bakery', 'breakfast')).toBe(true));
  test('breakfast matches coffee',    () => expect(matchesTimeContext('coffee', 'breakfast')).toBe(true));
  test('lunch matches sandwich',      () => expect(matchesTimeContext('sandwich', 'lunch')).toBe(true));
  test('lunch matches burger',        () => expect(matchesTimeContext('burger', 'lunch')).toBe(true));
  test('snack matches dessert',       () => expect(matchesTimeContext('dessert', 'snack')).toBe(true));
  test('dinner matches pasta',        () => expect(matchesTimeContext('pasta', 'dinner')).toBe(true));
  test('dinner matches grill',        () => expect(matchesTimeContext('grill', 'dinner')).toBe(true));
  test('main does not match breakfast', () => expect(matchesTimeContext('main', 'breakfast')).toBe(false));
});

/* ===================== matchesMood ===================== */

describe('matchesMood', () => {
  test('comfort + pizza → 4 (strong)',    () => expect(matchesMood({ category: 'pizza', name: 'Margherita' }, 'comfort')).toBe(4));
  test('comfort + italian → 2 (partial)', () => expect(matchesMood({ category: 'italian', name: 'Risotto' }, 'comfort')).toBe(2));
  test('comfort + salad → 0',             () => expect(matchesMood({ category: 'salad', name: 'Caesar' }, 'comfort')).toBe(0));
  test('healthy + sushi → 4',             () => expect(matchesMood({ category: 'sushi', name: 'Salmon Roll' }, 'healthy')).toBe(4));
  test('healthy + japanese → 2',          () => expect(matchesMood({ category: 'japanese', name: 'Ramen' }, 'healthy')).toBe(2));
  test('quick + sandwich → 4',            () => expect(matchesMood({ category: 'sandwich', name: 'Club' }, 'quick')).toBe(4));
  test('unknown mood → 0',                () => expect(matchesMood({ category: 'pizza', name: 'Pepperoni' }, 'exotic')).toBe(0));
});

/* ===================== recommendForUser ===================== */

const sampleProducts = [
  { productID: 1, name: 'Pizza', category: 'pizza', price: 12, vendorID: 1, businessName: 'PizzaPlace', rating: 4.5 },
  { productID: 2, name: 'Sushi Roll', category: 'sushi', price: 15, vendorID: 2, businessName: 'SushiBar', rating: 4.8 },
  { productID: 3, name: 'Caesar Salad', category: 'salad', price: 8, vendorID: 1, businessName: 'PizzaPlace', rating: 4.5 },
  { productID: 4, name: 'Pasta Carbonara', category: 'pasta', price: 14, vendorID: 3, businessName: 'ItalianBistro', rating: 4.2 },
  { productID: 5, name: 'Burger Deluxe', category: 'burger', price: 18, vendorID: 4, businessName: 'BurgerJoint', rating: 3.9 },
];

const sampleHistory = [{ productID: 1, freq: 3 }];

function mockDbForRecommendation(products = sampleProducts, history = sampleHistory) {
  db.query
    .mockResolvedValueOnce([products])
    .mockResolvedValueOnce([history]);
}

describe('recommendForUser', () => {
  test('returns empty items when no products available', async () => {
    db.query.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);

    expect(result.items).toEqual([]);
    expect(result.context).toBeDefined();
  });

  test('returns scored items based on history and time', async () => {
    mockDbForRecommendation();

    const result = await recommendForUser(1);

    expect(result.items.length).toBeGreaterThan(0);
    result.items.forEach(item => {
      expect(item._score).toBeDefined();
      expect(typeof item._score).toBe('number');
    });
    const scores = result.items.map(i => i._score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  test('filters by budget', async () => {
    mockDbForRecommendation();

    const result = await recommendForUser(1, 10);

    result.items.forEach(item => {
      expect(Number(item.price)).toBeLessThanOrEqual(10);
    });
  });

  test('applies mood preference', async () => {
    mockDbForRecommendation();

    const result = await recommendForUser(1, null, 'comfort');

    expect(result.mood).toBe('comfort');
    expect(result.items.length).toBeGreaterThan(0);
  });
});

/* ===================== buildMealCombos ===================== */

const comboProducts = [
  { productID: 1, name: 'Pizza', category: 'pizza', price: 12, vendorID: 1, vid: 1, businessName: 'PizzaPlace', rating: 4.5 },
  { productID: 2, name: 'Burger', category: 'burger', price: 10, vendorID: 2, vid: 2, businessName: 'BurgerJoint', rating: 4.0 },
  { productID: 3, name: 'Caesar Salad', category: 'salad', price: 6, vendorID: 1, vid: 1, businessName: 'PizzaPlace', rating: 4.5 },
  { productID: 4, name: 'Tiramisu', category: 'dessert', price: 5, vendorID: 1, vid: 1, businessName: 'PizzaPlace', rating: 4.5 },
  { productID: 5, name: 'Pasta', category: 'pasta', price: 14, vendorID: 3, vid: 3, businessName: 'ItalianBistro', rating: 4.2 },
  { productID: 6, name: 'Soup', category: 'soup', price: 4, vendorID: 2, vid: 2, businessName: 'BurgerJoint', rating: 4.0 },
];

describe('buildMealCombos', () => {
  test('returns empty for zero budget', async () => {
    const result = await buildMealCombos(0);
    expect(result).toEqual([]);
  });

  test('returns empty for negative budget', async () => {
    const result = await buildMealCombos(-5);
    expect(result).toEqual([]);
  });

  test('returns combos within budget', async () => {
    db.query.mockResolvedValueOnce([comboProducts]);

    const result = await buildMealCombos(20);

    expect(result.length).toBeGreaterThan(0);
    result.forEach(combo => {
      expect(combo.total).toBeLessThanOrEqual(20);
      expect(combo.items.length).toBeGreaterThanOrEqual(1);
      expect(combo.vendor).toBeDefined();
    });
  });

  test('builds main+side combinations', async () => {
    db.query.mockResolvedValueOnce([comboProducts]);

    const result = await buildMealCombos(25);

    const multiItem = result.find(c => c.items.length >= 2);
    expect(multiItem).toBeDefined();
    expect(multiItem.total).toBeLessThanOrEqual(25);
  });

  test('respects budget limit (no combo exceeds budget)', async () => {
    db.query.mockResolvedValueOnce([comboProducts]);

    const result = await buildMealCombos(11);

    result.forEach(combo => {
      expect(combo.total).toBeLessThanOrEqual(11);
    });
  });

  test('returns diverse vendor selection', async () => {
    db.query.mockResolvedValueOnce([comboProducts]);

    const result = await buildMealCombos(30);

    const vendorIds = result.map(c => c.vendor.vendorID);
    const uniqueVendors = new Set(vendorIds);
    expect(uniqueVendors.size).toBeGreaterThan(1);
  });
});
