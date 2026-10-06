/** @type {import('jest').Config} */
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^@app/contracts$': '<rootDir>/../../libs/contracts/dist/index.js',
    '^@app/common$': '<rootDir>/../../libs/common/dist/index.js',
  },
  testTimeout: 30000,
};
