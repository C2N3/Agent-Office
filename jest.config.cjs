module.exports = {
  testEnvironment: 'node',
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    'src/**/*.js',
    'public/**/*.ts',
    'public/**/*.tsx',
    '!public/**/*.d.ts',
    '!src/**/*.d.ts',
    '!node_modules/**',
    '!coverage/**',
    '!__tests__/**',
    '!__mocks__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 25,
      functions: 25,
      lines: 30,
      statements: 30
    }
  },
  forceExit: true,
  moduleNameMapper: {
    '^electron$': '<rootDir>/__mocks__/electron.js',
    '\\.(css|scss)$': '<rootDir>/__mocks__/styleMock.js'
  },
  moduleFileExtensions: [
    'js',
    'ts',
    'tsx',
    'json',
    'node'
  ],
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  transform: {
    '^.+\\.[jt]sx?$': '<rootDir>/scripts/jest-ts-transform.cjs'
  },
  verbose: true
};
