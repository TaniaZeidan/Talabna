const { AppError, asyncHandler, errorHandler } = require('../../src/middleware/error');

describe('AppError', () => {
  test('is an instance of Error', () => {
    const err = new AppError('test');
    expect(err).toBeInstanceOf(Error);
  });

  test('sets message correctly', () => {
    const err = new AppError('Something failed');
    expect(err.message).toBe('Something failed');
  });

  test('defaults status to 400', () => {
    const err = new AppError('bad request');
    expect(err.status).toBe(400);
  });

  test('accepts custom status', () => {
    const err = new AppError('not found', 404);
    expect(err.status).toBe(404);
  });

  test('sets publicMessage same as message', () => {
    const err = new AppError('visible error');
    expect(err.publicMessage).toBe('visible error');
  });

  test('works with status 409 (conflict)', () => {
    const err = new AppError('already exists', 409);
    expect(err.status).toBe(409);
    expect(err.publicMessage).toBe('already exists');
  });

  test('works with status 500', () => {
    const err = new AppError('server error', 500);
    expect(err.status).toBe(500);
  });

  test('has a stack trace', () => {
    const err = new AppError('traced');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('traced');
  });
});

describe('errorHandler', () => {
  let res;
  const next = jest.fn();

  beforeEach(() => {
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    console.error.mockRestore();
  });

  test('uses err.status when available', () => {
    const err = new AppError('bad', 422);
    errorHandler(err, {}, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  test('defaults to 500 for errors without status', () => {
    errorHandler(new Error('raw'), {}, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('uses publicMessage in response for AppError', () => {
    const err = new AppError('user-visible message', 400);
    errorHandler(err, {}, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'user-visible message' });
  });

  test('hides internal message for 500 errors', () => {
    const err = new Error('db pool exhausted');
    errorHandler(err, {}, res, next);
    expect(res.json).toHaveBeenCalledWith({ error: 'Internal server error' });
  });

  test('logs the error to console', () => {
    errorHandler(new Error('test'), {}, res, next);
    expect(console.error).toHaveBeenCalledWith('[error]', expect.any(Error));
  });
});

describe('asyncHandler', () => {
  test('calls the wrapped function', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const handler = asyncHandler(fn);
    const req = {}, res = {}, next = jest.fn();
    await handler(req, res, next);
    expect(fn).toHaveBeenCalledWith(req, res, next);
  });

  test('passes errors to next()', async () => {
    const err = new Error('async fail');
    const fn = jest.fn().mockRejectedValue(err);
    const handler = asyncHandler(fn);
    const next = jest.fn();
    await handler({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
  });

  test('does not call next on success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const handler = asyncHandler(fn);
    const next = jest.fn();
    await handler({}, {}, next);
    expect(next).not.toHaveBeenCalled();
  });

  test('handles rejected async functions', async () => {
    const err = new AppError('validation failed', 422);
    const fn = jest.fn().mockRejectedValue(err);
    const handler = asyncHandler(fn);
    const next = jest.fn();
    await handler({}, {}, next);
    expect(next).toHaveBeenCalledWith(err);
    expect(err.status).toBe(422);
  });
});
