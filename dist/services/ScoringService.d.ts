/**
 * Scorer Interface
 * Allows pluggable scoring strategies for variant ranking
 */
export interface IScorer {
    /**
     * Calculate a ranking score for a variant based on its stats
     * Higher scores indicate better-performing variants
     */
    calculateScore(stats: IScorerInput): number;
    /**
     * Get scorer name for logging/metrics
     */
    getName(): string;
}
/**
 * Input interface for scorer (subset of IVariantStats needed for scoring)
 * ALL FIELDS MUST BE DERIVED FROM REAL PRODUCTION EVENT DATA
 */
export interface IScorerInput {
    clicks: number;
    impressions: number;
    ctr: number;
    recent_clicks_hour: number;
}
/**
 * Validate that scorer input contains only real data (no placeholders)
 * Throws if validation fails
 */
export declare function validateScorerInput(stats: IScorerInput, source: string): void;
/**
 * Heuristic Scorer
 * Uses a hand-crafted formula based on CTR, clicks, and impressions
 * Formula: (ctr * 0.5) + (log₁₀(clicks+1) * 0.3) + (log₁₀(impressions+1) * 0.2)
 */
export declare class HeuristicScorer implements IScorer {
    getName(): string;
    calculateScore(stats: IScorerInput): number;
}
/**
 * ML Scorer
 * Calls an external ML model to predict variant performance
 *
 * CRITICAL: All features MUST be derived from real production event data:
 * - clicks: Count of 'click' events from Event collection
 * - impressions: Count of 'impression' events from Event collection
 * - ctr: Derived as clicks / impressions
 * - recent_clicks_hour: Count of 'click' events in last 60 minutes
 * - minute_of_day: Derived dynamically at inference time (NOT stored)
 *
 * NO hardcoded values, random generators, or synthetic fallbacks allowed.
 */
export declare class MLScorer implements IScorer {
    private modelEndpoint;
    private enabled;
    constructor(modelEndpoint?: string);
    getName(): string;
    /**
     * Synchronous score calculation
     * ONLY uses real production data from stats
     */
    calculateScore(stats: IScorerInput): number;
    /**
     * Async method to call ML model endpoint
     *
     * @param stats - Stats derived from real production events
     * @param context - Optional context (minute_of_day derived dynamically)
     * @returns Promise<number> - ML-predicted score
     * @throws Error if model endpoint not configured or call fails
     */
    predictScore(stats: IScorerInput, context?: {
        minute_of_day?: number;
    }): Promise<number>;
    /**
     * Check if ML scorer is properly configured
     */
    isConfigured(): boolean;
}
/**
 * Scoring Service
 * Factory for getting the active scorer based on configuration
 */
export declare class ScoringService {
    private static instance;
    private scorer;
    private constructor();
    static getInstance(): ScoringService;
    /**
     * Get the current scorer
     */
    getScorer(): IScorer;
    /**
     * Calculate score using the active scorer
     * Validates input integrity before scoring
     */
    calculateScore(stats: IScorerInput): number;
    /**
     * Switch to a different scorer at runtime
     */
    setScorer(scorer: IScorer): void;
    /**
     * Get the scorer name
     */
    getScorerName(): string;
}
export declare const getScoringService: () => ScoringService;
export declare const calculateScore: (clicks: number, impressions: number, ctr: number, recent_clicks_hour?: number) => number;
/**
 * ML Data Integrity Validation
 * Used in build/deployment pipelines to verify scoring features
 */
export declare function validateMLDataLineage(): {
    valid: boolean;
    errors: string[];
};
//# sourceMappingURL=ScoringService.d.ts.map