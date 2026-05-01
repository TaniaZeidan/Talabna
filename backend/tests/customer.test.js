const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, vendorToken, resetMocks } = require('./helpers');

const conn = db.__mockConnection;
const token = customerToken();

jest.mock('../src/services/recommendation.service', () => ({
  recommendForUser: jest.fn().mockResolvedValue([{ productID: 1, name: 'Burger' }]),
  buildMealCombos: jest.fn().mockResolvedValue([{ items: ['Fries', 'Soda'], total: 5 }]),
}));
const { recommendForUser, buildMealCombos } = require('../src/services/recommendation.service');

beforeEach(() => {
  resetMocks(db);
  recommendForUser.mockClear();
  buildMealCombos.mockClear();
});

// ---------- Loyalty ----------

describe('GET /api/loyalty/me', () => {
  test('returns loyalty info', async () => {
    db.query.mockResolvedValueOnce([[{ accumulatedPts: 100, redeemedPts: 20 }]]);
    const res = await request(app)
      .get('/api/loyalty/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.accumulated).toBe(100);
    expect(res.body.redeemed).toBe(20);
    expect(res.body.redeemValue).toBe(0.10);
  });

  test('returns zeros when no loyalty row', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .get('/api/loyalty/me')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.accumulated).toBe(0);
    expect(res.body.redeemed).toBe(0);
  });
});

// ---------- Reviews ----------

describe('POST /api/reviews', () => {
  test('rejects missing orderID', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 5 });
    expect(res.status).toBe(400);
  });

  test('rejects missing rating', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects rating below 1', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 0 });
    expect(res.status).toBe(400);
  });

  test('rejects rating above 5', async () => {
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 6 });
    expect(res.status).toBe(400);
  });

  test('rejects review for non-existent order', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 999, rating: 5 });
    expect(res.status).toBe(404);
  });

  test('rejects review for another customer\'s order', async () => {
    db.query.mockResolvedValueOnce([[{ customerID: 99, vendorID: 5, orderStatus: 'Delivered' }]]);
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 5 });
    expect(res.status).toBe(403);
  });

  test('rejects review for non-Delivered order', async () => {
    db.query.mockResolvedValueOnce([[{ customerID: 1, vendorID: 5, orderStatus: 'Pending' }]]);
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 5 });
    expect(res.status).toBe(400);
  });

  test('rejects duplicate review', async () => {
    db.query.mockResolvedValueOnce([[{ customerID: 1, vendorID: 5, orderStatus: 'Delivered' }]]);
    db.query.mockResolvedValueOnce([[{ reviewID: 1 }]]);
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 5 });
    expect(res.status).toBe(409);
  });

  test('submits review successfully', async () => {
    db.query.mockResolvedValueOnce([[{ customerID: 1, vendorID: 5, orderStatus: 'Delivered' }]]);
    db.query.mockResolvedValueOnce([[]]);
    db.query.mockResolvedValueOnce([{ insertId: 10 }]);
    db.query.mockResolvedValueOnce([[{ r: 4.5 }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ orderID: 1, rating: 5, comment: 'Great food' });
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/review/i);
  });
});

describe('GET /api/vendors/:id/reviews', () => {
  test('returns reviews for a vendor', async () => {
    db.query.mockResolvedValueOnce([
      [{ reviewID: 1, rating: 5, username: 'alice', comment: 'Awesome' }],
    ]);
    const res = await request(app).get('/api/vendors/5/reviews');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].username).toBe('alice');
  });
});

// ---------- Recommendations ----------

