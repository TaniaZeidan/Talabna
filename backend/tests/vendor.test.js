const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, vendorToken, resetMocks } = require('./helpers');

beforeEach(() => resetMocks(db));

describe('Public vendor browsing', () => {
  test('GET /api/vendors returns approved vendors', async () => {
    const vendors = [
      { vendorID: 1, businessName: 'Pizza Place', category: 'Italian', rating: 4.5 },
      { vendorID: 2, businessName: 'Burger Barn', category: 'American', rating: 4.0 },
    ];
    db.query.mockResolvedValueOnce([vendors]);

    const res = await request(app).get('/api/vendors');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].businessName).toBe('Pizza Place');
  });

  test('GET /api/vendors with search filter', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 1, businessName: 'Pizza Place', category: 'Italian', rating: 4.5 }]]);

    const res = await request(app).get('/api/vendors?search=Pizza');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('businessName LIKE'),
      ['%Pizza%', '%Pizza%']
    );
  });

  test('GET /api/vendors with category filter', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 1, businessName: 'Pizza Place', category: 'Italian', rating: 4.5 }]]);

    const res = await request(app).get('/api/vendors?category=Italian');

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('category = ?'),
      ['Italian']
    );
  });

  test('GET /api/vendors/:id returns vendor details', async () => {
    const vendor = { vendorID: 1, businessName: 'Pizza Place', address: '123 Main', category: 'Italian', rating: 4.5, status: 'approved' };
    db.query.mockResolvedValueOnce([[vendor]]);

    const res = await request(app).get('/api/vendors/1');

    expect(res.status).toBe(200);
    expect(res.body.vendorID).toBe(1);
    expect(res.body.businessName).toBe('Pizza Place');
  });

  test('GET /api/vendors/:id returns 404 for non-existent vendor', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app).get('/api/vendors/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('GET /api/products returns products from approved vendors', async () => {
    const products = [
      { productID: 1, name: 'Pizza', price: 12.99, businessName: 'Pizza Place' },
      { productID: 2, name: 'Burger', price: 9.99, businessName: 'Burger Barn' },
    ];
    db.query.mockResolvedValueOnce([products]);

    const res = await request(app).get('/api/products');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("v.status = 'approved'"),
      []
    );
  });

  test('GET /api/products with vendorID filter', async () => {
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza', price: 12.99 }]]);

    const res = await request(app).get('/api/products?vendorID=1');

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('p.vendorID = ?'),
      expect.arrayContaining(['1'])
    );
  });

  test('GET /api/products with price range filter', async () => {
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza', price: 12.99 }]]);

    const res = await request(app).get('/api/products?minPrice=10&maxPrice=20');

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('p.price >= ?'),
      expect.arrayContaining(['10', '20'])
    );
  });

  test('GET /api/products with search filter', async () => {
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza Margherita', price: 12.99 }]]);

    const res = await request(app).get('/api/products?search=Pizza');

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('p.name LIKE ?'),
      ['%Pizza%']
    );
  });
});

