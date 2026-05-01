const mockConnection = {
  query: jest.fn(),
  beginTransaction: jest.fn().mockResolvedValue(),
  commit: jest.fn().mockResolvedValue(),
  rollback: jest.fn().mockResolvedValue(),
  release: jest.fn(),
};

const db = {
  query: jest.fn(),
  getConnection: jest.fn().mockResolvedValue(mockConnection),
  __mockConnection: mockConnection,
};

module.exports = db;
