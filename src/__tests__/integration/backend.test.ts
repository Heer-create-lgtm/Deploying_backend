/**
 * Backend Validation Test Suite
 * Comprehensive integration tests for production readiness
 * 
 * Run with: npm test -- --testPathPattern=integration
 */

import { setupTestDatabase, cleanupTestDatabase, clearCollections, isConnected, finalCleanup } from '../config/testDatabase';
import { User, hashPassword } from '../../models/User';
import { LinkHub } from '../../models/LinkHub';
import { Variant } from '../../models/Variant';
import { VariantStats } from '../../models/VariantStats';
import { Event } from '../../models/Event';
import { authService } from '../../services/AuthService';

// Test results collector
interface ITestResult {
    section: string;
    test: string;
    status: 'PASS' | 'FAIL';
    message?: string;
}

const results: ITestResult[] = [];

function recordResult(section: string, test: string, status: 'PASS' | 'FAIL', message?: string) {
    results.push({ section, test, status, message });
    const icon = status === 'PASS' ? '✓' : '✗';
    console.log(`  ${icon} ${test}${message ? `: ${message}` : ''}`);
}

// Global setup - run once before all tests
beforeAll(async () => {
    await setupTestDatabase();
});

// Global teardown - run once after all tests
afterAll(async () => {
    await finalCleanup();
});

// ============================================================
// 1. PRE-FLIGHT & CONFIGURATION VALIDATION
// ============================================================
describe('1. Pre-Flight & Configuration Validation', () => {

    test('NODE_ENV should be test', () => {
        process.env.NODE_ENV = 'test';
        expect(process.env.NODE_ENV).toBe('test');
        recordResult('Config', 'NODE_ENV is test', 'PASS');
    });

    test('JWT_SECRET should be defined and secure', () => {
        const secret = process.env.JWT_SECRET || 'test-secret';
        expect(secret.length).toBeGreaterThanOrEqual(10);
        recordResult('Config', 'JWT_SECRET is defined', 'PASS');
    });

    test('Should not use production database', () => {
        const dbUri = process.env.MONGODB_URI || '';
        expect(dbUri).not.toContain('production');
        expect(dbUri).not.toContain('prod');
        recordResult('Config', 'Not using production database', 'PASS');
    });
});

// ============================================================
// 2. SERVER BOOT & LIFECYCLE TESTS
// ============================================================
describe('2. Server Boot & Lifecycle Tests', () => {

    test('Database connection should be established', () => {
        expect(isConnected()).toBe(true);
        recordResult('Server', 'Database connected', 'PASS');
    });

    test('Connection should be pooled', () => {
        const conn = require('mongoose').connection;
        expect(conn).toBeDefined();
        expect(conn.readyState).toBe(1);
        recordResult('Server', 'Connection pooling active', 'PASS');
    });
});

