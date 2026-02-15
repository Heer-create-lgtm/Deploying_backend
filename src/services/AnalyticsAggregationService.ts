import { AnalyticsEvent, AnalyticsEventType, DeviceType } from '../models/AnalyticsEvent';
import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';
import { redis } from '../config/database';

/**
 * Time windows for aggregation
 */
export enum TimeWindow {
    FIVE_MINUTES = '5m',
    ONE_HOUR = '1h',
    TWENTY_FOUR_HOURS = '24h',
    SEVEN_DAYS = '7d',
    LIFETIME = 'lifetime'
}

/**
 * Get milliseconds for time window
 */
function getWindowMs(window: TimeWindow): number {
    switch (window) {
        case TimeWindow.FIVE_MINUTES: return 5 * 60 * 1000;
        case TimeWindow.ONE_HOUR: return 60 * 60 * 1000;
        case TimeWindow.TWENTY_FOUR_HOURS: return 24 * 60 * 60 * 1000;
        case TimeWindow.SEVEN_DAYS: return 7 * 24 * 60 * 60 * 1000;
        case TimeWindow.LIFETIME: return Date.now(); // All time
    }
}

/**
 * Hub Overview Metrics
 */
export interface HubOverviewMetrics {
    total_visits: number;
    unique_users: number;
    total_sessions: number;
    total_clicks: number;
    average_ctr: number;
    top_performing_link: { link_id: string; name: string; clicks: number } | null;
    traffic_trend: 'up' | 'down' | 'stable';
    trend_percentage: number;
}

/**
 * Time Series Data Point
 */
export interface TimeSeriesPoint {
    timestamp: string;
    visits: number;
    clicks: number;
}

/**
 * Link Performance Metrics
 */
export interface LinkPerformanceMetrics {
    link_id: string;
    variant_id: string;
    name: string;
    target_url: string;
    impressions: number;
    clicks: number;
    ctr: number;
    rank_score: number;
}

/**
 * Segment Data
 */
export interface SegmentData {
    devices: { type: string; count: number; percentage: number }[];
    locations: { location: string; count: number; percentage: number }[];
}

/**
 * Heatmap Data
 */
export interface HeatmapData {
    data: { hour: number; day: number; value: number }[];
}

/**
 * Engagement Metrics
 */
export interface EngagementMetrics {
    average_dwell_time: number;
    score_distribution: {
        low: number;
        medium: number;
        high: number;
    };
    total_engaged_sessions: number;
}

/**
 * Analytics Aggregation Service
 * Computes aggregated metrics with caching
 */
export class AnalyticsAggregationService {
    private cachePrefix = 'analytics:';
    private cacheTTL = 60; // 1 minute cache

    /**
     * Get hub overview metrics
     * Uses AnalyticsEvent with time-window filtering for accurate range-based data
     * Falls back to VariantStats for lifetime/all-time
     */
    async getHubOverview(hubId: string, window: TimeWindow = TimeWindow.TWENTY_FOUR_HOURS): Promise<HubOverviewMetrics> {
        const cacheKey = `${this.cachePrefix}overview:${hubId}:${window}`;

        // Try cache first
        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore cache errors */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        let totalClicks = 0;
        let totalImpressions = 0;
        let avgCtr = 0;

        if (window === TimeWindow.LIFETIME) {
            // For lifetime, use VariantStats (all-time aggregate)
            const stats = await VariantStats.aggregate([
                { $match: { hub_id: hubId } },
                {
                    $group: {
                        _id: null,
                        total_clicks: { $sum: '$clicks' },
                        total_impressions: { $sum: '$impressions' },
                        avg_ctr: { $avg: '$ctr' }
                    }
                }
            ]);
            const aggregated = stats[0] || { total_clicks: 0, total_impressions: 0, avg_ctr: 0 };
            totalClicks = aggregated.total_clicks;
            totalImpressions = aggregated.total_impressions;
            avgCtr = aggregated.avg_ctr;
        } else {
            // For time-windowed queries, count from AnalyticsEvent with timestamp filter
            const [clickCount, impressionCount] = await Promise.all([
                AnalyticsEvent.countDocuments({
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate }
                }),
                AnalyticsEvent.countDocuments({
                    hub_id: hubId,
                    event_type: AnalyticsEventType.HUB_IMPRESSION,
                    timestamp: { $gte: startDate }
                })
            ]);
            totalClicks = clickCount;
            totalImpressions = impressionCount;
            avgCtr = totalImpressions > 0 ? totalClicks / totalImpressions : 0;
        }

