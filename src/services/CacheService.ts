import { redis } from '../config/database';
import { RuleTree, IRuleTree, IDecisionNode } from '../models/RuleTree';

const CACHE_PREFIX = 'ruletree:';
const DEFAULT_TTL = parseInt(process.env.RULE_TREE_TTL_SECONDS || '10', 10);

/**
 * Lean rule tree result type (plain object, not Mongoose document)
 */
interface IRuleTreeLean {
    name: string;
    hub_id: string;
    root: IDecisionNode;
    version: number;
    created_at?: Date;
    updated_at?: Date;
}

/**
 * Cache Service for Rule Trees
 * Uses Redis with configurable TTL (default 10 seconds)
 */
export class CacheService {

    /**
     * Get the cache key for a hub
     */
    private getCacheKey(hubId: string): string {
        return `${CACHE_PREFIX}${hubId}`;
    }

    /**
     * Get a rule tree from cache or database
     * Implements cache-through pattern
     */
    async getRuleTree(hubId: string): Promise<IRuleTreeLean | null> {
        const cacheKey = this.getCacheKey(hubId);

        try {
            // Try to get from cache first
            const cached = await redis.get(cacheKey);

            if (cached) {
                console.log(`Cache HIT for ${cacheKey}`);
                return JSON.parse(cached) as IRuleTreeLean;
            }

            console.log(`Cache MISS for ${cacheKey}`);

            // Load from database
            const ruleTree = await RuleTree.findOne({ hub_id: hubId })
                .sort({ version: -1 })
                .lean<IRuleTreeLean>();

            if (ruleTree) {
                // Cache the result
                await this.cacheRuleTree(hubId, ruleTree);
            }

            return ruleTree;
        } catch (error) {
            console.error('Cache error, falling back to database:', error);
            // On cache error, fall back to database
            const ruleTree = await RuleTree.findOne({ hub_id: hubId })
                .sort({ version: -1 })
                .lean<IRuleTreeLean>();
            return ruleTree;
        }
    }

    /**
     * Cache a rule tree with TTL
     */
    async cacheRuleTree(hubId: string, ruleTree: IRuleTreeLean): Promise<void> {
        const cacheKey = this.getCacheKey(hubId);

        try {
            await redis.setex(cacheKey, DEFAULT_TTL, JSON.stringify(ruleTree));
            console.log(`Cached ${cacheKey} with TTL ${DEFAULT_TTL}s`);
        } catch (error) {
            console.error('Failed to cache rule tree:', error);
        }
    }

    /**
     * Invalidate a cached rule tree
     * Should be called on admin edits
     */
    async invalidateRuleTree(hubId: string): Promise<void> {
        const cacheKey = this.getCacheKey(hubId);

        try {
            await redis.del(cacheKey);
            console.log(`Invalidated cache for ${cacheKey}`);
        } catch (error) {
            console.error('Failed to invalidate cache:', error);
        }
    }

    /**
     * Invalidate all rule tree caches
     */
    async invalidateAll(): Promise<void> {
        try {
            const keys = await redis.keys(`${CACHE_PREFIX}*`);
            if (keys.length > 0) {
                await redis.del(...keys);
                console.log(`Invalidated ${keys.length} cached rule trees`);
            }
        } catch (error) {
            console.error('Failed to invalidate all caches:', error);
        }
    }

    /**
     * Check if a rule tree is cached
     */
    async isCached(hubId: string): Promise<boolean> {
        const cacheKey = this.getCacheKey(hubId);
        const ttl = await redis.ttl(cacheKey);
        return ttl > 0;
    }

    /**
     * Get cache TTL for a hub
     */
    async getCacheTTL(hubId: string): Promise<number> {
        const cacheKey = this.getCacheKey(hubId);
        return redis.ttl(cacheKey);
    }
}

// Singleton instance
export const cacheService = new CacheService();
