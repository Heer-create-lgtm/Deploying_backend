/**
 * Rate Limiter Middleware
 * Provides sliding window rate limiting using Redis
 */
export declare const redirectLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const adminLimiter: import("express-rate-limit").RateLimitRequestHandler;
export declare const loginLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * Custom Redis-based rate limiter for more granular control
 */
export declare class RedisRateLimiter {
    private prefix;
    /**
     * Check if request is rate limited
     * @param key - Unique key for the rate limit (e.g., IP address)
     * @param limit - Maximum number of requests
     * @param windowSeconds - Time window in seconds
     * @returns true if request should be blocked, false otherwise
     */
    isRateLimited(key: string, limit: number, windowSeconds: number): Promise<boolean>;
    /**
     * Get remaining requests for a key
     */
    getRemaining(key: string, limit: number, windowSeconds: number): Promise<number>;
}
export declare const redisRateLimiter: RedisRateLimiter;
//# sourceMappingURL=rateLimiter.d.ts.map