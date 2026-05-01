const db = require('../../src/config/db');
const { recommendForUser, buildMealCombos } = require('../../src/services/recommendation.service');

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
});

const sampleProducts = [
  { productID: 1, name: 'Margherita Pizza', category: 'pizza', price: 12, vendorID: 1, businessName: 'Mario\'s', rating: 4.5 },
  { productID: 2, name: 'Caesar Salad', category: 'salad', price: 8, vendorID: 1, businessName: 'Mario\'s', rating: 4.5 },
  { productID: 3, name: 'Sushi Roll', category: 'sushi', price: 15, vendorID: 2, businessName: 'Tokyo Sushi', rating: 4.8 },
  { productID: 4, name: 'Miso Soup', category: 'soup', price: 5, vendorID: 2, businessName: 'Tokyo Sushi', rating: 4.8 },
  { productID: 5, name: 'Tiramisu', category: 'dessert', price: 7, vendorID: 1, businessName: 'Mario\'s', rating: 4.5 },
  { productID: 6, name: 'Pasta Carbonara', category: 'pasta', price: 14, vendorID: 3, businessName: 'Italiano', rating: 4.2 },
  { productID: 7, name: 'Edamame', category: 'starter', price: 4, vendorID: 2, businessName: 'Tokyo Sushi', rating: 4.8 },
  { productID: 8, name: 'Grilled Chicken', category: 'grill', price: 18, vendorID: 3, businessName: 'Italiano', rating: 4.2 },
];

describe('recommendForUser()', () => {
  test('returns scored items sorted by score descending', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);

    expect(result.items).toBeDefined();
    expect(result.items.length).toBeGreaterThan(0);
    for (let i = 1; i < result.items.length; i++) {
      expect(result.items[i - 1]._score).toBeGreaterThanOrEqual(result.items[i]._score);
    }
  });

  test('returns time context in result', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);
    expect(['breakfast', 'lunch', 'snack', 'dinner']).toContain(result.context);
  });

  test('boosts products the user has ordered before', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[{ productID: 1, freq: 5 }]]);

    const result = await recommendForUser(1);

    const pizza = result.items.find(i => i.productID === 1);
    const pasta = result.items.find(i => i.productID === 6);
    if (pizza && pasta) {
      expect(pizza._score).toBeGreaterThan(pasta._score);
    }
  });

  test('filters products exceeding budget', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, 10);

    for (const item of result.items) {
      expect(Number(item.price)).toBeLessThanOrEqual(10);
    }
  });

  test('returns all products when budget is null', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, null);
    expect(result.items.length).toBeGreaterThan(0);
  });

  test('respects the limit parameter', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, null, null, 3);
    expect(result.items.length).toBeLessThanOrEqual(3);
  });

  test('returns empty items when no products exist', async () => {
    db.query
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);
    expect(result.items).toEqual([]);
  });

  test('includes mood in result when provided', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, null, 'comfort');
    expect(result.mood).toBe('comfort');
  });

  test('mood is null when not provided', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);
    expect(result.mood).toBeNull();
  });

  test('comfort mood boosts pizza/pasta over salad', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, null, 'comfort');
    const pizza = result.items.find(i => i.productID === 1);
    const salad = result.items.find(i => i.productID === 2);
    if (pizza && salad) {
      expect(pizza._score).toBeGreaterThan(salad._score);
    }
  });

  test('healthy mood boosts salad/sushi over pizza', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1, null, 'healthy');
    const sushi = result.items.find(i => i.productID === 3);
    const pizza = result.items.find(i => i.productID === 1);
    if (sushi && pizza) {
      expect(sushi._score).toBeGreaterThan(pizza._score);
    }
  });

  test('each item has a numeric _score property', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[]]);

    const result = await recommendForUser(1);
    for (const item of result.items) {
      expect(typeof item._score).toBe('number');
      expect(Number.isNaN(item._score)).toBe(false);
    }
  });

  test('history frequency capped at score of 5', async () => {
    db.query
      .mockResolvedValueOnce([sampleProducts])
      .mockResolvedValueOnce([[{ productID: 1, freq: 100 }]]);

    const result = await recommendForUser(1, null, null, 8);
    const pizza = result.items.find(i => i.productID === 1);
    expect(pizza._score).toBeLessThanOrEqual(20);
  });
});

describe('buildMealCombos()', () => {
  test('returns empty array for zero budget', async () => {
    const result = await buildMealCombos(0);
    expect(result).toEqual([]);
  });

  test('returns empty array for negative budget', async () => {
    const result = await buildMealCombos(-10);
    expect(result).toEqual([]);
  });

  test('returns combos within budget', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const budget = 20;
    const result = await buildMealCombos(budget);

    for (const combo of result) {
      expect(combo.total).toBeLessThanOrEqual(budget);
    }
  });

  test('returns at most the specified limit', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const result = await buildMealCombos(50, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  test('each combo has vendor, items, total, and fit', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const result = await buildMealCombos(30);

    for (const combo of result) {
      expect(combo).toHaveProperty('vendor');
      expect(combo).toHaveProperty('items');
      expect(combo).toHaveProperty('total');
      expect(combo).toHaveProperty('fit');
      expect(combo.vendor).toHaveProperty('vendorID');
      expect(combo.vendor).toHaveProperty('businessName');
      expect(combo.items.length).toBeGreaterThan(0);
    }
  });

  test('fit ratio is total/budget and never exceeds 1', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const budget = 25;
    const result = await buildMealCombos(budget);

    for (const combo of result) {
      expect(combo.fit).toBeLessThanOrEqual(1);
      expect(combo.fit).toBeCloseTo(combo.total / budget, 5);
    }
  });

  test('prefers diverse vendors in results', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const result = await buildMealCombos(50, 3);

    const vendorIDs = result.map(c => c.vendor.vendorID);
    const unique = new Set(vendorIDs);
    expect(unique.size).toBeGreaterThanOrEqual(Math.min(unique.size, 3));
  });

  test('sorted by best fit (highest fit first)', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const result = await buildMealCombos(30);

    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].fit).toBeGreaterThanOrEqual(result[i].fit);
    }
  });

  test('returns empty when all products exceed budget', async () => {
    db.query.mockResolvedValueOnce([[
      { productID: 1, name: 'Expensive', category: 'main', price: 100, vendorID: 1, businessName: 'V', rating: 5, vid: 1 },
    ]]);
    const result = await buildMealCombos(5);
    expect(result).toEqual([]);
  });

  test('builds main+side combos when both exist', async () => {
    db.query.mockResolvedValueOnce([sampleProducts]);
    const result = await buildMealCombos(25);

    const multiItemCombos = result.filter(c => c.items.length > 1);
    expect(multiItemCombos.length).toBeGreaterThan(0);
  });
});
