const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, vendorToken, driverToken, adminToken, resetMocks } = require('./helpers');
const { runAutoCancelSweep } = require('../src/controllers/order.controller');
const { notify } = require('../src/services/notification.service');

const conn = db.__mockConnection;

beforeEach(() => resetMocks(db));

// ---------------------------------------------------------------------------
// POST /api/orders — Place Order
// ---------------------------------------------------------------------------
describe('POST /api/orders', () => {
  const url = '/api/orders';
  const validBody = { vendorID: 5, items: [{ productID: 1, quantity: 2 }] };

  test('rejects without auth token (401)', async () => {
    const res = await request(app).post(url).send(validBody);
    expect(res.status).toBe(401);
  });

  test('rejects for non-customer role (403)', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send(validBody);
    expect(res.status).toBe(403);
  });

  test('rejects missing vendorID', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ items: [{ productID: 1, quantity: 1 }] });
    expect(res.status).toBe(400);
  });

  test('rejects missing items', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ vendorID: 5 });
    expect(res.status).toBe(400);
  });

  test('rejects empty items array', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ vendorID: 5, items: [] });
    expect(res.status).toBe(400);
  });

  test('rejects invalid paymentMethod', async () => {
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ ...validBody, paymentMethod: 'bitcoin' });
    expect(res.status).toBe(400);
  });

  test('rejects scheduled time outside operational hours', async () => {
    const late = new Date();
    late.setHours(23, 0, 0, 0);
    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ ...validBody, scheduledTime: late.toISOString() });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/operational hours/i);
  });

  test('rejects product not found', async () => {
    conn.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send(validBody);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('rejects product from different vendor', async () => {
    conn.query.mockResolvedValueOnce([[{ price: 10, vendorID: 99 }]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send(validBody);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/same vendor/i);
  });

  test('rejects insufficient loyalty points', async () => {
    conn.query.mockResolvedValueOnce([[{ price: 10, vendorID: 5 }]]);
    conn.query.mockResolvedValueOnce([[{ accumulatedPts: 5 }]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ ...validBody, redeemPoints: 100 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);
  });

  test('places order successfully without loyalty', async () => {
    conn.query.mockResolvedValueOnce([[{ price: 10, vendorID: 5 }]]);
    conn.query.mockResolvedValueOnce([{ insertId: 100 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ userID: 20 }]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.orderID).toBe(100);
    expect(res.body.deliveryFee).toBe(2);
    expect(res.body.paymentMethod).toBe('cash');
    expect(res.body.total).toBe(22);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  });

  test('places order successfully with loyalty point redemption', async () => {
    conn.query.mockResolvedValueOnce([[{ price: 10, vendorID: 5 }]]);
    conn.query.mockResolvedValueOnce([[{ accumulatedPts: 50 }]]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{ insertId: 101 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ userID: 20 }]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ ...validBody, redeemPoints: 10 });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(21);
  });

  test('caps loyalty discount at subtotal', async () => {
    conn.query.mockResolvedValueOnce([[{ price: 1, vendorID: 5 }]]);
    conn.query.mockResolvedValueOnce([[{ accumulatedPts: 500 }]]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{ insertId: 102 }]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ userID: 20 }]]);

    const res = await request(app)
      .post(url)
      .set('Authorization', `Bearer ${customerToken()}`)
      .send({ ...validBody, redeemPoints: 500 });

    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/me — My Orders
// ---------------------------------------------------------------------------
describe('GET /api/orders/me', () => {
  const url = '/api/orders/me';

  test('returns customer orders', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 1, vendorID: 5, businessName: 'Pizza', groupID: null },
      { orderID: 2, vendorID: 6, businessName: 'Sushi', groupID: null },
    ]]);

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('groups multi-store orders by groupID', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 1, vendorID: 5, groupID: 'g1', groupStatus: 'pending', groupTotalPrice: 50, createdAt: '2025-01-01' },
      { orderID: 2, vendorID: 6, groupID: 'g1', groupStatus: 'pending', groupTotalPrice: 50, createdAt: '2025-01-01' },
      { orderID: 3, vendorID: 7, groupID: null },
    ]]);

    const res = await request(app)
      .get(url)
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    const group = res.body.find(o => o.isGroup);
    expect(group).toBeDefined();
    expect(group.subOrders).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id — Get Order