        // Count unique sessions from events for visitor count
        const uniqueSessions = await AnalyticsEvent.distinct('session_id', {
            hub_id: hubId,
            timestamp: { $gte: startDate }
        });

        // Top performing link within the time window
        const topClickAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$variant_id',
                    clicks: { $sum: 1 }
                }
            },
            { $sort: { clicks: -1 } },
            { $limit: 1 }
        ]);

        let topLink: { link_id: string; name: string; clicks: number } | null = null;
        if (topClickAgg.length > 0) {
            const topVariantId = topClickAgg[0]._id;
            const variant = await Variant.findOne({ variant_id: topVariantId }).lean();
            topLink = {
                link_id: topVariantId,
                name: variant?.target_url?.substring(0, 50) || topVariantId,
                clicks: topClickAgg[0].clicks
            };
        }

        // Traffic trend (compare with previous period events)
        const prevStartDate = new Date(Date.now() - (windowMs * 2));
        const [currentEvents, prevEvents] = await Promise.all([
            AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEventType.HUB_IMPRESSION,
                timestamp: { $gte: startDate }
            }),
            AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEventType.HUB_IMPRESSION,
                timestamp: { $gte: prevStartDate, $lt: startDate }
            })
        ]);

        let trend: 'up' | 'down' | 'stable' = 'stable';
        let trendPercentage = 0;
        if (prevEvents > 0) {
            trendPercentage = ((currentEvents - prevEvents) / prevEvents) * 100;
            if (trendPercentage > 5) trend = 'up';
            else if (trendPercentage < -5) trend = 'down';
        }

        const result: HubOverviewMetrics = {
            total_visits: totalImpressions,
            unique_users: uniqueSessions.length,
            total_sessions: uniqueSessions.length,
            total_clicks: totalClicks,
            average_ctr: Math.round((avgCtr || 0) * 10000) / 100,
            top_performing_link: topLink,
            traffic_trend: trend,
            trend_percentage: Math.round(trendPercentage * 100) / 100
        };

        // Cache result
        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore cache errors */ }

        return result;
    }

    /**
     * Get time series data
     */
    async getTimeSeries(hubId: string, window: TimeWindow = TimeWindow.TWENTY_FOUR_HOURS): Promise<TimeSeriesPoint[]> {
        const cacheKey = `${this.cachePrefix}timeseries:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Determine bucket size based on window
        let bucketMs: number;
        let dateFormat: string;
        switch (window) {
            case TimeWindow.FIVE_MINUTES:
            case TimeWindow.ONE_HOUR:
                bucketMs = 5 * 60 * 1000; // 5 minute buckets
                dateFormat = '%Y-%m-%dT%H:%M';
                break;
            case TimeWindow.TWENTY_FOUR_HOURS:
                bucketMs = 60 * 60 * 1000; // 1 hour buckets
                dateFormat = '%Y-%m-%dT%H:00';
                break;
            default:
                bucketMs = 24 * 60 * 60 * 1000; // 1 day buckets
                dateFormat = '%Y-%m-%d';
        }

        // Aggregate visits by time bucket
        const visitsAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.HUB_IMPRESSION,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: dateFormat, date: '$timestamp' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Aggregate clicks by time bucket
        const clicksAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: dateFormat, date: '$timestamp' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Merge into time series
        const visitsMap = new Map(visitsAgg.map(v => [v._id, v.count]));
        const clicksMap = new Map(clicksAgg.map(c => [c._id, c.count]));
        const allTimestamps = new Set([...visitsMap.keys(), ...clicksMap.keys()]);

        const result: TimeSeriesPoint[] = Array.from(allTimestamps)
            .sort()
            .map(ts => ({
                timestamp: ts,
                visits: visitsMap.get(ts) || 0,
                clicks: clicksMap.get(ts) || 0
            }));

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get link performance metrics - time-window filtered from AnalyticsEvent
     */
    async getLinkPerformance(hubId: string, window: TimeWindow = TimeWindow.TWENTY_FOUR_HOURS): Promise<LinkPerformanceMetrics[]> {
        const cacheKey = `${this.cachePrefix}links:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        // Get all variants for this hub
        const variants = await Variant.find({ hub_id: hubId }).lean();

        if (window === TimeWindow.LIFETIME) {
            // For lifetime, use VariantStats (all-time)
            const allStats = await VariantStats.find({ hub_id: hubId }).lean();
            const statsMap = new Map(allStats.map(s => [s.variant_id, s]));

            const result: LinkPerformanceMetrics[] = variants.map(variant => {
                const stats = statsMap.get(variant.variant_id);
                const clicks = stats?.clicks || 0;
                const impressions = stats?.impressions || 0;
                const ctr = stats?.ctr || 0;
                const score = stats?.score || 0;

                return {
                    link_id: variant.variant_id,
                    variant_id: variant.variant_id,
                    name: variant.target_url.substring(0, 50),
                    target_url: variant.target_url,
                    impressions,
                    clicks,
                    ctr: Math.round(ctr * 10000) / 100,
                    rank_score: Math.round(score * 100) / 100
                };
            });

            result.sort((a, b) => b.clicks - a.clicks);

            try {
                await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
            } catch { /* ignore */ }

            return result;
        }

        // For time-windowed queries, aggregate from AnalyticsEvent
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Count impressions in this window (hub-level — each variant gets same count)
        const totalImpressions = await AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: startDate }
        });

        // Count clicks per variant in this window
        const clicksAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$variant_id',
                    clicks: { $sum: 1 },
                    latest_click: { $max: '$timestamp' }
                }
            }
        ]);
        const clicksMap = new Map(clicksAgg.map(c => [c._id, { clicks: c.clicks, latest: c.latest_click }]));

        const result: LinkPerformanceMetrics[] = variants.map(variant => {
            const clickData = clicksMap.get(variant.variant_id) || { clicks: 0, latest: null };
            const clicks = clickData.clicks;
            const ctr = totalImpressions > 0 ? (clicks / totalImpressions) * 100 : 0;
            const rankScore = this.computeRankScore(clicks, clickData.latest);

            return {
                link_id: variant.variant_id,
                variant_id: variant.variant_id,
                name: variant.target_url.substring(0, 50),
                target_url: variant.target_url,
                impressions: totalImpressions,
                clicks,
                ctr: Math.round(ctr * 100) / 100,
                rank_score: Math.round(rankScore * 100) / 100
            };
        });

        result.sort((a, b) => b.clicks - a.clicks);

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get audience segments
     */
    async getSegments(hubId: string, window: TimeWindow = TimeWindow.TWENTY_FOUR_HOURS): Promise<SegmentData> {
        const cacheKey = `${this.cachePrefix}segments:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Device distribution
        const devicesAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$device_type',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Location distribution
        const locationsAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    coarse_location: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$coarse_location',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const totalDevices = devicesAgg.reduce((sum, d) => sum + d.count, 0);
        const totalLocations = locationsAgg.reduce((sum, l) => sum + l.count, 0);

        const result: SegmentData = {
            devices: devicesAgg.map(d => ({
                type: d._id || 'unknown',
                count: d.count,
                percentage: totalDevices > 0 ? Math.round((d.count / totalDevices) * 100) : 0
            })),
            locations: locationsAgg.map(l => ({
                location: l._id || 'Unknown',
                count: l.count,
                percentage: totalLocations > 0 ? Math.round((l.count / totalLocations) * 100) : 0
            }))
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get temporal heatmap data
     */
    async getHeatmap(hubId: string, window: TimeWindow = TimeWindow.SEVEN_DAYS): Promise<HeatmapData> {
        const cacheKey = `${this.cachePrefix}heatmap:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Aggregate by hour and day of week
        const heatmapAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        hour: { $hour: '$timestamp' },
                        dayOfWeek: { $dayOfWeek: '$timestamp' }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        const result: HeatmapData = {
            data: heatmapAgg.map(h => ({
                hour: h._id.hour,
                day: h._id.dayOfWeek - 1, // 0-indexed (Sunday = 0)
                value: h.count
            }))
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Compute time-decayed rank score
     */
    private computeRankScore(clicks: number, latestClick: Date | null): number {
        if (clicks === 0 || !latestClick) return 0;

        const now = Date.now();
        const clickAge = now - new Date(latestClick).getTime();
        const halfLife = 24 * 60 * 60 * 1000; // 24 hours half-life

        // Exponential decay: score = clicks * e^(-λt)
        const decayFactor = Math.exp(-clickAge / halfLife);
        return clicks * decayFactor;
    }

    /**
     * Get top performing link
     */
    private async getTopPerformingLink(hubId: string, startDate: Date): Promise<{ link_id: string; name: string; clicks: number } | null> {
        const topAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    variant_id: { $ne: null },
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$variant_id',
                    clicks: { $sum: 1 }
                }
            },
            { $sort: { clicks: -1 } },
            { $limit: 1 }
        ]);

        if (topAgg.length === 0) return null;

        const variant = await Variant.findOne({ variant_id: topAgg[0]._id });
        return {
            link_id: topAgg[0]._id,
            name: variant?.target_url.substring(0, 50) || topAgg[0]._id,
            clicks: topAgg[0].clicks
        };
    }

    /**
     * Get performance classification for links
     * Identifies TOP-PERFORMING and LEAST-PERFORMING links based on analytics
     * 
     * Performance Score = rank_score × CTR
     * - rank_score: time-decayed click count (24h half-life)
     * - CTR: clicks / impressions
     */
    async getPerformanceClassification(hubId: string, window: TimeWindow = TimeWindow.TWENTY_FOUR_HOURS): Promise<PerformanceClassification> {
        const cacheKey = `${this.cachePrefix}performance:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Minimum impressions threshold (dynamic based on window)
        const minImpressions = window === TimeWindow.LIFETIME ? 10 :
            window === TimeWindow.SEVEN_DAYS ? 5 : 2;

        // Get all variants for this hub
        const variants = await Variant.find({ hub_id: hubId });

        // Get hub impressions (total for CTR calculation)
        const totalImpressions = await AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: startDate }
        });

        // Get clicks per variant with timing info
        const clicksAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.LINK_CLICK,
                    variant_id: { $ne: null },
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$variant_id',
                    clicks: { $sum: 1 },
                    latest_click: { $max: '$timestamp' }
                }
            }
        ]);

        const clicksMap = new Map(clicksAgg.map(c => [c._id, { clicks: c.clicks, latest: c.latest_click }]));

        // Compute performance metrics for each variant
        const performanceData: PerformanceLink[] = variants
            .map(variant => {
                const clickData = clicksMap.get(variant.variant_id) || { clicks: 0, latest: null };
                const clicks = clickData.clicks;
                const impressions = totalImpressions;

                // Skip links below minimum impressions threshold
                if (impressions < minImpressions) return null;

                const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
                const rankScore = this.computeRankScore(clicks, clickData.latest);

                // Performance Score = rank_score × CTR
                // This favors links with both recent activity AND good conversion
                const performanceScore = rankScore * (ctr / 100);

                return {
                    link_id: variant.variant_id,
                    link_name: variant.target_url.substring(0, 50),
                    target_url: variant.target_url,
                    impressions,
                    clicks,
                    ctr: Math.round(ctr * 100) / 100,
                    rank_score: Math.round(rankScore * 100) / 100,
                    performance_score: Math.round(performanceScore * 1000) / 1000
                };
            })
            .filter((p): p is PerformanceLink => p !== null);

        // Sort by performance_score descending
        performanceData.sort((a, b) => b.performance_score - a.performance_score);

        // Get top 5 performing (highest scores)
        const topLinks = performanceData.slice(0, 5);

        // Get least performing (lowest non-zero scores)
        const linksWithActivity = performanceData.filter(p => p.clicks > 0);
        const leastLinks = linksWithActivity
            .slice()
            .sort((a, b) => a.performance_score - b.performance_score)
            .slice(0, 5);

        const result: PerformanceClassification = {
            topLinks,
            leastLinks,
            meta: {
                hub_id: hubId,
                time_window: window,
                min_impressions_threshold: minImpressions,
                total_links_analyzed: performanceData.length,
                generated_at: new Date().toISOString()
            }
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get engagement metrics (Time & Attention)
     */
    async getEngagementMetrics(hubId: string, window: TimeWindow = TimeWindow.SEVEN_DAYS): Promise<EngagementMetrics> {
        const cacheKey = `${this.cachePrefix}engagement:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        const engagementData = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    engagement_score: { $exists: true }
                }
            },
            {
                $group: {
                    _id: null,
                    avgDwell: { $avg: '$dwell_time' },
                    lowCount: {
                        $sum: { $cond: [{ $eq: ['$engagement_score', 'Low'] }, 1, 0] }
                    },
                    mediumCount: {
                        $sum: { $cond: [{ $eq: ['$engagement_score', 'Medium'] }, 1, 0] }
                    },
                    highCount: {
                        $sum: { $cond: [{ $eq: ['$engagement_score', 'High'] }, 1, 0] }
                    },
                    total: { $sum: 1 }
                }
            }
        ]);

        const data = engagementData[0] || { avgDwell: 0, lowCount: 0, mediumCount: 0, highCount: 0, total: 0 };

        const result: EngagementMetrics = {
            average_dwell_time: Math.round(data.avgDwell || 0),
            score_distribution: {
                low: data.lowCount,
                medium: data.mediumCount,
                high: data.highCount
            },
            total_engaged_sessions: data.total
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get referral metrics
     */
    async getReferralMetrics(hubId: string, window: TimeWindow = TimeWindow.SEVEN_DAYS): Promise<ReferralMetrics> {
        const cacheKey = `${this.cachePrefix}referrals:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Aggregate by source type
        const sourceAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEventType.HUB_IMPRESSION
                }
            },
            {
                $group: {
                    _id: '$source_type',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Aggregate by top referrers logic (simplified for now to just top domains)
        // Ideally we parse the referrer string to get domain
        // For now, we'll just group by the raw referrer string if it exists
        const referrerAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    referrer: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$referrer',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        const totalVisits = sourceAgg.reduce((sum, s) => sum + s.count, 0);

        const result: ReferralMetrics = {
            sources: sourceAgg.map(s => ({
                type: s._id || 'direct',
                count: s.count,
                percentage: totalVisits > 0 ? Math.round((s.count / totalVisits) * 100) : 0
            })),
            top_referrers: referrerAgg.map(r => ({
                domain: r._id || 'Unknown',
                count: r.count
            }))
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }

    /**
     * Get conversion attribution metrics
     */
    async getConversionMetrics(hubId: string, window: TimeWindow = TimeWindow.SEVEN_DAYS): Promise<ConversionMetrics> {
        const cacheKey = `${this.cachePrefix}conversion:${hubId}:${window}`;

        try {
            const cached = await redis.get(cacheKey);
            if (cached) return JSON.parse(cached);
        } catch { /* ignore */ }

        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);

        // Aggregate conversions and revenue
        const conversionAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEventType.CONVERSION
                }
            },
            {
                $group: {
                    _id: null,
                    total_conversions: { $sum: 1 },
                    total_revenue: { $sum: '$revenue' }
                }
            }
        ]);

        // Aggregate conversions by link
        const linkAgg = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEventType.CONVERSION,
                    variant_id: { $ne: null }
                }
            },
            {
                $group: {
                    _id: '$variant_id',
                    conversions: { $sum: 1 },
                    revenue: { $sum: '$revenue' }
                }
            },
            { $sort: { revenue: -1, conversions: -1 } },
            { $limit: 10 }
        ]);

        const totals = conversionAgg[0] || { total_conversions: 0, total_revenue: 0 };
        const top_links = [];

        for (const link of linkAgg) {
            const variant = await Variant.findOne({ variant_id: link._id });
            top_links.push({
                link_id: link._id,
                name: variant?.target_url || link._id,
                conversions: link.conversions,
                revenue: link.revenue
            });
        }

        const result: ConversionMetrics = {
            total_conversions: totals.total_conversions,
            total_revenue: totals.total_revenue,
            top_converting_links: top_links
        };

        try {
            await redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        } catch { /* ignore */ }

        return result;
    }
}

/**
 * Performance Link Data
 */
export interface PerformanceLink {
    link_id: string;
    link_name: string;
    target_url: string;
    impressions: number;
    clicks: number;
    ctr: number;
    rank_score: number;
    performance_score: number;
}

/**
 * Performance Classification Response
 */
export interface PerformanceClassification {
    topLinks: PerformanceLink[];
    leastLinks: PerformanceLink[];
    meta: {
        hub_id: string;
        time_window: string;
        min_impressions_threshold: number;
        total_links_analyzed: number;
        generated_at: string;
    };
}

/**
 * Referral Metrics
 */
export interface ReferralMetrics {
    sources: {
        type: string;
        count: number;
        percentage: number;
    }[];
    top_referrers: {
        domain: string;
        count: number;
    }[];
}

/**
 * Conversion Metrics
 */
export interface ConversionMetrics {
    total_conversions: number;
    total_revenue: number;
    top_converting_links: {
        link_id: string;
        name: string;
        conversions: number;
        revenue: number;
    }[];
}

// Singleton instance
export const analyticsAggregationService = new AnalyticsAggregationService();

