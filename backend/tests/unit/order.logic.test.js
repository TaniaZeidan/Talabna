jest.mock('../../src/services/audit.service', () => ({
  logAction: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/services/notification.service', () => ({
  notify: jest.fn().mockResolvedValue(),
  listForUser: jest.fn().mockResolvedValue([]),
  markRead: jest.fn().mockResolvedValue(),
}));

const db = require('../../src/config/db');
const auditService = require('../../src/services/audit.service');
const notifService = require('../../src/services/notification.service');
const { runAutoCancelSweep, POINTS_PER_DOLLAR, DELIVERY_FEE } = require('../../src/controllers/order.controller');

const conn = db.__mockConnection;

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockReset();
  conn.query.mockReset();
  conn.beginTransaction.mockReset().mockResolvedValue();
  conn.commit.mockReset().mockResolvedValue();
  conn.rollback.mockReset().mockResolvedValue();
  conn.release.mockReset();
  db.getConnection.mockReset().mockResolvedValue(conn);
  auditService.logAction.mockClear();
  notifService.notify.mockClear();
});

describe('exported constants', () => {
  test('POINTS_PER_DOLLAR is 1', () => {
    expect(POINTS_PER_DOLLAR).toBe(1);
  });

  test('DELIVERY_FEE is 2.00', () => {
    expect(DELIVERY_FEE).toBe(2.00);
  });
});

describe('runAutoCancelSweep()', () => {
  test('does nothing when no stale orders exist', async () => {
    db.query.mockResolvedValueOnce([[]]);
    await runAutoCancelSweep();
    expect(db.getConnection).not.toHaveBeenCalled();
  });

  test('cancels stale pending orders', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 10, customerID: 1, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(db.getConnection).toHaveBeenCalled();
    expect(conn.beginTransaction).toHaveBeenCalled();
    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining("orderStatus = 'Cancelled'"),
      expect.arrayContaining([10])
    );
    expect(conn.commit).toHaveBeenCalled();
    expect(conn.release).toHaveBeenCalled();
  });

  test('refunds loyalty points when cancelled order had redeemed points', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 20, customerID: 5, pointsRedeemed: 30 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(conn.query).toHaveBeenCalledWith(
      expect.stringContaining('accumulatedPts = accumulatedPts + ?'),
      [30, 30, 5]
    );
  });

  test('does not refund points when redeemPoints is 0', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 30, customerID: 1, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    const loyaltyUpdates = conn.query.mock.calls.filter(
      c => c[0].includes('accumulatedPts')
    );
    expect(loyaltyUpdates).toHaveLength(0);
  });

  test('processes multiple stale orders', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 1, customerID: 10, pointsRedeemed: 0 },
      { orderID: 2, customerID: 20, pointsRedeemed: 15 },
      { orderID: 3, customerID: 30, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(db.getConnection).toHaveBeenCalledTimes(3);
  });

  test('logs auto-cancel action for each order', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 42, customerID: 1, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(auditService.logAction).toHaveBeenCalledWith(null, 'ORDER_AUTOCANCELLED', 'orderID=42');
  });

  test('notifies customer when their order is auto-cancelled', async () => {
    db.query.mockResolvedValueOnce([[
      { orderID: 55, customerID: 7, pointsRedeemed: 0 },
    ]]);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(notifService.notify).toHaveBeenCalledWith(
      7,
      expect.stringContaining('auto-cancelled'),
      55
    );
  });

  test('rolls back on error and continues with other orders', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    db.query.mockResolvedValueOnce([[
      { orderID: 1, customerID: 10, pointsRedeemed: 0 },
      { orderID: 2, customerID: 20, pointsRedeemed: 0 },
    ]]);

    // First order fails
    db.getConnection
      .mockResolvedValueOnce({
        ...conn,
        beginTransaction: jest.fn().mockResolvedValue(),
        query: jest.fn().mockRejectedValueOnce(new Error('lock timeout')),
        rollback: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        release: jest.fn(),
      })
      .mockResolvedValueOnce(conn);
    conn.query.mockResolvedValue([{ affectedRows: 1 }]);

    await runAutoCancelSweep();

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[sweeper]'),
      expect.any(Number),
      expect.any(String)
    );
    spy.mockRestore();
  });

  test('handles sweep query failure gracefully', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    db.query.mockRejectedValueOnce(new Error('db unreachable'));

    await expect(runAutoCancelSweep()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('[sweeper]'),
      expect.any(String)
    );
    spy.mockRestore();
  });
});
