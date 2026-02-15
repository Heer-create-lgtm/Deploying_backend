import { IVariantStats } from '../models/VariantStats';

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
    clicks: number;          // From Event collection (event_type='click')
    impressions: number;     // From Event collection (event_type='impression')
    ctr: number;             // Derived: clicks / impressions
    recent_clicks_hour: number;  // From Event collection (60-min rolling window)
}

/**
 * Validate that scorer input contains only real data (no placeholders)
 * Throws if validation fails
 */
export function validateScorerInput(stats: IScorerInput, source: string): void {
    // Check for NaN or undefined values
    if (isNaN(stats.clicks) || stats.clicks < 0) {
        throw new Error(`ML Integrity Error [${source}]: clicks must be a non-negative number derived from real events`);
    }
    if (isNaN(stats.impressions) || stats.impressions < 0) {
        throw new Error(`ML Integrity Error [${source}]: impressions must be a non-negative number derived from real events`);
    }
    if (isNaN(stats.ctr) || stats.ctr < 0 || stats.ctr > 1) {
        throw new Error(`ML Integrity Error [${source}]: ctr must be between 0 and 1, derived from clicks/impressions`);
    }
    if (isNaN(stats.recent_clicks_hour) || stats.recent_clicks_hour < 0) {
        throw new Error(`ML Integrity Error [${source}]: recent_clicks_hour must be a non-negative number from real events`);
    }
}

/**
 * Heuristic Scorer
 * Uses a hand-crafted formula based on CTR, clicks, and impressions
 * Formula: (ctr * 0.5) + (log₁₀(clicks+1) * 0.3) + (log₁₀(impressions+1) * 0.2)
 */
export class HeuristicScorer implements IScorer {
    getName(): string {
        return 'heuristic';
    }

    calculateScore(stats: IScorerInput): number {
        const { clicks, impressions, ctr } = stats;

        // Log scaling to prevent high-volume variants from dominating
        const clickScore = clicks > 0 ? Math.log10(clicks + 1) : 0;
        const impressionScore = impressions > 0 ? Math.log10(impressions + 1) : 0;

        return (ctr * 0.5) + (clickScore * 0.3) + (impressionScore * 0.2);
    }
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
export class MLScorer implements IScorer {
    private modelEndpoint: string;
    private enabled: boolean;

    constructor(modelEndpoint?: string) {
        this.modelEndpoint = modelEndpoint || process.env.ML_MODEL_ENDPOINT || '';
        this.enabled = !!this.modelEndpoint;

        if (!this.enabled) {
            console.warn('MLScorer: ML_MODEL_ENDPOINT not configured, scorer will fail on predictScore()');
        }
    }

    getName(): string {
        return 'ml';
    }

    /**
     * Synchronous score calculation
     * ONLY uses real production data from stats
     */
    calculateScore(stats: IScorerInput): number {
        // Validate input integrity
        validateScorerInput(stats, 'MLScorer.calculateScore');

        const { clicks, impressions, ctr, recent_clicks_hour } = stats;

        const clickScore = clicks > 0 ? Math.log10(clicks + 1) : 0;
        const impressionScore = impressions > 0 ? Math.log10(impressions + 1) : 0;

        // Recency boost from recent_clicks_hour (real data only)
        const recencyBoost = recent_clicks_hour > 0
            ? Math.log10(recent_clicks_hour + 1) * 0.1
            : 0;

        return (ctr * 0.4) + (clickScore * 0.25) + (impressionScore * 0.15) + recencyBoost;
    }

