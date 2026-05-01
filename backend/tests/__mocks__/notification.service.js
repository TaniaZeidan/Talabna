module.exports = {
  notify: jest.fn().mockResolvedValue(),
  listForUser: jest.fn().mockResolvedValue([]),
  markRead: jest.fn().mockResolvedValue(),
};
