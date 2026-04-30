/**
 * Wraps an async route handler so thrown errors propagate to the
 * Express error middleware.
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Global error handler. Keeps responses consistent.
 */
function errorHandler(err, req, res, next) {
  console.error('[error]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: err.publicMessage || (status === 500 ? 'Internal server error' : err.message),
  });
}

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.publicMessage = message;
  }
}

module.exports = { asyncHandler, errorHandler, AppError };