// ---------------------------------------------------------------------------
describe('GET /api/orders/:id', () => {
  test('returns 404 for non-existent order', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/orders/999')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(404);
  });

  test('returns 403 when customer tries to view another\'s order', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 999, vendorID: 5, driverID: null, businessName: 'X',
    }]]);

    const res = await request(app)
      .get('/api/orders/1')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(403);
  });

  test('allows admin to view any order', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 999, vendorID: 5, driverID: null, businessName: 'X',
    }]]);
    db.query.mockResolvedValueOnce([[{ productID: 1, name: 'Burger', quantity: 2 }]]);

    const res = await request(app)
      .get('/api/orders/1')
      .set('Authorization', `Bearer ${adminToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  test('returns order with items', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 1, vendorID: 5, driverID: null, businessName: 'X',
    }]]);
    db.query.mockResolvedValueOnce([[
      { productID: 1, name: 'Burger', quantity: 2 },
      { productID: 2, name: 'Fries', quantity: 1 },
    ]]);

    const res = await request(app)
      .get('/api/orders/1')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.orderID).toBe(1);
    expect(res.body.items).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/:id/cancel — Cancel Order
// ---------------------------------------------------------------------------
describe('POST /api/orders/:id/cancel', () => {
  test('returns 404 for non-existent order', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/orders/999/cancel')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects cancelling another customer\'s order', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 999, orderStatus: 'Pending', vendorID: 5, pointsRedeemed: 0,
    }]]);

    const res = await request(app)
      .post('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects cancelling non-Pending order', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 1, orderStatus: 'Confirmed', vendorID: 5, pointsRedeemed: 0,
    }]]);

    const res = await request(app)
      .post('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/pending/i);
  });

  test('cancels successfully and refunds points', async () => {
    db.query.mockResolvedValueOnce([[{
      orderID: 1, customerID: 1, orderStatus: 'Pending', vendorID: 5, pointsRedeemed: 20,
    }]]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ userID: 20 }]]);

    const res = await request(app)
      .post('/api/orders/1/cancel')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/cancelled/i);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('accumulatedPts'),
      expect.arrayContaining([20, 20, 1]),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/vendor/orders/:id/confirm — Vendor Confirm
// ---------------------------------------------------------------------------
describe('POST /api/vendor/orders/:id/confirm', () => {
  const url = (id) => `/api/vendor/orders/${id}/confirm`;

  test('returns 404 for non-existent order', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post(url(999))
      .set('Authorization', `Bearer ${vendorToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects confirming non-Pending order', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Confirmed', vendorID: 10, groupID: null,
    }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`);
    expect(res.status).toBe(400);
  });

  test('confirms order successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Pending', vendorID: 10, groupID: null,
    }]]);
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/confirmed/i);
    expect(notify).toHaveBeenCalledWith(1, expect.any(String), expect.anything());
  });

  test('for grouped order: updates group status when all confirmed', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Pending', vendorID: 10, groupID: 'g1',
    }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ cnt: 0 }]]);
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`);

    expect(res.status).toBe(200);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('ready_for_driver'),
      expect.arrayContaining(['g1']),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/vendor/orders/:id/reject — Vendor Reject
// ---------------------------------------------------------------------------
describe('POST /api/vendor/orders/:id/reject', () => {
  const url = (id) => `/api/vendor/orders/${id}/reject`;

  test('returns 404 for non-existent order', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post(url(999))
      .set('Authorization', `Bearer ${vendorToken()}`);
    expect(res.status).toBe(404);
  });

  test('rejects rejecting order not in Pending/Confirmed', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'ReadyForPickup', vendorID: 10, pointsRedeemed: 0,
    }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`);
    expect(res.status).toBe(400);
  });

  test('rejects order and refunds points', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Pending', vendorID: 10, pointsRedeemed: 30,
    }]]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/rejected/i);
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('accumulatedPts'),
      expect.arrayContaining([30, 30, 1]),
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/vendor/orders/:id/prepare — Update Prep Status
// ---------------------------------------------------------------------------
describe('POST /api/vendor/orders/:id/prepare', () => {
  const url = (id) => `/api/vendor/orders/${id}/prepare`;

  test('rejects invalid status value', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'Cooking' });
    expect(res.status).toBe(400);
  });

  test('rejects InPreparation when not Confirmed', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Pending', vendorID: 10, groupID: null,
    }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'InPreparation' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/confirmed/i);
  });

  test('rejects ReadyForPickup when not InPreparation', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Confirmed', vendorID: 10, groupID: null,
    }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'ReadyForPickup' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/InPreparation/i);
  });

  test('updates to InPreparation successfully', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'Confirmed', vendorID: 10, groupID: null,
    }]]);
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'InPreparation' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
  });

  test('updates to ReadyForPickup and notifies drivers', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'InPreparation', vendorID: 10, groupID: null,
    }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ userID: 30 }, { userID: 31 }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'ReadyForPickup' });

    expect(res.status).toBe(200);
    expect(notify).toHaveBeenCalledWith(30, expect.stringContaining('ready'), expect.anything());
    expect(notify).toHaveBeenCalledWith(31, expect.stringContaining('ready'), expect.anything());
  });

  test('for grouped order: only notifies drivers when all ready', async () => {
    db.query.mockResolvedValueOnce([[{ vendorID: 10 }]]);
    db.query.mockResolvedValueOnce([[{
      customerID: 1, orderStatus: 'InPreparation', vendorID: 10, groupID: 'g1',
    }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([[{ cnt: 1 }]]);

    const res = await request(app)
      .post(url(1))
      .set('Authorization', `Bearer ${vendorToken()}`)
      .send({ status: 'ReadyForPickup' });

    expect(res.status).toBe(200);
    expect(notify).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('ready for pickup'),
      expect.anything(),
    );
  });
});

// ---------------------------------------------------------------------------
// runAutoCancelSweep — Auto-Cancel Sweep
// ---------------------------------------------------------------------------
describe('runAutoCancelSweep', () => {
  test('cancels stale pending orders', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 50, customerID: 1, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValueOnce([{}]);

    await runAutoCancelSweep();

    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('Cancelled'),
      [50],
    );
    expect(conn.commit).toHaveBeenCalled();
  });

  test('refunds points for cancelled orders', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 60, customerID: 1, pointsRedeemed: 15 },
    ]]);
    conn.query.mockResolvedValueOnce([{}]);
    conn.query.mockResolvedValueOnce([{}]);

    await runAutoCancelSweep();

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('accumulatedPts'),
      expect.arrayContaining([15, 15, 1]),
    );
  });

  test('handles empty sweep gracefully', async () => {
    db.query.mockResolvedValueOnce([[]]);

    await runAutoCancelSweep();

    expect(conn.beginTransaction).not.toHaveBeenCalled();
  });
});
