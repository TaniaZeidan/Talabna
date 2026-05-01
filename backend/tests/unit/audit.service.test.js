const db = require('../../src/config/db');
const { logAction } = require('../../src/services/audit.service');

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
});

describe('logAction()', () => {
  test('inserts audit log with all params', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await logAction(5, 'LOGIN_SUCCESS', 'from 192.168.1.1');
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_logs'),
      [5, 'LOGIN_SUCCESS', 'from 192.168.1.1']
    );
  });

  test('defaults details to empty string', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await logAction(5, 'LOGOUT');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [5, 'LOGOUT', '']
    );
  });

  test('handles null userID for system actions', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await logAction(null, 'ORDER_AUTOCANCELLED', 'orderID=42');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [null, 'ORDER_AUTOCANCELLED', 'orderID=42']
    );
  });

  test('swallows db errors without throwing', async () => {
    db.query.mockRejectedValueOnce(new Error('deadlock'));
    const spy = jest.spyOn(console, 'error').mockImplementation();
    await expect(logAction(1, 'CRASH')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[audit]'),
      expect.any(String)
    );
    spy.mockRestore();
  });

  test('never breaks the main flow on failure', async () => {
    db.query.mockRejectedValueOnce(new Error('timeout'));
    const spy = jest.spyOn(console, 'error').mockImplementation();
    const result = await logAction(1, 'TEST');
    expect(result).toBeUndefined();
    spy.mockRestore();
  });
});
