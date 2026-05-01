const request = require('supertest');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const db = require('../src/config/db');
const { customerToken, resetMocks } = require('./helpers');

const conn = db.__mockConnection;

let knownHash;

beforeAll(async () => {
  knownHash = await bcrypt.hash('Test123', 12);
});

beforeEach(() => {
  resetMocks(db);
});

const validCustomer = {
  username: 'newuser1',
  password: 'Pass123',
  email: 'new@example.com',
  phone: '0501234567',
  role: 'customer',
};

const validVendor = {
  username: 'vendor1',
  password: 'Pass123',
  email: 'vendor@example.com',
  phone: '0507654321',
  role: 'vendor',
  businessName: 'Pizza Place',
  address: '123 Main St',
  category: 'food',
};

function mockNoDuplicates() {
  db.query.mockResolvedValueOnce([[]]);
}

function mockDuplicate() {
  db.query.mockResolvedValueOnce([[{ userID: 99 }]]);
}

function mockInsert(insertId = 1) {
  conn.query.mockResolvedValueOnce([{ insertId }]);
}

// ---------- Registration ----------

describe('POST /api/auth/register', () => {
  test('rejects when username is missing', async () => {
    const { username, ...body } = validCustomer;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects when password is missing', async () => {
    const { password, ...body } = validCustomer;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects when email is missing', async () => {
    const { email, ...body } = validCustomer;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects when phone is missing', async () => {
    const { phone, ...body } = validCustomer;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects username shorter than 6 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, username: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  test('rejects username longer than 20 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, username: 'a'.repeat(21) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/username/i);
  });

  test('rejects password shorter than 6 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, password: 'Ab1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('rejects password longer than 20 chars', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, password: 'Abcdef1' + '0'.repeat(15) });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('rejects password without letters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, password: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letters and numbers/i);
  });

  test('rejects password without numbers', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, password: 'abcdef' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letters and numbers/i);
  });

  test('rejects mismatched confirmPassword', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, confirmPassword: 'Different1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/match/i);
  });

  test('rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/email/i);
  });

  test('rejects invalid role', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validCustomer, role: 'superadmin' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/role/i);
  });

  test('rejects duplicate username/email', async () => {
    mockDuplicate();
    const res = await request(app).post('/api/auth/register').send(validCustomer);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  test('registers customer successfully', async () => {
    mockNoDuplicates();
    mockInsert(10);
    conn.query.mockResolvedValueOnce([{}]); // loyalty insert

    const res = await request(app).post('/api/auth/register').send(validCustomer);
    expect(res.status).toBe(201);
    expect(res.body.userID).toBe(10);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('registers vendor successfully with business info', async () => {
    mockNoDuplicates();
    mockInsert(20);
    conn.query.mockResolvedValueOnce([{}]); // vendor insert

    const res = await request(app).post('/api/auth/register').send(validVendor);
    expect(res.status).toBe(201);
    expect(res.body.userID).toBe(20);
    expect(res.body.message).toMatch(/vendor/i);
  });

  test('rejects vendor registration missing businessName', async () => {
    mockNoDuplicates();
    mockInsert(21);

    const { businessName, ...body } = validVendor;
    const res = await request(app).post('/api/auth/register').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/business name/i);
    expect(conn.rollback).toHaveBeenCalled();
  });
});

// ---------- Login ----------

describe('POST /api/auth/login', () => {
  function mockUserRow(overrides = {}) {
    return {
      userID: 1,
      username: 'testuser',
      password: knownHash,
      email: 'test@example.com',
      role: 'customer',
      accountStatus: 'active',
      ...overrides,
    };
  }

  test('rejects missing username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ password: 'Test123' });
    expect(res.status).toBe(400);
  });

  test('rejects missing password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser' });
    expect(res.status).toBe(400);
  });

  test('rejects non-existent user', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'nouser', password: 'Test123' });
    expect(res.status).toBe(401);
  });

  test('rejects suspended user', async () => {
    db.query.mockResolvedValueOnce([[mockUserRow({ accountStatus: 'suspended' })]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'Test123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  test('rejects pending vendor', async () => {
    db.query.mockResolvedValueOnce([[mockUserRow({ role: 'vendor', accountStatus: 'pending' })]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'Test123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/vendor/i);
  });

  test('rejects wrong password', async () => {
    db.query.mockResolvedValueOnce([[mockUserRow()]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'Wrong999' });
    expect(res.status).toBe(401);
  });

  test('logs in successfully', async () => {
    db.query.mockResolvedValueOnce([[mockUserRow()]]);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'testuser', password: 'Test123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.userID).toBe(1);
    expect(res.body.user.role).toBe('customer');
  });
});

// ---------- Me ----------

describe('GET /api/auth/me', () => {
  test('rejects request without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('returns user profile with valid token', async () => {
    const profile = {
      userID: 1,
      username: 'testuser',
      email: 'test@example.com',
      phone: '0501234567',
      role: 'customer',
      accountStatus: 'active',
      createdAt: '2026-01-01',
    };
    db.query.mockResolvedValueOnce([[profile]]);

    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${customerToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.username).toBe('testuser');
    expect(res.body.email).toBe('test@example.com');
  });
});

// ---------- Password Reset Request ----------

describe('POST /api/auth/reset-password/request', () => {
  function mockFoundUser(overrides = {}) {
    db.query.mockResolvedValueOnce([[{
      userID: 1,
      email: 'test@example.com',
      username: 'testuser',
      accountStatus: 'active',
      ...overrides,
    }]]);
  }

  function mockRateCount(n) {
    db.query.mockResolvedValueOnce([[{ n }]]);
  }

  function mockInvalidateAndInsert() {
    db.query.mockResolvedValueOnce([{}]); // UPDATE old codes
    db.query.mockResolvedValueOnce([{}]); // INSERT new code
  }

  test('rejects missing username', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ email: 'test@example.com' });
    expect(res.status).toBe(400);
  });

  test('rejects missing email', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ username: 'testuser' });
    expect(res.status).toBe(400);
  });

  test('returns generic success for non-existent user', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ username: 'ghost', email: 'ghost@example.com' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBeDefined();
  });

  test('rejects suspended user account', async () => {
    mockFoundUser({ accountStatus: 'suspended' });
    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ username: 'testuser', email: 'test@example.com' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/suspended/i);
  });

  test('rejects when rate limited', async () => {
    mockFoundUser();
    mockRateCount(3);
    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ username: 'testuser', email: 'test@example.com' });
    expect(res.status).toBe(429);
  });

  test('sends reset code successfully', async () => {
    mockFoundUser();
    mockRateCount(0);
    mockInvalidateAndInsert();

    const { sendResetCode } = require('../src/services/email.service');

    const res = await request(app)
      .post('/api/auth/reset-password/request')
      .send({ username: 'testuser', email: 'test@example.com' });
    expect(res.status).toBe(200);
    expect(sendResetCode).toHaveBeenCalled();
  });
});

