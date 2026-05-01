const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, vendorToken, driverToken, adminToken, resetMocks } = require('./helpers');

beforeEach(() => resetMocks(db));

const authHeader = { Authorization: `Bearer ${adminToken()}` };

describe('Auth & Role Checks', () => {
  const endpoints = [
    ['GET',  '/api/admin/vendors/pending'],
    ['POST', '/api/admin/vendors/1/approve'],
    ['POST', '/api/admin/vendors/1/reject'],
    ['GET',  '/api/admin/users'],
    ['POST', '/api/admin/users/1/suspend'],
    ['POST', '/api/admin/users/1/reactivate'],
    ['GET',  '/api/admin/activity'],
    ['GET',  '/api/admin/reports'],
  ];

  test.each(endpoints)('%s %s returns 401 without token', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url);
    expect(res.status).toBe(401);
  });

  test.each(endpoints)('%s %s returns 403 for customer role', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url)
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(403);
  });

  test.each(endpoints)('%s %s returns 403 for vendor role', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url)
      .set('Authorization', `Bearer ${vendorToken()}`);
    expect(res.status).toBe(403);
  });

  test.each(endpoints)('%s %s returns 403 for driver role', async (method, url) => {
    const res = await request(app)[method.toLowerCase()](url)
      .set('Authorization', `Bearer ${driverToken()}`);
    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/vendors/pending', () => {
  test('returns list of pending vendors', async () => {
    db.query.mockResolvedValueOnce([[
      { vendorID: 1, businessName: 'Test', username: 'user1' },
      { vendorID: 2, businessName: 'Shop', username: 'user2' },
    ]]);

    const res = await request(app)
      .get('/api/admin/vendors/pending')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].businessName).toBe('Test');
  });

  test('returns empty array when none pending', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .get('/api/admin/vendors/pending')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });
});

describe('POST /api/admin/vendors/:id/approve', () => {
  test('returns 404 for non-existent vendor', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/admin/vendors/999/approve')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('approves vendor successfully', async () => {
    db.query.mockResolvedValueOnce([[{ userID: 10 }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/admin/vendors/1/approve')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/approved/i);
  });

  test('updates both vendor status and user accountStatus', async () => {
    db.query.mockResolvedValueOnce([[{ userID: 10 }]]);
    db.query.mockResolvedValueOnce([{}]);
    db.query.mockResolvedValueOnce([{}]);

    await request(app)
      .post('/api/admin/vendors/1/approve')
      .set(authHeader);

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("status = 'approved'"),
      ['1']
    );
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining("accountStatus = 'active'"),
      [10]
    );
  });
});

describe('POST /api/admin/vendors/:id/reject', () => {
  test('returns 404 for non-existent vendor', async () => {
    db.query.mockResolvedValueOnce([[]]);

    const res = await request(app)
      .post('/api/admin/vendors/999/reject')
      .set(authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });

  test('rejects vendor successfully', async () => {
    db.query.mockResolvedValueOnce([[{ userID: 10 }]]);
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/admin/vendors/1/reject')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/rejected/i);
  });
});

describe('GET /api/admin/users', () => {
  test('returns all users without filter', async () => {
    db.query.mockResolvedValueOnce([[
      { userID: 1, username: 'alice', role: 'customer' },
      { userID: 2, username: 'bob', role: 'vendor' },
    ]]);

    const res = await request(app)
      .get('/api/admin/users')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  test('returns filtered users by role', async () => {
    db.query.mockResolvedValueOnce([[
      { userID: 1, username: 'alice', role: 'customer' },
    ]]);

    const res = await request(app)
      .get('/api/admin/users?role=customer')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE role = ?'),
      ['customer']
    );
  });
});

describe('POST /api/admin/users/:id/suspend', () => {
  test('rejects self-suspension', async () => {
    const res = await request(app)
      .post('/api/admin/users/4/suspend')
      .set(authHeader);

    expect(res.status).toBe(400);
  });

  test('suspends user successfully', async () => {
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/admin/users/10/suspend')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/suspended/i);
  });
});

describe('POST /api/admin/users/:id/reactivate', () => {
  test('reactivates user successfully', async () => {
    db.query.mockResolvedValueOnce([{}]);

    const res = await request(app)
      .post('/api/admin/users/10/reactivate')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/reactivated/i);
  });
});

describe('GET /api/admin/activity', () => {
  test('returns activity counts and recent logs', async () => {
    db.query.mockResolvedValueOnce([[{
      activeUsers: 5,
      approvedVendors: 3,
      ongoingOrders: 2,
      deliveredToday: 10,
    }]]);
    db.query.mockResolvedValueOnce([[
      { logID: 1, action: 'LOGIN_SUCCESS' },
      { logID: 2, action: 'VENDOR_APPROVED' },
    ]]);

    const res = await request(app)
      .get('/api/admin/activity')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.counts.activeUsers).toBe(5);
    expect(res.body.counts.approvedVendors).toBe(3);
    expect(res.body.counts.ongoingOrders).toBe(2);
    expect(res.body.counts.deliveredToday).toBe(10);
    expect(res.body.recentActivity).toHaveLength(2);
  });
});

describe('GET /api/admin/reports', () => {
  function mockReportQueries() {
    db.query.mockResolvedValueOnce([[{ totalOrders: 20, revenue: 1500 }]]);
    db.query.mockResolvedValueOnce([[{ businessName: 'Pizza Place', orders: 10, revenue: 800 }]]);
    db.query.mockResolvedValueOnce([[{ pointsEarned: 500, pointsRedeemed: 100 }]]);
    db.query.mockResolvedValueOnce([[{ activeCustomers: 15 }]]);
  }

  test('returns weekly report by default', async () => {
    mockReportQueries();

    const res = await request(app)
      .get('/api/admin/reports')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe('week');
    expect(res.body.orders.totalOrders).toBe(20);
    expect(res.body.orders.revenue).toBe(1500);
    expect(res.body.customerActivity.activeCustomers).toBe(15);
    expect(res.body.byVendor).toHaveLength(1);
    expect(res.body.loyalty.pointsEarned).toBe(500);
  });

  test('returns daily report', async () => {
    mockReportQueries();

    const res = await request(app)
      .get('/api/admin/reports?range=day')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe('day');
  });

  test('returns monthly report', async () => {
    mockReportQueries();

    const res = await request(app)
      .get('/api/admin/reports?range=month')
      .set(authHeader);

    expect(res.status).toBe(200);
    expect(res.body.range).toBe('month');
  });
});
