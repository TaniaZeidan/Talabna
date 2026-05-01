const db = require('../../src/config/db');
const { notify, listForUser, markRead } = require('../../src/services/notification.service');

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
});

describe('notify()', () => {
  test('inserts notification with all params', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await notify(5, 'Order confirmed', 42);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO notifications'),
      [5, 'Order confirmed', 42]
    );
  });

  test('defaults relatedOrderID to null', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await notify(5, 'Welcome!');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [5, 'Welcome!', null]
    );
  });

  test('swallows db errors silently', async () => {
    db.query.mockRejectedValueOnce(new Error('connection lost'));
    const spy = jest.spyOn(console, 'error').mockImplementation();
    await expect(notify(5, 'msg')).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('[notify]'), expect.any(String));
    spy.mockRestore();
  });

  test('does not throw even with null userID', async () => {
    db.query.mockResolvedValueOnce([{ insertId: 1 }]);
    await expect(notify(null, 'system msg', 1)).resolves.toBeUndefined();
  });
});

describe('listForUser()', () => {
  test('returns all notifications for user', async () => {
    const rows = [{ notificationID: 1, message: 'hi' }, { notificationID: 2, message: 'bye' }];
    db.query.mockResolvedValueOnce([rows]);
    const result = await listForUser(5);
    expect(result).toEqual(rows);
    expect(db.query).toHaveBeenCalledWith(
      expect.not.stringContaining('AND isRead = FALSE'),
      [5]
    );
  });

  test('filters unread only when flag is true', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await listForUser(5, true);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('AND isRead = FALSE'),
      [5]
    );
  });

  test('does not filter when unreadOnly is false', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await listForUser(5, false);
    expect(db.query).toHaveBeenCalledWith(
      expect.not.stringContaining('AND isRead = FALSE'),
      [5]
    );
  });

  test('returns empty array when no notifications', async () => {
    db.query.mockResolvedValueOnce([[]]);
    const result = await listForUser(99);
    expect(result).toEqual([]);
  });

  test('query includes ORDER BY and LIMIT 50', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await listForUser(1);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('ORDER BY createdAt DESC');
    expect(sql).toContain('LIMIT 50');
  });
});

describe('markRead()', () => {
  test('updates the correct notification for the user', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
    await markRead(5, 42);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE notifications SET isRead = TRUE'),
      [42, 5]
    );
  });

  test('scopes update to both notificationID and userID', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    await markRead(5, 999);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('notificationID = ?');
    expect(sql).toContain('userID = ?');
  });
});