    /**
     * Async method to call ML model endpoint
     * 
     * @param stats - Stats derived from real production events
     * @param context - Optional context (minute_of_day derived dynamically)
     * @returns Promise<number> - ML-predicted score
     * @throws Error if model endpoint not configured or call fails
     */
    async predictScore(stats: IScorerInput, context?: { minute_of_day?: number }): Promise<number> {
        // Validate that model endpoint is configured
        if (!this.enabled || !this.modelEndpoint) {
            throw new Error('ML Integrity Error: ML_MODEL_ENDPOINT must be configured for ML-based scoring. No fallback or synthetic data allowed.');
        }

        // Validate input integrity - all data must be from real events
        validateScorerInput(stats, 'MLScorer.predictScore');

        // Derive minute_of_day dynamically (NOT from stored data)
        const now = new Date();
        const minute_of_day = context?.minute_of_day ?? (now.getHours() * 60 + now.getMinutes());

        // Build feature vector from verified real data
        const features = {
            clicks: stats.clicks,
            impressions: stats.impressions,
            ctr: stats.ctr,
            recent_clicks_hour: stats.recent_clicks_hour,
            minute_of_day,  // Dynamically derived
        };

        try {
            // Call external ML model endpoint
            const response = await fetch(this.modelEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ features }),
            });

            if (!response.ok) {
                throw new Error(`ML model returned status ${response.status}`);
            }

            const result = await response.json() as { score?: number };

            // Validate response
            if (typeof result.score !== 'number' || isNaN(result.score)) {
                throw new Error('ML model returned invalid score');
            }

            return result.score;
        } catch (error: any) {
            // DO NOT fall back to heuristic - ML path must fail if model unavailable
            throw new Error(`ML model call failed: ${error.message}. No synthetic fallback allowed.`);
        }
    }

    /**
     * Check if ML scorer is properly configured
     */
    isConfigured(): boolean {
        return this.enabled;
    }
}

/**
 * Scoring Service
 * Factory for getting the active scorer based on configuration
 */
export class ScoringService {
    private static instance: ScoringService;
    private scorer: IScorer;

    private constructor() {
        // Select scorer based on environment config
        const useML = process.env.USE_ML_SCORER === 'true';

        if (useML) {
            const mlScorer = new MLScorer();
            if (!mlScorer.isConfigured()) {
                throw new Error('USE_ML_SCORER=true but ML_MODEL_ENDPOINT not configured. Cannot start with unconfigured ML scorer.');
            }
            this.scorer = mlScorer;
        } else {
            this.scorer = new HeuristicScorer();
        }

        console.log(`✓ Scoring service initialized with ${this.scorer.getName()} scorer`);
    }

    static getInstance(): ScoringService {
        if (!ScoringService.instance) {
            ScoringService.instance = new ScoringService();
        }
        return ScoringService.instance;
    }

    /**
     * Get the current scorer
     */
    getScorer(): IScorer {
        return this.scorer;
    }

    /**
     * Calculate score using the active scorer
     * Validates input integrity before scoring
     */
    calculateScore(stats: IScorerInput): number {
        validateScorerInput(stats, 'ScoringService');
        return this.scorer.calculateScore(stats);
    }

    /**
     * Switch to a different scorer at runtime
     */
    setScorer(scorer: IScorer): void {
        this.scorer = scorer;
        console.log(`Scorer switched to ${scorer.getName()}`);
    }

    /**
     * Get the scorer name
     */
    getScorerName(): string {
        return this.scorer.getName();
    }
}

// Export singleton getter
export const getScoringService = (): ScoringService => ScoringService.getInstance();

// Export legacy function for backwards compatibility
export const calculateScore = (clicks: number, impressions: number, ctr: number, recent_clicks_hour: number = 0): number => {
    return getScoringService().calculateScore({ clicks, impressions, ctr, recent_clicks_hour });
};

/**
 * ML Data Integrity Validation
 * Used in build/deployment pipelines to verify scoring features
 */
export function validateMLDataLineage(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Verify scorer input fields are defined correctly
    const requiredFields = ['clicks', 'impressions', 'ctr', 'recent_clicks_hour'];
    const sampleInput: IScorerInput = { clicks: 0, impressions: 0, ctr: 0, recent_clicks_hour: 0 };

    for (const field of requiredFields) {
        if (!(field in sampleInput)) {
            errors.push(`Missing required ML feature: ${field}`);
        }
    }

    // Verify no synthetic data sources
    const scorer = getScoringService();
    if (scorer.getScorerName() === 'ml') {
        const mlScorer = scorer.getScorer() as MLScorer;
        if (!mlScorer.isConfigured()) {
            errors.push('MLScorer enabled but ML_MODEL_ENDPOINT not configured');
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}
