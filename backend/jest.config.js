module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      moduleNameMapper: {
        '^(.*)/config/db$': '<rootDir>/tests/__mocks__/db.js',
      },
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      setupFiles: ['<rootDir>/tests/setup.js'],
      testMatch: ['<rootDir>/tests/*.test.js'],
      moduleNameMapper: {
        '^(.*)/config/db$':                      '<rootDir>/tests/__mocks__/db.js',
        '^(.*)/services/audit\\.service$':       '<rootDir>/tests/__mocks__/audit.service.js',
        '^(.*)/services/email\\.service$':       '<rootDir>/tests/__mocks__/email.service.js',
        '^(.*)/services/notification\\.service$':'<rootDir>/tests/__mocks__/notification.service.js',
      },
    },
  ],
  testPathIgnorePatterns: ['/node_modules/'],
};