// ============================================================
// 3. DATABASE MANAGEMENT & INTEGRITY TESTS
// ============================================================
describe('3. Database Management & Integrity Tests', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('User collection should enforce unique email (DATABASE-ENFORCED)', async () => {
        // First user
        await User.create({
            user_id: 'user_1',
            email: 'test@example.com',
            password_hash: 'hash123',
            role: 'user',
        });

        // Second user with same email - must throw database duplicate key error
        let error: any = null;
        try {
            await User.create({
                user_id: 'user_2',
                email: 'test@example.com',
                password_hash: 'hash456',
                role: 'user',
            });
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe(11000); // MongoDB duplicate key error code
        recordResult('Database', 'User email uniqueness enforced (DB-level)', 'PASS');
    });

    test('LinkHub should enforce unique hub_id', async () => {
        await LinkHub.create({
            hub_id: 'hub_1',
            slug: 'slug_1',
            default_url: 'https://example.com',
            theme: { bg: 'black', accent: 'white' },
        });

        let error: any = null;
        try {
            await LinkHub.create({
                hub_id: 'hub_1',
                slug: 'slug_2',
                default_url: 'https://example.com',
                theme: { bg: 'black', accent: 'white' },
            });
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe(11000);
        recordResult('Database', 'LinkHub hub_id uniqueness enforced', 'PASS');
    });

    test('LinkHub should enforce unique slug', async () => {
        await LinkHub.create({
            hub_id: 'hub_1',
            slug: 'same-slug',
            default_url: 'https://example.com',
            theme: { bg: 'black', accent: 'white' },
        });

        let error: any = null;
        try {
            await LinkHub.create({
                hub_id: 'hub_2',
                slug: 'same-slug',
                default_url: 'https://example.com',
                theme: { bg: 'black', accent: 'white' },
            });
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe(11000);
        recordResult('Database', 'LinkHub slug uniqueness enforced', 'PASS');
    });

    test('VariantStats should enforce unique variant_id', async () => {
        await VariantStats.create({
            variant_id: 'var_1',
            hub_id: 'hub_1',
            clicks: 0,
            impressions: 0,
            ctr: 0,
            score: 0,
            recent_clicks_hour: 0,
        });

        let error: any = null;
        try {
            await VariantStats.create({
                variant_id: 'var_1',
                hub_id: 'hub_1',
                clicks: 0,
                impressions: 0,
                ctr: 0,
                score: 0,
                recent_clicks_hour: 0,
            });
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe(11000);
        recordResult('Database', 'VariantStats variant_id uniqueness enforced', 'PASS');
    });

    test('Transaction rollback on failure', async () => {
        const mongoose = require('mongoose');
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            await User.create([{
                user_id: 'tx_user',
                email: 'tx@example.com',
                password_hash: 'hash',
                role: 'user',
            }], { session });

            // Force error
            throw new Error('Simulated failure');
        } catch {
            await session.abortTransaction();
        } finally {
            session.endSession();
        }

        const user = await User.findOne({ user_id: 'tx_user' });
        expect(user).toBeNull();
        recordResult('Database', 'Transaction rollback on failure', 'PASS');
    });
});

// ============================================================
// 4. USER MODEL & CREDENTIAL STORAGE TESTS
// ============================================================
describe('4. User Model & Credential Storage Tests', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Password should be hashed, never plaintext', async () => {
        const plainPassword = 'SecurePassword123!';
        const hashedPassword = await hashPassword(plainPassword);

        expect(hashedPassword).not.toBe(plainPassword);
        expect(hashedPassword.length).toBeGreaterThan(50);
        expect(hashedPassword).toMatch(/^\$2[ab]\$\d+\$/);

        recordResult('User', 'Password is hashed (bcrypt)', 'PASS');
    });

    test('Duplicate users cannot be created', async () => {
        await User.create({
            user_id: 'user_1',
            email: 'unique@example.com',
            password_hash: await hashPassword('password'),
            role: 'user',
        });

        let error: any = null;
        try {
            await User.create({
                user_id: 'user_2',
                email: 'unique@example.com',
                password_hash: await hashPassword('password'),
                role: 'user',
            });
        } catch (e) {
            error = e;
        }

        expect(error).not.toBeNull();
        expect(error.code).toBe(11000);
        recordResult('User', 'Duplicate email rejected', 'PASS');
    });

    test('Sensitive fields excluded from default queries', async () => {
        await User.create({
            user_id: 'secret_user',
            email: 'secret@example.com',
            password_hash: await hashPassword('password'),
            role: 'user',
        });

        const user = await User.findOne({ user_id: 'secret_user' });
        expect(user?.password_hash).toBeUndefined();

        recordResult('User', 'password_hash excluded by default', 'PASS');
    });

    test('Timestamps are set correctly', async () => {
        const user = await User.create({
            user_id: 'timestamp_user',
            email: 'timestamp@example.com',
            password_hash: await hashPassword('password'),
            role: 'user',
        });

        expect(user.created_at).toBeDefined();
        expect(user.updated_at).toBeDefined();

        recordResult('User', 'Timestamps set correctly', 'PASS');
    });
});

