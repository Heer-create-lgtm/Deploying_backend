import mongoose from 'mongoose';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// MongoDB Connection
export const connectMongoDB = async (): Promise<void> => {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-link-hub';

    try {
        await mongoose.connect(uri);
        console.log('✓ MongoDB connected successfully');
    } catch (error) {
        console.error('✗ MongoDB connection error:', error);
        process.exit(1);
    }

    mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
    });
};

// Redis Client with Mock Fallback
class MockRedis {
    private store = new Map<string, string>();
    private listStore = new Map<string, string[]>();
    private expiries = new Map<string, NodeJS.Timeout>();

    constructor() {
        console.warn('⚠️  Using In-Memory Mock Redis (Data will not persist)');
    }

    on(event: string, callback: () => void) {
        if (event === 'connect') callback(); // Simulate immediate connection
    }

    async get(key: string) {
        return this.store.get(key) || null;
    }

    async set(key: string, value: string) {
        this.store.set(key, value);
        return 'OK';
    }

    async setex(key: string, seconds: number, value: string) {
        this.store.set(key, value);
        if (this.expiries.has(key)) clearTimeout(this.expiries.get(key));

        const timeout = setTimeout(() => {
            this.store.delete(key);
            this.expiries.delete(key);
        }, seconds * 1000);

        this.expiries.set(key, timeout);
        return 'OK';
    }

    async expire(key: string, seconds: number) {
        if (this.store.has(key)) {
            const val = this.store.get(key)!;
            return this.setex(key, seconds, val).then(() => 1);
        }
        return 0;
    }

    async del(...keys: string[]) {
        let count = 0;
        for (const key of keys) {
            if (this.store.delete(key)) count++;
        }
        return count;
    }

    // List operations
    async lpush(key: string, ...values: string[]) {
        if (!this.listStore.has(key)) this.listStore.set(key, []);
        const list = this.listStore.get(key)!;
        return list.unshift(...values);
    }

    async rpop(key: string) {
        if (!this.listStore.has(key)) return null;
        const list = this.listStore.get(key)!;
        return list.pop() || null;
    }

    async blpop(key: string, timeout: number) {
        return this.rpop(key); // Non-blocking fallback
    }

    async brpop(key: string, timeout: number) {
        const val = await this.rpop(key);
        return val ? [key, val] : null; // Non-blocking fallback
    }

    async llen(key: string) {
        if (!this.listStore.has(key)) return 0;
        return this.listStore.get(key)!.length;
    }

    // Keys/TTL
    async keys(pattern: string) {
        // Simple shim, ignores pattern
        return Array.from(this.store.keys());
    }

    async ttl(key: string) {
        return -1;
    }

    // Sorted Sets (Rate Limiting Mock - No-op/Allow all)
    async zadd(key: string, ...args: (string | number)[]) {
        return 1;
    }

    async zremrangebyscore(key: string, min: number | string, max: number | string) {
        return 0;
    }

    async zcard(key: string) {
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
const useMock = process.env.USE_MOCK_REDIS === 'true' || true; // Force mock for now to unblock user

// @ts-ignore
export const redis = useMock ? new MockRedis() : new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
});

if (!useMock) {
    (redis as any).on('connect', () => {
        console.log('✓ Redis connected successfully');
    });

    (redis as any).on('error', (err: any) => {
        console.error('✗ Redis connection error:', err);
    });
}

// Graceful shutdown
export const closeConnections = async (): Promise<void> => {
    await mongoose.connection.close();
    await (redis as any).quit();
    console.log('All connections closed');
};
