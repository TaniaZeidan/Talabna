const jwt = require('jsonwebtoken');
const { authenticate, requireRole } = require('../../src/middleware/auth');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function mockRes() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  return res;
}

describe('authenticate()', () => {
  test('rejects request with no Authorization header', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects request with empty Authorization header', () => {
    const req = { headers: { authorization: '' } };
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects Authorization header without Bearer prefix', () => {
    const token = jwt.sign({ userID: 1 }, SECRET);
    const req = { headers: { authorization: `Token ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects malformed JWT', () => {
    const req = { headers: { authorization: 'Bearer not.a.valid.jwt' } };
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
  });

  test('rejects expired JWT', () => {
    const token = jwt.sign({ userID: 1 }, SECRET, { expiresIn: '0s' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    // Small delay to ensure token is expired
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects JWT signed with wrong secret', () => {
    const token = jwt.sign({ userID: 1 }, 'wrong-secret');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();
    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('sets req.user and calls next() for valid JWT', () => {
    const payload = { userID: 42, role: 'customer', username: 'alice' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toBeDefined();
    expect(req.user.userID).toBe(42);
    expect(req.user.role).toBe('customer');
    expect(req.user.username).toBe('alice');
  });

  test('preserves all payload fields in req.user', () => {
    const payload = { userID: 1, role: 'admin', username: 'boss' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = mockRes();
    const next = jest.fn();

    authenticate(req, res, next);

    expect(req.user.role).toBe('admin');
    expect(req.user).toHaveProperty('iat');
    expect(req.user).toHaveProperty('exp');
  });
});

describe('requireRole()', () => {
  test('returns a middleware function', () => {
    const middleware = requireRole('admin');
    expect(typeof middleware).toBe('function');
    expect(middleware.length).toBe(3);
  });

  test('rejects when req.user is missing', () => {
    const middleware = requireRole('admin');
    const req = {};
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects when role does not match', () => {
    const middleware = requireRole('admin');
    const req = { user: { userID: 1, role: 'customer' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient privileges' });
  });

  test('allows matching single role', () => {
    const middleware = requireRole('vendor');
    const req = { user: { userID: 2, role: 'vendor' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('allows matching any of multiple roles', () => {
    const middleware = requireRole('admin', 'vendor');
    const req = { user: { userID: 2, role: 'vendor' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects role not in multiple-role list', () => {
    const middleware = requireRole('admin', 'vendor');
    const req = { user: { userID: 3, role: 'driver' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('customer cannot access vendor routes', () => {
    const middleware = requireRole('vendor');
    const req = { user: { userID: 1, role: 'customer' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('driver cannot access admin routes', () => {
    const middleware = requireRole('admin');
    const req = { user: { userID: 3, role: 'driver' } };
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
