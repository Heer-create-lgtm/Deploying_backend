import { Event } from '../models/Event';
import { VariantStats } from '../models/VariantStats';
import { calculateScore } from '../services/ScoringService';

const DEFAULT_INTERVAL_MS = parseInt(
    process.env.STATS_AGGREGATION_INTERVAL_MS || '300000',
    10
); // 5 minutes

const ONE_HOUR_MS = 60 * 60 * 1000;

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
export class StatsAggregator {
    private isRunning = false;
    private intervalId: NodeJS.Timeout | null = null;
    private intervalMs = DEFAULT_INTERVAL_MS;

    /**
     * Start the stats aggregator
     */
    start(): void {
        if (this.isRunning) {
            console.log('Stats aggregator is already running');
            return;
        }

        this.isRunning = true;
        console.log(`✓ Stats aggregator started (interval: ${this.intervalMs / 1000}s)`);

        // Run immediately on start
        this.aggregate().catch(console.error);

        // Then run at intervals
        this.intervalId = setInterval(() => {
            this.aggregate().catch(console.error);
        }, this.intervalMs);
    }

    /**
     * Stop the stats aggregator
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('Stats aggregator stopped');
    }

    /**
     * Aggregate stats from events
     * Separately counts impressions and clicks for meaningful CTR
     */
    async aggregate(): Promise<void> {
        console.log('Aggregating variant stats...');

        try {
            // Aggregate events by variant_id and event_type
            const aggregation = await Event.aggregate([
                {
                    $match: { processed: false }
                },
                {
                    $group: {
                        _id: {
                            variant_id: '$chosen_variant_id',
                            hub_id: '$hub_id',
                            event_type: '$event_type',
                        },
                        count: { $sum: 1 },
                        event_ids: { $push: '$_id' },
                    },
                },
            ]);

            if (aggregation.length === 0) {
                console.log('No new events to aggregate');
                // Still update recent_clicks_hour for all variants
                await this.updateRecentClicksForAllVariants();
                return;
            }

            // Group by variant for processing
            const variantData = new Map<string, {
                hub_id: string;
                impressions: number;
                clicks: number;
                event_ids: any[];
            }>();

            for (const agg of aggregation) {
                const { variant_id, hub_id, event_type } = agg._id;
                const key = `${hub_id}:${variant_id}`;

                if (!variantData.has(key)) {
                    variantData.set(key, {
                        hub_id,
                        impressions: 0,
                        clicks: 0,
                        event_ids: [],
                    });
                }

                const data = variantData.get(key)!;
                data.event_ids.push(...agg.event_ids);

                // Count by event type
                if (event_type === 'impression') {
                    data.impressions += agg.count;
                } else if (event_type === 'click') {
                    data.clicks += agg.count;
                } else {
                    // Legacy events without event_type - treat as clicks for backwards compatibility
                    data.clicks += agg.count;
                }
            }

            console.log(`Aggregating stats for ${variantData.size} variants...`);

            // Update stats for each variant
            for (const [key, data] of variantData) {
                const [hub_id, variant_id] = key.split(':').slice(0, 1).concat(key.split(':').slice(1).join(':'));

                // Get or create stats document
                let stats = await VariantStats.findOne({ variant_id, hub_id: data.hub_id });

                if (!stats) {
                    stats = new VariantStats({
                        variant_id,
                        hub_id: data.hub_id,
                        clicks: 0,
                        impressions: 0,
                        ctr: 0,
                        score: 0,
                        recent_clicks_hour: 0,
                    });
                }

                // Update total stats - SEPARATELY
                stats.impressions += data.impressions;
                stats.clicks += data.clicks;

                // Calculate CTR (clicks / impressions) - now meaningful
                stats.ctr = stats.impressions > 0
                    ? stats.clicks / stats.impressions
                    : 0;

                // Compute recent_clicks_hour (rolling 60-minute window from CLICK events only)
                const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);
                const recentClicks = await Event.countDocuments({
                    chosen_variant_id: variant_id,
                    hub_id: data.hub_id,
                    event_type: 'click',  // Only count clicks
                    timestamp: { $gte: oneHourAgo }
                });
                stats.recent_clicks_hour = recentClicks;

                // Calculate score using ScoringService
                stats.score = calculateScore(
                    stats.clicks,
                    stats.impressions,
                    stats.ctr,
                    stats.recent_clicks_hour
                );
                stats.last_updated = new Date();

                await stats.save();

                // Mark events as processed
                await Event.updateMany(
                    { _id: { $in: data.event_ids } },
                    { $set: { processed: true } }
                );
            }

            console.log(`✓ Updated stats for ${variantData.size} variants`);
        } catch (error) {
            console.error('Error aggregating stats:', error);
        }
    }

    /**
     * Update recent_clicks_hour for all variants (even those without new events)
     * This ensures the rolling window is accurate
     */
    private async updateRecentClicksForAllVariants(): Promise<void> {
        try {
            const allStats = await VariantStats.find({});
            const oneHourAgo = new Date(Date.now() - ONE_HOUR_MS);

            for (const stats of allStats) {
                // Count only CLICK events in the rolling window
                const recentClicks = await Event.countDocuments({
                    chosen_variant_id: stats.variant_id,
                    hub_id: stats.hub_id,
                    event_type: 'click',  // Only count clicks
                    timestamp: { $gte: oneHourAgo }
                });

                // Only update if changed
                if (stats.recent_clicks_hour !== recentClicks) {
                    stats.recent_clicks_hour = recentClicks;
                    stats.score = calculateScore(
                        stats.clicks,
                        stats.impressions,
                        stats.ctr,
                        stats.recent_clicks_hour
                    );
                    stats.last_updated = new Date();
                    await stats.save();
                }
            }
        } catch (error) {
            console.error('Error updating recent clicks:', error);
        }
    }

    /**
     * Force an immediate aggregation
     */
    async forceAggregate(): Promise<void> {
        await this.aggregate();
    }

    /**
     * Get stats for all variants in a hub
     */
    async getHubStats(hubId: string): Promise<any[]> {
        return VariantStats.find({ hub_id: hubId })
            .sort({ score: -1 })
            .lean();
    }

    /**
     * Reset stats for a variant
     */
    async resetStats(variantId: string): Promise<void> {
        await VariantStats.deleteOne({ variant_id: variantId });
        console.log(`Reset stats for variant ${variantId}`);
    }
}

// Singleton instance
export const statsAggregator = new StatsAggregator();
