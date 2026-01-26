/**
 * Stats Aggregator Worker
 * Runs every 5 minutes to update variant_stats from processed events
 * Computes ML features including recent_clicks_hour
 *
 * IMPORTANT: Impressions and clicks are tracked separately:
 * - impressions: Count of 'impression' events (link resolved)
 * - clicks: Count of 'click' events (redirect executed)
 * - ctr: clicks / impressions (meaningful, non-degenerate)
 */
export declare class StatsAggregator {
    private isRunning;
    private intervalId;
    private intervalMs;
    /**
     * Start the stats aggregator
     */
    start(): void;
    /**
     * Stop the stats aggregator
     */
    stop(): void;
    /**
     * Aggregate stats from events
     * Separately counts impressions and clicks for meaningful CTR
     */
    aggregate(): Promise<void>;
    /**
     * Update recent_clicks_hour for all variants (even those without new events)
     * This ensures the rolling window is accurate
     */
    private updateRecentClicksForAllVariants;
    /**
     * Force an immediate aggregation
     */
    forceAggregate(): Promise<void>;
    /**
     * Get stats for all variants in a hub
     */
    getHubStats(hubId: string): Promise<any[]>;
    /**
     * Reset stats for a variant
     */
    resetStats(variantId: string): Promise<void>;
}
export declare const statsAggregator: StatsAggregator;
//# sourceMappingURL=StatsAggregator.d.ts.map