/**
 * Sanity tests for the authentication validation rules (FR-C2).
 * These tests don't hit the DB; they exercise the validateRegistration
 * helper indirectly by invoking the controller with a mocked db.
 */

// Stub the db module BEFORE the controller loads it.
jest.mock('../src/config/db', () => ({
  query: jest.fn(),
  getConnection: jest.fn(),
}));

const auth = require('../src/controllers/auth.controller');

function mockReqRes(body) {
  const req = { body };
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
  return { req, res };
}

describe('FR-C2 registration validation', () => {
  test('rejects empty fields', async () => {
    const { req, res } = mockReqRes({});
    await auth.register(req, res, (err) => {
      expect(err.publicMessage).toMatch(/required/i);
    });
  });

  test('rejects short username', async () => {
    const { req, res } = mockReqRes({
      username: 'abc', password: 'Pass123', confirmPassword: 'Pass123',
      email: 'a@b.co', phone: '123', role: 'customer'
    });
    await auth.register(req, res, (err) => {
      expect(err.publicMessage).toMatch(/6.20/);
    });
  });

  test('rejects password without numbers', async () => {
    const { req, res } = mockReqRes({
      username: 'aliceone', password: 'OnlyLet', confirmPassword: 'OnlyLet',
      email: 'a@b.co', phone: '123', role: 'customer'
    });
    await auth.register(req, res, (err) => {
      expect(err.publicMessage).toMatch(/letters and numbers/i);
    });
  });

  test('rejects mismatched confirmation', async () => {
    const { req, res } = mockReqRes({
      username: 'aliceone', password: 'Pass123', confirmPassword: 'Other123',
      email: 'a@b.co', phone: '123', role: 'customer'
    });
    await auth.register(req, res, (err) => {
      expect(err.publicMessage).toMatch(/match/i);
    });
  });

  test('rejects bad email format', async () => {
    const { req, res } = mockReqRes({
      username: 'aliceone', password: 'Pass123', confirmPassword: 'Pass123',
      email: 'not-an-email', phone: '123', role: 'customer'
    });
    await auth.register(req, res, (err) => {
      expect(err.publicMessage).toMatch(/email/i);
    });
  });
});
