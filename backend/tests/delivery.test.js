const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, driverToken, resetMocks } = require('./helpers');

const conn = db.__mockConnection;

beforeEach(() => {
  resetMocks(db);
});

// ---------- Available Deliveries ----------

describe('GET /api/driver/available', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/driver/available');
    expect(res.status).toBe(401);
  });

  test('returns 403 for customer role', async () => {
    const res = await request(app)
      .get('/api/driver/available')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(403);
  });

  test('returns available single-vendor deliveries', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 1, totalPrice: 20, businessName: 'Pizza', scheduledTime: null, groupID: null, pickupAddress: '1 Main St' },
    ]]);
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/driver/available')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].orderID).toBe(1);
    expect(res.body[0].businessName).toBe('Pizza');
    expect(res.body[0].isGroup).toBeUndefined();
  });

  test('returns available group deliveries', async () => {
    db.query.mockResolvedValueOnce([[]]);
    db.query.mockResolvedValueOnce([[
      { groupID: 1, totalPrice: 40, orderCount: 2, readyCount: 2, businessName: 'A + B', pickupAddress: 'addr', customerID: 1, createdAt: '2026-01-01' },
    ]]);

    const res = await request(app)
      .get('/api/driver/available')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].orderID).toBe('group-1');
    expect(res.body[0].groupID).toBe(1);
    expect(res.body[0].isGroup).toBe(true);
    expect(res.body[0].orderCount).toBe(2);
  });

  test('returns empty array when none available', async () => {
    db.query.mockResolvedValueOnce([[]]);
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/driver/available')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------- My Deliveries ----------

describe('GET /api/driver/deliveries', () => {
  test('returns driver\'s deliveries', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 5, deliveryID: 10, deliveryStatus: 'Assigned', businessName: 'Tacos', customerName: 'Alice' },
    ]]);

    const res = await request(app)
      .get('/api/driver/deliveries')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].orderID).toBe(5);
    expect(res.body[0].businessName).toBe('Tacos');
  });

  test('returns empty when no deliveries', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/driver/deliveries')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------- Accept Delivery (single) ----------

describe('POST /api/driver/deliveries/:id/accept (single)', () => {
  test('returns 404 when delivery not found', async () => {
    conn.query.mockResolvedValueOnce([[undefined]]);

    const res = await request(app)
      .post('/api/driver/deliveries/99/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(404);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('returns 409 when already assigned', async () => {
    conn.query.mockResolvedValueOnce([[{ deliveryID: 1, status: 'Assigned', driverID: 5 }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(409);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('rejects when order not ReadyForPickup', async () => {
    conn.query.mockResolvedValueOnce([[{ deliveryID: 1, status: 'Unassigned', driverID: null }]]);
    conn.query.mockResolvedValueOnce([[{ orderStatus: 'Preparing', customerID: 1 }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(400);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('accepts delivery successfully', async () => {
    conn.query.mockResolvedValueOnce([[{ deliveryID: 1, status: 'Unassigned', driverID: null }]]);
    conn.query.mockResolvedValueOnce([[{ orderStatus: 'ReadyForPickup', customerID: 1 }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/accepted/i);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ---------- Accept Delivery (group) ----------

describe('POST /api/driver/deliveries/:id/accept (group)', () => {
  test('returns 404 when group not found', async () => {
    conn.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/driver/deliveries/group-99/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(404);
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('returns 409 when delivery in group already assigned', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, customerID: 1 }, { orderID: 2, customerID: 1 }]]);
    conn.query.mockResolvedValueOnce([[{ status: 'Assigned', driverID: 5 }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/group-1/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(409);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('accepts group delivery successfully', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, customerID: 1 }, { orderID: 2, customerID: 1 }]]);
    conn.query.mockResolvedValueOnce([[{ status: 'Unassigned', driverID: null }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([[{ status: 'Unassigned', driverID: null }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/group-1/accept')
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/group/i);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});

// ---------- Update Status ----------

describe('POST /api/driver/deliveries/:id/status', () => {
  test('rejects invalid status value', async () => {
    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'Lost' });
    expect(res.status).toBe(400);
  });

  test('returns 404 when not driver\'s delivery', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 999, status: 'Assigned', pickupTime: null, deliveryTime: null }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'PickedUp' });
    expect(res.status).toBe(404);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('rejects PickedUp when not in Assigned state', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'PickedUp', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 25, orderStatus: 'OnTheWay' }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'PickedUp' });
    expect(res.status).toBe(400);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('updates to PickedUp successfully', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'Assigned', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 25, orderStatus: 'ReadyForPickup' }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'PickedUp' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('rejects Delivered from wrong state', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'Unassigned', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 25, orderStatus: 'ReadyForPickup' }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'Delivered' });
    expect(res.status).toBe(400);
    expect(conn.rollback).toHaveBeenCalled();
  });

  test('updates to Delivered successfully and awards loyalty points', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'Assigned', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 25, orderStatus: 'ReadyForPickup' }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'Delivered' });
    expect(res.status).toBe(200);
    expect(conn.commit).toHaveBeenCalled();
    const loyaltyCall = conn.query.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('loyalty'));
    expect(loyaltyCall).toBeDefined();
    expect(loyaltyCall[1]).toContain(25);
  });

  test('updates to Failed successfully', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'Assigned', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 20, orderStatus: 'ReadyForPickup' }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'Failed' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/updated/i);
    expect(conn.commit).toHaveBeenCalled();
  });

  test('does not award points when total is 0', async () => {
    conn.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3, status: 'Assigned', pickupTime: null, deliveryTime: null }]]);
    conn.query.mockResolvedValueOnce([[{ customerID: 1, totalPrice: 0, orderStatus: 'ReadyForPickup' }]]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    conn.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/status')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ status: 'Delivered' });
    expect(res.status).toBe(200);
    const loyaltyCall = conn.query.mock.calls.find(c =>
      typeof c[0] === 'string' && c[0].includes('loyalty'));
    expect(loyaltyCall).toBeUndefined();
  });
});

// ---------- Report Issue ----------

describe('POST /api/driver/deliveries/:id/issue', () => {
  test('rejects missing issue text', async () => {
    const res = await request(app)
      .post('/api/driver/deliveries/1/issue')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  test('returns 404 when not driver\'s delivery', async () => {
    db.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 999 }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/issue')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ issue: 'flat tire' });
    expect(res.status).toBe(404);
  });

  test('reports issue and notifies admins', async () => {
    db.query.mockResolvedValueOnce([[{ orderID: 1, driverID: 3 }]]);
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    db.query.mockResolvedValueOnce([[{ userID: 10 }, { userID: 11 }]]);

    const res = await request(app)
      .post('/api/driver/deliveries/1/issue')
      .set('Authorization', `Bearer ${driverToken()}`)
      .send({ issue: 'flat tire' });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reported/i);

    const { notify } = require('../src/services/notification.service');
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
