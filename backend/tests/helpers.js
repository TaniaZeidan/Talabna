const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key';

function tokenFor(payload) {
  return jwt.sign(
    { userID: 1, role: 'customer', username: 'testuser', ...payload },
    SECRET,
    { expiresIn: '1h' }
  );
}

function customerToken(overrides = {}) {
  return tokenFor({ role: 'customer', ...overrides });
}

function vendorToken(overrides = {}) {
  return tokenFor({ role: 'vendor', userID: 2, username: 'vendoruser', ...overrides });
}

function driverToken(overrides = {}) {
  return tokenFor({ role: 'driver', userID: 3, username: 'driveruser', ...overrides });
}

function adminToken(overrides = {}) {
  return tokenFor({ role: 'admin', userID: 4, username: 'adminuser', ...overrides });
}

function resetMocks(db) {
  jest.clearAllMocks();
  db.query.mockReset();
  db.__mockConnection.query.mockReset();
  db.__mockConnection.beginTransaction.mockReset().mockResolvedValue();
  db.__mockConnection.commit.mockReset().mockResolvedValue();
  db.__mockConnection.rollback.mockReset().mockResolvedValue();
  db.__mockConnection.release.mockReset();
  db.getConnection.mockReset().mockResolvedValue(db.__mockConnection);
}

module.exports = { tokenFor, customerToken, vendorToken, driverToken, adminToken, resetMocks };
