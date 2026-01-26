import rateLimit from 'express-rate-limit';
import { redis } from '../config/database';

/**
 * Rate Limiter Middleware
 * Provides sliding window rate limiting using Redis
 */

// Redirect endpoint rate limiter (200 requests per minute per IP)
export const redirectLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    // Disable all validation to avoid IPv6 errors
    validate: false,
});

// Admin API rate limiter (100 requests per minute per IP)
export const adminLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin requests, please try again later' },
    validate: false,
});

// Login rate limiter (5 attempts per 15 minutes per IP)
export const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
    skipSuccessfulRequests: true,
    validate: false,
});

/**
 * Custom Redis-based rate limiter for more granular control
 */
export class RedisRateLimiter {
    private prefix = 'ratelimit:';

    /**
     * Check if request is rate limited
     * @param key - Unique key for the rate limit (e.g., IP address)
     * @param limit - Maximum number of requests
     * @param windowSeconds - Time window in seconds
     * @returns true if request should be blocked, false otherwise
     */
    async isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean> {
        const redisKey = `${this.prefix}${key}`;
        const now = Date.now();
        const windowStart = now - (windowSeconds * 1000);

        try {
            // Remove old entries
            await redis.zremrangebyscore(redisKey, 0, windowStart);

            // Count current entries
            const count = await redis.zcard(redisKey);

            if (count >= limit) {
                return true;
            }

            // Add new entry
            await redis.zadd(redisKey, now, `${now}`);
            await redis.expire(redisKey, windowSeconds);

            return false;
        } catch (error) {
            console.error('Rate limiter error:', error);
            // Fail open on errors
            return false;
        }
    }

    /**
     * Get remaining requests for a key
     */
    async getRemaining(key: string, limit: number, windowSeconds: number): Promise<number> {
        const redisKey = `${this.prefix}${key}`;
        const windowStart = Date.now() - (windowSeconds * 1000);

        try {
            await redis.zremrangebyscore(redisKey, 0, windowStart);
            const count = await redis.zcard(redisKey);
            return Math.max(0, limit - count);
        } catch {
            return limit;
        }
    }
}

export const redisRateLimiter = new RedisRateLimiter();
