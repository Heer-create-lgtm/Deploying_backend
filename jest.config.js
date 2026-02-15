/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: [
        '**/__tests__/**/*.test.ts',
        '**/__tests__/integration/**/*.test.ts',
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts',
        '!src/workers/index.ts',
        '!src/seed/**',
        '!src/__tests__/**',
    ],
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50,
        },
    },
    setupFilesAfterEnv: ['<rootDir>/src/__tests__/config/jest.setup.ts'],
    testTimeout: 30000,
    verbose: true,
    forceExit: true,
    detectOpenHandles: true,
};