describe('GET /api/recommendations', () => {
  test('rejects invalid budget (negative)', async () => {
    const res = await request(app)
      .get('/api/recommendations?budget=-5')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('rejects invalid budget (NaN)', async () => {
    const res = await request(app)
      .get('/api/recommendations?budget=abc')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('rejects invalid mood', async () => {
    const res = await request(app)
      .get('/api/recommendations?mood=spicy')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('returns recommendations', async () => {
    const res = await request(app)
      .get('/api/recommendations?budget=20&mood=comfort')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(recommendForUser).toHaveBeenCalledWith(1, 20, 'comfort');
  });
});

// ---------- Meal Combos ----------

describe('GET /api/meal-combos', () => {
  test('rejects missing budget', async () => {
    const res = await request(app)
      .get('/api/meal-combos')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('rejects zero budget', async () => {
    const res = await request(app)
      .get('/api/meal-combos?budget=0')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('rejects negative budget', async () => {
    const res = await request(app)
      .get('/api/meal-combos?budget=-10')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('returns combos', async () => {
    const res = await request(app)
      .get('/api/meal-combos?budget=15')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.budget).toBe(15);
    expect(res.body.combos).toBeDefined();
    expect(buildMealCombos).toHaveBeenCalledWith(15);
  });
});

// ---------- Favorites ----------

describe('Favorites', () => {
  test('GET /api/favorites — lists favorites', async () => {
    db.query.mockResolvedValueOnce([[
      { vendorID: 3, businessName: 'Tacos', address: '1 St', category: 'food', rating: 4.2 },
    ]]);
    const res = await request(app)
      .get('/api/favorites')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].businessName).toBe('Tacos');
  });

  test('POST /api/favorites — rejects adding without vendorID', async () => {
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/favorites — rejects adding non-existent vendor', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendorID: 999 });
    expect(res.status).toBe(404);
  });

  test('POST /api/favorites — adds favorite successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 3 }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendorID: 3 });
    expect(res.status).toBe(201);
  });

  test('DELETE /api/favorites/:id — removes favorite', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = await request(app)
      .delete('/api/favorites/3')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

// ---------- Multi-Store Order ----------

describe('POST /api/orders/multi-store', () => {
  const validGroups = {
    groups: [
      { vendorID: 1, items: [{ productID: 10, quantity: 2 }] },
      { vendorID: 2, items: [{ productID: 20, quantity: 1 }] },
    ],
    paymentMethod: 'cash',
  };

  test('rejects non-array groups', async () => {
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({ groups: 'nope' });
    expect(res.status).toBe(400);
  });

  test('rejects empty groups', async () => {
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({ groups: [] });
    expect(res.status).toBe(400);
  });

  test('rejects single group (must use regular endpoint)', async () => {
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({ groups: [{ vendorID: 1, items: [{ productID: 10, quantity: 1 }] }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/single/i);
  });

  test('rejects invalid paymentMethod', async () => {
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validGroups, paymentMethod: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  test('rejects group missing vendorID', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({
        groups: [
          { items: [{ productID: 10, quantity: 1 }] },
          { vendorID: 2, items: [{ productID: 20, quantity: 1 }] },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('rejects group missing items', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({
        groups: [
          { vendorID: 1 },
          { vendorID: 2, items: [{ productID: 20, quantity: 1 }] },
        ],
      });
    expect(res.status).toBe(400);
  });

  test('rejects scheduled time outside hours', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send({
        groups: [
          { vendorID: 1, items: [{ productID: 10, quantity: 1 }], scheduledTime: '2026-05-01T23:00:00' },
          { vendorID: 2, items: [{ productID: 20, quantity: 1 }] },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/hours/i);
  });

  test('rejects product not found', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);
    conn.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send(validGroups);
    expect(res.status).toBe(404);
  });

  test('rejects product from wrong vendor', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 1 }]);
    conn.query.mockResolvedValueOnce([[{ price: 10, vendorID: 99 }]]);
    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send(validGroups);
    expect(res.status).toBe(400);
  });

  test('places multi-store order successfully', async () => {
    conn.query.mockResolvedValueOnce([{ insertId: 100 }]);

    conn.query.mockResolvedValueOnce([[{ price: 5.00, vendorID: 1 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 201 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);

    conn.query.mockResolvedValueOnce([[{ price: 8.00, vendorID: 2 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 202 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);

    conn.query.mockResolvedValueOnce([{}]);

    db.query.mockResolvedValueOnce([[{ userID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ userID: 11 }]]);

    const res = await request(app)
      .post('/api/orders/multi-store')
      .set('Authorization', `Bearer ${token}`)
      .send(validGroups);
    expect(res.status).toBe(201);
    expect(res.body.groupID).toBe(100);
    expect(res.body.orders).toHaveLength(2);
    expect(res.body.grandTotal).toBe(20);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ---------- Shared Cart ----------

describe('POST /api/carts', () => {
  test('rejects creating cart without vendorID', async () => {
    const res = await request(app)
      .post('/api/carts')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('rejects creating cart for non-existent vendor', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/carts')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendorID: 999 });
    expect(res.status).toBe(404);
  });

  test('creates shared cart successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 3 }]]);
    db.query.mockResolvedValueOnce([{ insertId: 50 }]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/carts')
      .set('Authorization', `Bearer ${token}`)
      .send({ vendorID: 3 });
    expect(res.status).toBe(201);
    expect(res.body.cartID).toBe(50);
    expect(res.body.inviteCode).toBeDefined();
  });
});

describe('POST /api/carts/join', () => {
  test('rejects joining with invalid invite code', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/carts/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'BADCODE' });
    expect(res.status).toBe(404);
  });

  test('rejects joining closed cart', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, status: 'checked_out' }]]);
    const res = await request(app)
      .post('/api/carts/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });
    expect(res.status).toBe(400);
  });

  test('joins cart successfully', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, status: 'open' }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/carts/join')
      .set('Authorization', `Bearer ${token}`)
      .send({ inviteCode: 'ABC123' });
    expect(res.status).toBe(200);
    expect(res.body.cartID).toBe(50);
  });
});

describe('GET /api/carts/:id', () => {
  test('rejects viewing non-existent cart', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .get('/api/carts/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('rejects viewing cart when not member', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, vendorID: 3, businessName: 'Tacos' }]]);
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .get('/api/carts/50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('views shared cart', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, vendorID: 3, businessName: 'Tacos' }]]);
    db.query.mockResolvedValueOnce([[{ ok: 1 }]]);
    db.query.mockResolvedValueOnce([[
      { cartItemID: 1, productID: 10, name: 'Burrito', price: 8, quantity: 2, contributor: 'testuser' },
    ]]);
    db.query.mockResolvedValueOnce([[
      { userID: 1, username: 'testuser', total: 16 },
    ]]);
    const res = await request(app)
      .get('/api/carts/50')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.cart.cartID).toBe(50);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.contributions).toHaveLength(1);
  });
});

describe('POST /api/carts/:id/items', () => {
  test('rejects adding item when not member', async () => {
    db.query.mockResolvedValueOnce([[undefined]]);
    const res = await request(app)
      .post('/api/carts/50/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productID: 10, quantity: 1 });
    expect(res.status).toBe(403);
  });

  test('rejects adding item to closed cart', async () => {
    db.query.mockResolvedValueOnce([[{ ok: 1 }]]);
    db.query.mockResolvedValueOnce([[{ vendorID: 3, status: 'checked_out' }]]);
    const res = await request(app)
      .post('/api/carts/50/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productID: 10, quantity: 1 });
    expect(res.status).toBe(400);
  });

  test('rejects adding product from wrong vendor', async () => {
    db.query.mockResolvedValueOnce([[{ ok: 1 }]]);
    db.query.mockResolvedValueOnce([[{ vendorID: 3, status: 'open' }]]);
    db.query.mockResolvedValueOnce([[{ vendorID: 99 }]]);
    const res = await request(app)
      .post('/api/carts/50/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productID: 10, quantity: 1 });
    expect(res.status).toBe(400);
  });

  test('adds item to cart', async () => {
    db.query.mockResolvedValueOnce([[{ ok: 1 }]]);
    db.query.mockResolvedValueOnce([[{ vendorID: 3, status: 'open' }]]);
    db.query.mockResolvedValueOnce([[{ vendorID: 3 }]]);
    db.query.mockResolvedValueOnce([{}]);
    const res = await request(app)
      .post('/api/carts/50/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ productID: 10, quantity: 1 });
    expect(res.status).toBe(201);
  });
});

describe('DELETE /api/carts/:id/items/:itemID', () => {
  test('rejects removing non-existent item', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    const res = await request(app)
      .delete('/api/carts/50/items/999')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('removes item from cart', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    const res = await request(app)
      .delete('/api/carts/50/items/1')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('POST /api/carts/:id/checkout', () => {
  test('rejects checkout by non-owner', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, ownerID: 99, status: 'open', vendorID: 3 }]]);
    const res = await request(app)
      .post('/api/carts/50/checkout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  test('rejects checkout of non-open cart', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, ownerID: 1, status: 'checked_out', vendorID: 3 }]]);
    const res = await request(app)
      .post('/api/carts/50/checkout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('rejects checkout of empty cart', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, ownerID: 1, status: 'open', vendorID: 3 }]]);
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .post('/api/carts/50/checkout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  test('checks out cart successfully', async () => {
    db.query.mockResolvedValueOnce([[{ cartID: 50, ownerID: 1, status: 'open', vendorID: 3 }]]);
    db.query.mockResolvedValueOnce([[
      { cartItemID: 1, productID: 10, quantity: 2 },
      { cartItemID: 2, productID: 10, quantity: 1 },
    ]]);

    conn.query.mockResolvedValueOnce([[{ price: 8.00 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 301 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);

    db.query.mockResolvedValueOnce([[{ userID: 10 }]]);
    db.query.mockResolvedValueOnce([[{ userID: 1 }, { userID: 5 }]]);

    const res = await request(app)
      .post('/api/carts/50/checkout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(201);
    expect(res.body.orderID).toBe(301);
    expect(res.body.total).toBeDefined();
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});
