const jwt = require('jsonwebtoken');
const { authenticate, requireRole } = require('../src/middleware/auth');
const { asyncHandler, errorHandler, AppError } = require('../src/middleware/error');

const SECRET = process.env.JWT_SECRET;

function makeMocks(authHeader) {
  return {
    req: { headers: { authorization: authHeader } },
    res: { status: jest.fn().mockReturnThis(), json: jest.fn() },
    next: jest.fn(),
  };
}

describe('authenticate', () => {
  test('returns 401 when no Authorization header', () => {
    const { req, res, next } = makeMocks(undefined);
    delete req.headers.authorization;

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when header has no Bearer prefix', () => {
    const { req, res, next } = makeMocks('Basic abc123');

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for invalid/malformed token', () => {
    const { req, res, next } = makeMocks('Bearer not.a.valid.token');

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for expired token', () => {
    const expired = jwt.sign({ userID: 1, role: 'customer' }, SECRET, { expiresIn: '0s' });
    const { req, res, next } = makeMocks(`Bearer ${expired}`);

    authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('sets req.user and calls next() for valid token', () => {
    const payload = { userID: 1, role: 'customer', username: 'alice' };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeMocks(`Bearer ${token}`);

    authenticate(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.user).toMatchObject(payload);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireRole', () => {
  test('returns 401 when no req.user', () => {
    const middleware = requireRole('admin');
    const { req, res, next } = makeMocks(undefined);

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 for wrong role', () => {
    const middleware = requireRole('admin');
    const { req, res, next } = makeMocks(undefined);
    req.user = { userID: 1, role: 'customer' };

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Insufficient privileges' });
    expect(next).not.toHaveBeenCalled();
  });

  test('calls next() for matching role', () => {
    const middleware = requireRole('vendor');
    const { req, res, next } = makeMocks(undefined);
    req.user = { userID: 2, role: 'vendor' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('accepts multiple roles', () => {
    const middleware = requireRole('admin', 'vendor');
    const { req, res, next } = makeMocks(undefined);
    req.user = { userID: 2, role: 'vendor' };

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('AppError', () => {
  test('sets message, status, publicMessage correctly', () => {
    const err = new AppError('Not found', 404);

    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.publicMessage).toBe('Not found');
    expect(err).toBeInstanceOf(Error);
  });

  test('defaults status to 400', () => {
    const err = new AppError('Bad input');

    expect(err.status).toBe(400);
  });
});

describe('errorHandler', () => {
  test('sends error response with correct status', () => {
    const err = new AppError('Forbidden', 403);
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
    spy.mockRestore();
  });

  test('sends 500 for errors without status', () => {
    const err = new Error('unexpected');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});

    errorHandler(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
    spy.mockRestore();
  });
});

describe('asyncHandler', () => {
  test('catches promise rejections and passes to next', async () => {
    const error = new Error('async boom');
    const handler = asyncHandler(async () => { throw error; });
    const req = {};
    const res = {};
    const next = jest.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