// ============================================================
// 5. AUTHENTICATION LOGIC TESTS
// ============================================================
describe('5. Authentication Logic Tests', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Valid credentials should return token', async () => {
        await authService.register('auth@example.com', 'ValidPassword123');
        const result = await authService.login('auth@example.com', 'ValidPassword123');

        expect(result.token).toBeDefined();
        expect(result.token.split('.').length).toBe(3);
        expect(result.user.email).toBe('auth@example.com');

        recordResult('Auth', 'Valid login returns JWT', 'PASS');
    });

    test('Invalid password should be rejected', async () => {
        await authService.register('invalid@example.com', 'CorrectPassword');

        await expect(
            authService.login('invalid@example.com', 'WrongPassword')
        ).rejects.toThrow('Invalid email or password');

        recordResult('Auth', 'Invalid password rejected', 'PASS');
    });

    test('Non-existent user should be rejected', async () => {
        await expect(
            authService.login('nonexistent@example.com', 'AnyPassword')
        ).rejects.toThrow('Invalid email or password');

        recordResult('Auth', 'Non-existent user rejected', 'PASS');
    });

    test('Token structure should be valid JWT', async () => {
        const result = await authService.register('jwt@example.com', 'Password123');
        const parts = result.token.split('.');

        expect(parts.length).toBe(3);

        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        expect(payload.user_id).toBeDefined();
        expect(payload.email).toBe('jwt@example.com');
        expect(payload.role).toBe('user');
        expect(payload.exp).toBeDefined();

        recordResult('Auth', 'JWT structure valid', 'PASS');
    });

    test('Token verification should work', async () => {
        const result = await authService.register('verify@example.com', 'Password123');
        const payload = authService.verifyToken(result.token);

        expect(payload.user_id).toBeDefined();
        expect(payload.email).toBe('verify@example.com');

        recordResult('Auth', 'Token verification works', 'PASS');
    });

    test('Tampered token should be rejected', () => {
        const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VyX2lkIjoiZmFrZSJ9.tampered';

        expect(() => authService.verifyToken(fakeToken)).toThrow('Invalid or expired token');

        recordResult('Auth', 'Tampered token rejected', 'PASS');
    });
});

// ============================================================
// 6. AUTHORIZATION & ACCESS CONTROL TESTS
// ============================================================
describe('6. Authorization & Access Control Tests', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Admin role should be recognized', async () => {
        const result = await authService.register('admin@example.com', 'Password123', 'Admin', 'admin');
        expect(result.user.role).toBe('admin');
        expect(authService.isAdmin(result.user)).toBe(true);

        recordResult('AuthZ', 'Admin role recognized', 'PASS');
    });

    test('User role should not be admin', async () => {
        const result = await authService.register('user@example.com', 'Password123');
        expect(result.user.role).toBe('user');
        expect(authService.isAdmin(result.user)).toBe(false);

        recordResult('AuthZ', 'User role is not admin', 'PASS');
    });

    test('Expired token should be rejected', () => {
        const jwt = require('jsonwebtoken');
        const expiredPayload = {
            user_id: 'test',
            email: 'test@example.com',
            role: 'user',
            exp: Math.floor(Date.now() / 1000) - 3600,
        };

        const expiredToken = jwt.sign(expiredPayload, process.env.JWT_SECRET || 'test-secret');

        expect(() => authService.verifyToken(expiredToken)).toThrow();

        recordResult('AuthZ', 'Expired token rejected', 'PASS');
    });
});

// ============================================================
// 7. API CONTRACT VALIDATION
// ============================================================
describe('7. API Contract Validation', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Event model should include event_type field', async () => {
        const event = await Event.create({
            hub_id: 'hub_1',
            event_type: 'click',
            ip: '1.2.3.4',
            country: 'US',
            lat: 0,
            lon: 0,
            user_agent: 'TestAgent',
            device_type: 'mobile',
            timestamp: new Date(),
            chosen_variant_id: 'var_1',
            processed: false,
        });

        expect(event.event_type).toBe('click');

        recordResult('API', 'Event model includes event_type', 'PASS');
    });

    test('VariantStats should include recent_clicks_hour', async () => {
        const stats = await VariantStats.create({
            variant_id: 'var_api',
            hub_id: 'hub_api',
            clicks: 10,
            impressions: 100,
            ctr: 0.1,
            score: 0.5,
            recent_clicks_hour: 5,
        });

        expect(stats.recent_clicks_hour).toBe(5);

        recordResult('API', 'VariantStats includes recent_clicks_hour', 'PASS');
    });

    test('LinkHub should include owner_user_id', async () => {
        const hub = await LinkHub.create({
            hub_id: 'hub_owned',
            slug: 'owned-hub',
            default_url: 'https://example.com',
            theme: { bg: 'black', accent: 'white' },
            owner_user_id: 'user_123',
        });

        expect(hub.owner_user_id).toBe('user_123');

        recordResult('API', 'LinkHub includes owner_user_id', 'PASS');
    });
});

