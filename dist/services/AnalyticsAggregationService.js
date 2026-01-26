"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsAggregationService = exports.AnalyticsAggregationService = exports.TimeWindow = void 0;
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const Variant_1 = require("../models/Variant");
const database_1 = require("../config/database");
/**
 * Time windows for aggregation
 */
var TimeWindow;
(function (TimeWindow) {
    TimeWindow["FIVE_MINUTES"] = "5m";
    TimeWindow["ONE_HOUR"] = "1h";
    TimeWindow["TWENTY_FOUR_HOURS"] = "24h";
    TimeWindow["SEVEN_DAYS"] = "7d";
    TimeWindow["LIFETIME"] = "lifetime";
})(TimeWindow || (exports.TimeWindow = TimeWindow = {}));
/**
 * Get milliseconds for time window
 */
function getWindowMs(window) {
    switch (window) {
        case TimeWindow.FIVE_MINUTES: return 5 * 60 * 1000;
        case TimeWindow.ONE_HOUR: return 60 * 60 * 1000;
        case TimeWindow.TWENTY_FOUR_HOURS: return 24 * 60 * 60 * 1000;
        case TimeWindow.SEVEN_DAYS: return 7 * 24 * 60 * 60 * 1000;
        case TimeWindow.LIFETIME: return Date.now(); // All time
    }
}
/**
 * Analytics Aggregation Service
 * Computes aggregated metrics with caching
 */