describe('Vendor auth required', () => {
  test('GET /api/vendor/products returns 401 without token', async () => {
    const res = await request(app).get('/api/vendor/products');
    expect(res.status).toBe(401);
  });

  test('GET /api/vendor/products returns 403 for customer role', async () => {
    const res = await request(app)
      .get('/api/vendor/products')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(403);
  });

  test('GET /api/vendor/products returns vendor products', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza' }]]);

    const res = await request(app)
      .get('/api/vendor/products')
      .set('Authorization', `Bearer ${vendorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Pizza');
  });
});

describe('Product CRUD', () => {
  const token = vendorToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  test('POST /api/vendor/products rejects missing name', async () => {
    const res = await request(app)
      .post('/api/vendor/products')
      .set(authHeader)
      .send({ price: 10, category: 'Italian' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/i);
  });

  test('POST /api/vendor/products rejects missing price', async () => {
    const res = await request(app)
      .post('/api/vendor/products')
      .set(authHeader)
      .send({ name: 'Pizza', category: 'Italian' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  test('POST /api/vendor/products rejects negative price', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);

    const res = await request(app)
      .post('/api/vendor/products')
      .set(authHeader)
      .send({ name: 'Pizza', price: -5, category: 'Italian' });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/price/i);
  });

  test('POST /api/vendor/products creates product successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([{ insertId: 42 }]);

    const res = await request(app)
      .post('/api/vendor/products')
      .set(authHeader)
      .send({ name: 'Pizza', description: 'Cheesy', price: 12.99, category: 'Italian' });

    expect(res.status).toBe(201);
    expect(res.body.productID).toBe(42);
    expect(res.body.message).toMatch(/created/i);
  });

  test('PUT /api/vendor/products/:id returns 404 for non-owned product', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .put('/api/vendor/products/99')
      .set(authHeader)
      .send({ name: 'Updated Pizza', price: 15, category: 'Italian' });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found|not owned/i);
  });

  test('PUT /api/vendor/products/:id updates product successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ productID: 5 }]]);
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .put('/api/vendor/products/5')
      .set(authHeader)
      .send({ name: 'Updated Pizza', description: 'Extra cheese', price: 15, category: 'Italian', availability: 1 });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
  });

  test('DELETE /api/vendor/products/:id returns 404 for non-existent', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const res = await request(app)
      .delete('/api/vendor/products/999')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('DELETE /api/vendor/products/:id deletes successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .delete('/api/vendor/products/5')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/removed/i);
  });
});

describe('Analytics', () => {
  const token = vendorToken();
  const authHeader = { Authorization: `Bearer ${token}` };

  test('GET /api/vendor/analytics returns analytics data', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ totalOrders: 50, totalRevenue: 2500 }]]);
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza', unitsSold: 30, revenue: 500 }]]);
    db.query.mockResolvedValueOnce([[{ avgPrepMinutes: 18.5 }]]);

    const res = await request(app)
      .get('/api/vendor/analytics')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalOrders', 50);
    expect(res.body).toHaveProperty('totalRevenue', 2500);
    expect(res.body).toHaveProperty('avgPrepMinutes');
    expect(res.body).toHaveProperty('topProducts');
  });

  test('GET /api/vendor/daily-summary returns summary', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ totalOrders: 15, revenue: 350, delivered: 10, cancelled: 2, active: 3 }]]);
    db.query.mockResolvedValueOnce([[{ name: 'Pizza', qty: 8, revenue: 100 }]]);

    const res = await request(app)
      .get('/api/vendor/daily-summary')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('date');
    expect(res.body).toHaveProperty('totalOrders', 15);
    expect(res.body).toHaveProperty('revenue', 350);
    expect(res.body).toHaveProperty('delivered', 10);
    expect(res.body).toHaveProperty('cancelled', 2);
    expect(res.body).toHaveProperty('active', 3);
    expect(res.body).toHaveProperty('topItems');
  });

  test('GET /api/vendor/daily-summary with specific date', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ totalOrders: 5, revenue: 120, delivered: 4, cancelled: 1, active: 0 }]]);
    db.query.mockResolvedValueOnce([[{ name: 'Burger', qty: 3, revenue: 45 }]]);

    const res = await request(app)
      .get('/api/vendor/daily-summary?date=2026-04-15')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.date).toBe('2026-04-15');
    expect(res.body.totalOrders).toBe(5);
  });

  test('GET /api/vendor/monthly-overview returns overview', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ totalOrders: 200, revenue: 8500, delivered: 180, cancelled: 20 }]]);
    db.query.mockResolvedValueOnce([
      [
        { day: '2026-04-01', orders: 10, revenue: 300 },
        { day: '2026-04-02', orders: 8, revenue: 250 },
      ],
    ]);
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Pizza', imageUrl: null, unitsSold: 90, revenue: 1200 }]]);

    const res = await request(app)
      .get('/api/vendor/monthly-overview?month=2026-04')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.month).toBe('2026-04');
    expect(res.body).toHaveProperty('totalOrders', 200);
    expect(res.body).toHaveProperty('revenue', 8500);
    expect(res.body).toHaveProperty('delivered', 180);
    expect(res.body).toHaveProperty('cancelled', 20);
    expect(res.body).toHaveProperty('dailyBreakdown');
    expect(res.body.dailyBreakdown).toHaveLength(2);
    expect(res.body).toHaveProperty('bestSeller');
    expect(res.body.bestSeller.name).toBe('Pizza');
  });
});
