"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisRateLimiter = exports.RedisRateLimiter = exports.loginLimiter = exports.adminLimiter = exports.redirectLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const database_1 = require("../config/database");
/**
 * Rate Limiter Middleware
 * Provides sliding window rate limiting using Redis
 */
// Redirect endpoint rate limiter (200 requests per minute per IP)
exports.redirectLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
    // Disable all validation to avoid IPv6 errors
    validate: false,
});
// Admin API rate limiter (100 requests per minute per IP)
exports.adminLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many admin requests, please try again later' },
    validate: false,
});
// Login rate limiter (5 attempts per 15 minutes per IP)
exports.loginLimiter = (0, express_rate_limit_1.default)({
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
class RedisRateLimiter {
    prefix = 'ratelimit:';
    /**
     * Check if request is rate limited
     * @param key - Unique key for the rate limit (e.g., IP address)
     * @param limit - Maximum number of requests
     * @param windowSeconds - Time window in seconds
     * @returns true if request should be blocked, false otherwise
     */
    async isRateLimited(key, limit, windowSeconds) {
        const redisKey = `${this.prefix}${key}`;
        const now = Date.now();
        const windowStart = now - (windowSeconds * 1000);
        try {
            // Remove old entries
            await database_1.redis.zremrangebyscore(redisKey, 0, windowStart);
            // Count current entries
            const count = await database_1.redis.zcard(redisKey);
            if (count >= limit) {
                return true;
            }
            // Add new entry
            await database_1.redis.zadd(redisKey, now, `${now}`);
            await database_1.redis.expire(redisKey, windowSeconds);
            return false;
        }
        catch (error) {
            console.error('Rate limiter error:', error);
            // Fail open on errors
            return false;
        }
    }
    /**
     * Get remaining requests for a key
     */
    async getRemaining(key, limit, windowSeconds) {
        const redisKey = `${this.prefix}${key}`;
        const windowStart = Date.now() - (windowSeconds * 1000);
        try {
            await database_1.redis.zremrangebyscore(redisKey, 0, windowStart);
            const count = await database_1.redis.zcard(redisKey);
            return Math.max(0, limit - count);
        }
        catch {
            return limit;
        }
    }
}
exports.RedisRateLimiter = RedisRateLimiter;
exports.redisRateLimiter = new RedisRateLimiter();
//# sourceMappingURL=rateLimiter.js.map