class AnalyticsAggregationService {
    cachePrefix = 'analytics:';
    cacheTTL = 60; // 1 minute cache
    /**
     * Get hub overview metrics
     */
    async getHubOverview(hubId, window = TimeWindow.TWENTY_FOUR_HOURS) {
        const cacheKey = `${this.cachePrefix}overview:${hubId}:${window}`;
        // Try cache first
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore cache errors */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        const prevStartDate = new Date(Date.now() - (windowMs * 2));
        // Current period metrics
        const [impressions, clicks, uniqueSessions] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
                timestamp: { $gte: startDate }
            }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                timestamp: { $gte: startDate }
            }),
            AnalyticsEvent_1.AnalyticsEvent.distinct('session_id', {
                hub_id: hubId,
                timestamp: { $gte: startDate }
            })
        ]);
        // Previous period for trend
        const prevImpressions = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: prevStartDate, $lt: startDate }
        });
        // Unique users (approximated by unique sessions)
        const uniqueUsers = uniqueSessions.length;
        // Average CTR
        const averageCtr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        // Top performing link
        const topLink = await this.getTopPerformingLink(hubId, startDate);
        // Traffic trend
        let trend = 'stable';
        let trendPercentage = 0;
        if (prevImpressions > 0) {
            trendPercentage = ((impressions - prevImpressions) / prevImpressions) * 100;
            if (trendPercentage > 5)
                trend = 'up';
            else if (trendPercentage < -5)
                trend = 'down';
        }
        const result = {
            total_visits: impressions,
            unique_users: uniqueUsers,
            total_sessions: uniqueSessions.length,
            total_clicks: clicks,
            average_ctr: Math.round(averageCtr * 100) / 100,
            top_performing_link: topLink,
            traffic_trend: trend,
            trend_percentage: Math.round(trendPercentage * 100) / 100
        };
        // Cache result
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore cache errors */ }
        return result;
    }
    /**
     * Get time series data
     */
    async getTimeSeries(hubId, window = TimeWindow.TWENTY_FOUR_HOURS) {
        const cacheKey = `${this.cachePrefix}timeseries:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Determine bucket size based on window
        let bucketMs;
        let dateFormat;
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
        const visitsAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
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
        const clicksAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
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
        const result = Array.from(allTimestamps)
            .sort()
            .map(ts => ({
            timestamp: ts,
            visits: visitsMap.get(ts) || 0,
            clicks: clicksMap.get(ts) || 0
        }));
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get link performance metrics
     */
    async getLinkPerformance(hubId, window = TimeWindow.TWENTY_FOUR_HOURS) {
        const cacheKey = `${this.cachePrefix}links:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Get all variants for this hub
        const variants = await Variant_1.Variant.find({ hub_id: hubId });
        // Get hub impressions (total for CTR calculation)
        const totalImpressions = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: startDate }
        });
        // Get clicks per variant with time-decay
        const clicksAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
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
        // Compute metrics for each variant
        const result = variants.map(variant => {
            const clickData = clicksMap.get(variant.variant_id) || { clicks: 0, latest: null };
            const clicks = clickData.clicks;
            const ctr = totalImpressions > 0 ? (clicks / totalImpressions) * 100 : 0;
            // Time-decay rank score
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
        // Sort by rank_score descending
        result.sort((a, b) => b.rank_score - a.rank_score);
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get audience segments
     */
    async getSegments(hubId, window = TimeWindow.TWENTY_FOUR_HOURS) {
        const cacheKey = `${this.cachePrefix}segments:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Device distribution
        const devicesAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
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
        const locationsAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
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
        const result = {
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
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get temporal heatmap data
     */
    async getHeatmap(hubId, window = TimeWindow.SEVEN_DAYS) {
        const cacheKey = `${this.cachePrefix}heatmap:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Aggregate by hour and day of week
        const heatmapAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
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
        const result = {
            data: heatmapAgg.map(h => ({
                hour: h._id.hour,
                day: h._id.dayOfWeek - 1, // 0-indexed (Sunday = 0)
                value: h.count
            }))
        };
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Compute time-decayed rank score
     */
    computeRankScore(clicks, latestClick) {
        if (clicks === 0 || !latestClick)
            return 0;
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
    async getTopPerformingLink(hubId, startDate) {
        const topAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
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
        if (topAgg.length === 0)
            return null;
        const variant = await Variant_1.Variant.findOne({ variant_id: topAgg[0]._id });
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
    async getPerformanceClassification(hubId, window = TimeWindow.TWENTY_FOUR_HOURS) {
        const cacheKey = `${this.cachePrefix}performance:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Minimum impressions threshold (dynamic based on window)
        const minImpressions = window === TimeWindow.LIFETIME ? 10 :
            window === TimeWindow.SEVEN_DAYS ? 5 : 2;
        // Get all variants for this hub
        const variants = await Variant_1.Variant.find({ hub_id: hubId });
        // Get hub impressions (total for CTR calculation)
        const totalImpressions = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: startDate }
        });
        // Get clicks per variant with timing info
        const clicksAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
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
        const performanceData = variants
            .map(variant => {
            const clickData = clicksMap.get(variant.variant_id) || { clicks: 0, latest: null };
            const clicks = clickData.clicks;
            const impressions = totalImpressions;
            // Skip links below minimum impressions threshold
            if (impressions < minImpressions)
                return null;
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
            .filter((p) => p !== null);
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
        const result = {
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
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get engagement metrics (Time & Attention)
     */
    async getEngagementMetrics(hubId, window = TimeWindow.SEVEN_DAYS) {
        const cacheKey = `${this.cachePrefix}engagement:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        const engagementData = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
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
        const result = {
            average_dwell_time: Math.round(data.avgDwell || 0),
            score_distribution: {
                low: data.lowCount,
                medium: data.mediumCount,
                high: data.highCount
            },
            total_engaged_sessions: data.total
        };
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get referral metrics
     */
    async getReferralMetrics(hubId, window = TimeWindow.SEVEN_DAYS) {
        const cacheKey = `${this.cachePrefix}referrals:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Aggregate by source type
        const sourceAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION
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
        const referrerAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
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
        const result = {
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
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
    /**
     * Get conversion attribution metrics
     */
    async getConversionMetrics(hubId, window = TimeWindow.SEVEN_DAYS) {
        const cacheKey = `${this.cachePrefix}conversion:${hubId}:${window}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { /* ignore */ }
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        // Aggregate conversions and revenue
        const conversionAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEvent_1.AnalyticsEventType.CONVERSION
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
        const linkAgg = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    timestamp: { $gte: startDate },
                    event_type: AnalyticsEvent_1.AnalyticsEventType.CONVERSION,
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
            const variant = await Variant_1.Variant.findOne({ variant_id: link._id });
            top_links.push({
                link_id: link._id,
                name: variant?.target_url || link._id,
                conversions: link.conversions,
                revenue: link.revenue
            });
        }
        const result = {
            total_conversions: totals.total_conversions,
            total_revenue: totals.total_revenue,
            top_converting_links: top_links
        };
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { /* ignore */ }
        return result;
    }
}
exports.AnalyticsAggregationService = AnalyticsAggregationService;
// Singleton instance
exports.analyticsAggregationService = new AnalyticsAggregationService();
//# sourceMappingURL=AnalyticsAggregationService.js.map