// ---------- Password Reset Confirm ----------

describe('POST /api/auth/reset-password/confirm', () => {
  let resetCodeHash;

  beforeAll(async () => {
    resetCodeHash = await bcrypt.hash('123456', 10);
  });

  const validReset = {
    username: 'testuser',
    email: 'test@example.com',
    code: '123456',
    newPassword: 'NewPass1',
    confirmPassword: 'NewPass1',
  };

  function mockUserLookup(rows = [{ userID: 1 }]) {
    db.query.mockResolvedValueOnce([rows]);
  }

  function mockActiveReset(codeHash = resetCodeHash) {
    db.query.mockResolvedValueOnce([[{
      resetID: 5,
      codeHash,
      expiresAt: new Date(Date.now() + 600_000),
    }]]);
  }

  test('rejects missing fields', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ username: 'testuser' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/required/i);
  });

  test('rejects password mismatch', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ ...validReset, confirmPassword: 'Mismatch1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/match/i);
  });

  test('rejects short password', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ ...validReset, newPassword: 'Ab1', confirmPassword: 'Ab1' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/password/i);
  });

  test('rejects password without letters', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ ...validReset, newPassword: '123456', confirmPassword: '123456' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/letters and numbers/i);
  });

  test('rejects invalid code format', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ ...validReset, code: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/6 digits/i);
  });

  test('rejects non-existent user', async () => {
    mockUserLookup([]);
    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send(validReset);
    expect(res.status).toBe(400);
  });

  test('rejects when no active reset code exists', async () => {
    mockUserLookup();
    db.query.mockResolvedValueOnce([[]]); // no active resets

    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send(validReset);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no active/i);
  });

  test('rejects invalid verification code', async () => {
    mockUserLookup();
    mockActiveReset();

    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send({ ...validReset, code: '999999' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/invalid verification/i);
  });

  test('resets password successfully', async () => {
    mockUserLookup();
    mockActiveReset();
    conn.query.mockResolvedValue([{}]); // UPDATE resets + UPDATE users

    const res = await request(app)
      .post('/api/auth/reset-password/confirm')
      .send(validReset);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/successful/i);
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });
});
