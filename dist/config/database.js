"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeConnections = exports.redis = exports.connectMongoDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// MongoDB Connection
const connectMongoDB = async () => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-link-hub';
    try {
        await mongoose_1.default.connect(uri);
        console.log('✓ MongoDB connected successfully');
    }
    catch (error) {
        console.error('✗ MongoDB connection error:', error);
        process.exit(1);
    }
    mongoose_1.default.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
    });
    mongoose_1.default.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
    });
};
exports.connectMongoDB = connectMongoDB;
// Redis Client with Mock Fallback
class MockRedis {
    store = new Map();
    listStore = new Map();
    expiries = new Map();
    constructor() {
        console.warn('⚠️  Using In-Memory Mock Redis (Data will not persist)');
    }
    on(event, callback) {
        if (event === 'connect')
            callback(); // Simulate immediate connection
    }
    async get(key) {
        return this.store.get(key) || null;
    }
    async set(key, value) {
        this.store.set(key, value);
        return 'OK';
    }
    async setex(key, seconds, value) {
        this.store.set(key, value);
        if (this.expiries.has(key))
            clearTimeout(this.expiries.get(key));
        const timeout = setTimeout(() => {
            this.store.delete(key);
            this.expiries.delete(key);
        }, seconds * 1000);
        this.expiries.set(key, timeout);
        return 'OK';
    }
    async expire(key, seconds) {
        if (this.store.has(key)) {
            const val = this.store.get(key);
            return this.setex(key, seconds, val).then(() => 1);
        }
        return 0;
    }
    async del(...keys) {
        let count = 0;
        for (const key of keys) {
            if (this.store.delete(key))
                count++;
        }
        return count;
    }
    // List operations
    async lpush(key, ...values) {
        if (!this.listStore.has(key))
            this.listStore.set(key, []);
        const list = this.listStore.get(key);
        return list.unshift(...values);
    }
    async rpop(key) {
        if (!this.listStore.has(key))
            return null;
        const list = this.listStore.get(key);
        return list.pop() || null;
    }
    async blpop(key, timeout) {
        return this.rpop(key); // Non-blocking fallback
    }
    async brpop(key, timeout) {
        const val = await this.rpop(key);
        return val ? [key, val] : null; // Non-blocking fallback
    }
    async llen(key) {
        if (!this.listStore.has(key))
            return 0;
        return this.listStore.get(key).length;
    }
    // Keys/TTL
    async keys(pattern) {
        // Simple shim, ignores pattern
        return Array.from(this.store.keys());
    }
    async ttl(key) {
        return -1;
    }
    // Sorted Sets (Rate Limiting Mock - No-op/Allow all)
    async zadd(key, ...args) {
        return 1;
    }
    async zremrangebyscore(key, min, max) {
        return 0;
    }
    async zcard(key) {
        return 0; // Always return 0 so limits aren't hit
    }
    async quit() {
        this.expiries.forEach(t => clearTimeout(t));
        this.store.clear();
        this.listStore.clear();
        return 'OK';
    }
}
// Try to use real Redis, fallback to Mock if configured or error
const useMock = process.env.USE_MOCK_REDIS === 'true';
// @ts-ignore
exports.redis = useMock ? new MockRedis() : (process.env.REDIS_URL ? new ioredis_1.default(process.env.REDIS_URL) : new ioredis_1.default({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
}));
if (!useMock) {
    exports.redis.on('connect', () => {
        console.log('✓ Redis connected successfully');
    });
    exports.redis.on('error', (err) => {
        console.error('✗ Redis connection error:', err);
    });
}
// Graceful shutdown
const closeConnections = async () => {
    await mongoose_1.default.connection.close();
    await exports.redis.quit();
    console.log('All connections closed');
};
exports.closeConnections = closeConnections;
//# sourceMappingURL=database.js.map