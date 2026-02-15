/**
 * Jest Setup File
 * Configures test environment before each test file
 */

// Set test environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-for-testing-only-minimum-16-chars';
process.env.HASH_SALT_ROUNDS = '10';
process.env.PORT = '3001';

// Increase timeout for database operations
jest.setTimeout(30000);

// Suppress console logs during tests (optional)
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
// };

beforeAll(() => {
    console.log('\n=== Backend Validation Test Suite ===\n');
});

afterAll(() => {
    console.log('\n=== Test Suite Complete ===\n');
});