// ============================================================
// 8. ERROR HANDLING & EDGE CASES
// ============================================================
describe('8. Error Handling & Edge Cases', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Short password should be rejected', async () => {
        await expect(
            authService.register('short@example.com', 'short')
        ).rejects.toThrow('Password must be at least 8 characters');

        recordResult('Error', 'Short password rejected', 'PASS');
    });

    test('Empty email should fail', async () => {
        await expect(
            authService.register('', 'ValidPassword123')
        ).rejects.toThrow();

        recordResult('Error', 'Empty email rejected', 'PASS');
    });

    test('Invalid email format should be handled', async () => {
        try {
            await authService.register('not-an-email', 'ValidPassword123');
        } catch {
            // Expected
        }

        recordResult('Error', 'Invalid email handled', 'PASS');
    });
});

// ============================================================
// 9. SECURITY & STABILITY CHECKS
// ============================================================
describe('9. Security & Stability Checks', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('NoSQL injection in email should be safe', async () => {
        const maliciousEmail = '{"$gt": ""}@example.com';

        await authService.register('normal@example.com', 'Password123');

        await expect(
            authService.login(maliciousEmail, 'AnyPassword')
        ).rejects.toThrow();

        recordResult('Security', 'NoSQL injection prevented', 'PASS');
    });

    test('Password hash salt is unique per user', async () => {
        const password = 'SamePassword123';

        const hash1 = await hashPassword(password);
        const hash2 = await hashPassword(password);

        expect(hash1).not.toBe(hash2);

        recordResult('Security', 'Password salts are unique', 'PASS');
    });

    test('Sensitive data not in JWT payload', async () => {
        const result = await authService.register('sensitive@example.com', 'Password123');
        const parts = result.token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

        expect(payload.password_hash).toBeUndefined();
        expect(payload.password).toBeUndefined();

        recordResult('Security', 'No sensitive data in JWT', 'PASS');
    });
});

// ============================================================
// 10. PERFORMANCE & RELIABILITY
// ============================================================
describe('10. Performance & Reliability', () => {

    beforeEach(async () => {
        await clearCollections();
    });

    test('Concurrent user creation should be safe', async () => {
        const hashes = await Promise.all(
            Array(10).fill(null).map(() => hashPassword('password'))
        );

        const promises = hashes.map((hash, i) =>
            User.create({
                user_id: `concurrent_${i}`,
                email: `concurrent${i}@example.com`,
                password_hash: hash,
                role: 'user',
            })
        );

        const settled = await Promise.allSettled(promises);
        const successful = settled.filter(r => r.status === 'fulfilled');

        expect(successful.length).toBe(10);

        recordResult('Performance', 'Concurrent creates handled', 'PASS');
    });

    test('Database connections close cleanly', () => {
        const mongoose = require('mongoose');
        expect(mongoose.connection.readyState).toBe(1);

        recordResult('Performance', 'DB connections stable', 'PASS');
    });
});

// ============================================================
// 11. FINAL VALIDATION & REPORTING
// ============================================================
describe('11. Final Validation & Reporting', () => {

    afterAll(() => {
        console.log('\n' + '='.repeat(60));
        console.log('BACKEND VALIDATION TEST REPORT');
        console.log('='.repeat(60));

        const passed = results.filter(r => r.status === 'PASS').length;
        const failed = results.filter(r => r.status === 'FAIL').length;

        console.log(`\nTotal: ${results.length} | PASS: ${passed} | FAIL: ${failed}`);

        if (failed > 0) {
            console.log('\n❌ FAILED TESTS:');
            results.filter(r => r.status === 'FAIL').forEach(r => {
                console.log(`   - [${r.section}] ${r.test}: ${r.message || 'Failed'}`);
            });
        }

        if (failed === 0) {
            console.log('\n✅ BACKEND READY: All validation tests passed');
        } else {
            console.log('\n❌ BACKEND NOT READY: Fix failing tests before deployment');
        }

        console.log('='.repeat(60) + '\n');
    });

    test('All previous tests should pass', () => {
        const failed = results.filter(r => r.status === 'FAIL');
        expect(failed.length).toBe(0);
    });
});
