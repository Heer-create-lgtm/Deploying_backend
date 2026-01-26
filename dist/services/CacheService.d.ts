import { IDecisionNode } from '../models/RuleTree';
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
export declare class CacheService {
    /**
     * Get the cache key for a hub
     */
    private getCacheKey;
    /**
     * Get a rule tree from cache or database
     * Implements cache-through pattern
     */
    getRuleTree(hubId: string): Promise<IRuleTreeLean | null>;
    /**
     * Cache a rule tree with TTL
     */
    cacheRuleTree(hubId: string, ruleTree: IRuleTreeLean): Promise<void>;
    /**
     * Invalidate a cached rule tree
     * Should be called on admin edits
     */
    invalidateRuleTree(hubId: string): Promise<void>;
    /**
     * Invalidate all rule tree caches
     */
    invalidateAll(): Promise<void>;
    /**
     * Check if a rule tree is cached
     */
    isCached(hubId: string): Promise<boolean>;
    /**
     * Get cache TTL for a hub
     */
    getCacheTTL(hubId: string): Promise<number>;
}
export declare const cacheService: CacheService;
export {};
//# sourceMappingURL=CacheService.d.ts.map