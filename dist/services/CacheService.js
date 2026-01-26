"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheService = exports.CacheService = void 0;
const database_1 = require("../config/database");
const RuleTree_1 = require("../models/RuleTree");
const CACHE_PREFIX = 'ruletree:';
const DEFAULT_TTL = parseInt(process.env.RULE_TREE_TTL_SECONDS || '10', 10);
/**
 * Cache Service for Rule Trees
 * Uses Redis with configurable TTL (default 10 seconds)
 */
class CacheService {
    /**
     * Get the cache key for a hub
     */
    getCacheKey(hubId) {
        return `${CACHE_PREFIX}${hubId}`;
    }
    /**
     * Get a rule tree from cache or database
     * Implements cache-through pattern
     */
    async getRuleTree(hubId) {
        const cacheKey = this.getCacheKey(hubId);
        try {
            // Try to get from cache first
            const cached = await database_1.redis.get(cacheKey);
            if (cached) {
                console.log(`Cache HIT for ${cacheKey}`);
                return JSON.parse(cached);
            }
            console.log(`Cache MISS for ${cacheKey}`);
            // Load from database
            const ruleTree = await RuleTree_1.RuleTree.findOne({ hub_id: hubId })
                .sort({ version: -1 })
                .lean();
            if (ruleTree) {
                // Cache the result
                await this.cacheRuleTree(hubId, ruleTree);
            }
            return ruleTree;
        }
        catch (error) {
            console.error('Cache error, falling back to database:', error);
            // On cache error, fall back to database
            const ruleTree = await RuleTree_1.RuleTree.findOne({ hub_id: hubId })
                .sort({ version: -1 })
                .lean();
            return ruleTree;
        }
    }
    /**
     * Cache a rule tree with TTL
     */
    async cacheRuleTree(hubId, ruleTree) {
        const cacheKey = this.getCacheKey(hubId);
        try {
            await database_1.redis.setex(cacheKey, DEFAULT_TTL, JSON.stringify(ruleTree));
            console.log(`Cached ${cacheKey} with TTL ${DEFAULT_TTL}s`);
        }
        catch (error) {
            console.error('Failed to cache rule tree:', error);
        }
    }
    /**
     * Invalidate a cached rule tree
     * Should be called on admin edits
     */
    async invalidateRuleTree(hubId) {
        const cacheKey = this.getCacheKey(hubId);
        try {
            await database_1.redis.del(cacheKey);
            console.log(`Invalidated cache for ${cacheKey}`);
        }
        catch (error) {
            console.error('Failed to invalidate cache:', error);
        }
    }
    /**
     * Invalidate all rule tree caches
     */
    async invalidateAll() {
        try {
            const keys = await database_1.redis.keys(`${CACHE_PREFIX}*`);
            if (keys.length > 0) {
                await database_1.redis.del(...keys);
                console.log(`Invalidated ${keys.length} cached rule trees`);
            }
        }
        catch (error) {
            console.error('Failed to invalidate all caches:', error);
        }
    }
    /**
     * Check if a rule tree is cached
     */
    async isCached(hubId) {
        const cacheKey = this.getCacheKey(hubId);
        const ttl = await database_1.redis.ttl(cacheKey);
        return ttl > 0;
    }
    /**
     * Get cache TTL for a hub
     */
    async getCacheTTL(hubId) {
        const cacheKey = this.getCacheKey(hubId);
        return database_1.redis.ttl(cacheKey);
    }
}
exports.CacheService = CacheService;
// Singleton instance
exports.cacheService = new CacheService();
//# sourceMappingURL=CacheService.js.map