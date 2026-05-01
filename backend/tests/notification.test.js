const request = require('supertest');
const app = require('../src/app');
const notifService = require('../src/services/notification.service');
const { customerToken } = require('./helpers');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/notifications', () => {
  test('returns 401 without token', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });

  test('returns notifications for user', async () => {
    const notifications = [
      { id: 1, message: 'Order confirmed', read: false },
      { id: 2, message: 'Delivery started', read: true },
    ];
    notifService.listForUser.mockResolvedValue(notifications);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(notifications);
    expect(notifService.listForUser).toHaveBeenCalledWith(1, false);
  });

  test('passes unread=true filter', async () => {
    notifService.listForUser.mockResolvedValue([]);

    const res = await request(app)
      .get('/api/notifications?unread=true')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(notifService.listForUser).toHaveBeenCalledWith(1, true);
  });
});

describe('POST /api/notifications/:id/read', () => {
  test('marks notification as read', async () => {
    notifService.markRead.mockResolvedValue();

    const res = await request(app)
      .post('/api/notifications/5/read')
      .set('Authorization', `Bearer ${customerToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Marked read' });
    expect(notifService.markRead).toHaveBeenCalledWith(1, '5');
  });

  test('returns 401 without token', async () => {
    const res = await request(app).post('/api/notifications/5/read');
    expect(res.status).toBe(401);
  });
});
