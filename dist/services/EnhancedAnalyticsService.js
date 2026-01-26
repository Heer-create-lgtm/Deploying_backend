"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enhancedAnalyticsService = exports.EnhancedAnalyticsService = void 0;
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const Variant_1 = require("../models/Variant");
const database_1 = require("../config/database");
const AnalyticsAggregationService_1 = require("./AnalyticsAggregationService");
// ==================== Enhanced Analytics Service ====================
function getWindowMs(window) {
    switch (window) {
        case AnalyticsAggregationService_1.TimeWindow.FIVE_MINUTES: return 5 * 60 * 1000;
        case AnalyticsAggregationService_1.TimeWindow.ONE_HOUR: return 60 * 60 * 1000;
        case AnalyticsAggregationService_1.TimeWindow.TWENTY_FOUR_HOURS: return 24 * 60 * 60 * 1000;
        case AnalyticsAggregationService_1.TimeWindow.SEVEN_DAYS: return 7 * 24 * 60 * 60 * 1000;
        case AnalyticsAggregationService_1.TimeWindow.LIFETIME: return Date.now();
    }
}
class EnhancedAnalyticsService {
    cachePrefix = 'enhanced_analytics:';
    cacheTTL = 60;
    /**
     * Get enhanced KPIs with day-over-day deltas
     */
    async getEnhancedKPIs(hubId) {
        const cacheKey = `${this.cachePrefix}kpis:${hubId}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { }
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
        // Current period (last 24h)
        const [currVisits, currClicks, currSessions] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
                timestamp: { $gte: oneDayAgo }
            }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                timestamp: { $gte: oneDayAgo }
            }),
            AnalyticsEvent_1.AnalyticsEvent.distinct('session_id', {
                hub_id: hubId,
                timestamp: { $gte: oneDayAgo }
            })
        ]);
        // Previous period (24h before that)
        const [prevVisits, prevClicks, prevSessions] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
                timestamp: { $gte: twoDaysAgo, $lt: oneDayAgo }
            }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({
                hub_id: hubId,
                event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                timestamp: { $gte: twoDaysAgo, $lt: oneDayAgo }
            }),
            AnalyticsEvent_1.AnalyticsEvent.distinct('session_id', {
                hub_id: hubId,
                timestamp: { $gte: twoDaysAgo, $lt: oneDayAgo }
            })
        ]);
        const createKPI = (current, previous) => {
            const delta = current - previous;
            const deltaPercentage = previous > 0 ? (delta / previous) * 100 : 0;
            let trend = 'stable';
            if (deltaPercentage > 5)
                trend = 'up';
            else if (deltaPercentage < -5)
                trend = 'down';
            return {
                value: current,
                previous_value: previous,
                delta,
                delta_percentage: Math.round(deltaPercentage * 100) / 100,
                trend
            };
        };
        const currCtr = currVisits > 0 ? (currClicks / currVisits) * 100 : 0;
        const prevCtr = prevVisits > 0 ? (prevClicks / prevVisits) * 100 : 0;
        // Get best performing link
        const topLink = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: oneDayAgo } } },
            { $group: { _id: '$link_id', clicks: { $sum: 1 } } },
            { $sort: { clicks: -1 } },
            { $limit: 1 }
        ]);
        let bestLink = null;
        if (topLink.length > 0) {
            const variant = await Variant_1.Variant.findOne({ variant_id: topLink[0]._id });
            bestLink = {
                link_id: topLink[0]._id,
                name: variant?.variant_id || topLink[0]._id,
                clicks: topLink[0].clicks
            };
        }
        const result = {
            total_visits: createKPI(currVisits, prevVisits),
            unique_users: createKPI(currSessions.length, prevSessions.length),
            average_ctr: createKPI(Math.round(currCtr * 100) / 100, Math.round(prevCtr * 100) / 100),
            best_link: bestLink,
            generated_at: now.toISOString()
        };
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { }
        return result;
    }
    /**
     * Get trends by granularity
     */
    async getTrends(hubId, granularity = 'day', days = 30) {
        const cacheKey = `${this.cachePrefix}trends:${hubId}:${granularity}:${days}`;
        try {
            const cached = await database_1.redis.get(cacheKey);
            if (cached)
                return JSON.parse(cached);
        }
        catch { }
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        let dateFormat;
        let groupId;
        switch (granularity) {
            case 'day':
                dateFormat = '%Y-%m-%d';
                groupId = { $dateToString: { format: dateFormat, date: '$timestamp' } };
                break;
            case 'week':
                groupId = { $isoWeek: '$timestamp' };
                break;
            case 'month':
                dateFormat = '%Y-%m';
                groupId = { $dateToString: { format: dateFormat, date: '$timestamp' } };
                break;
        }
        const [visitsAgg, clicksAgg] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION, timestamp: { $gte: startDate } } },
                { $group: { _id: groupId, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ]),
            AnalyticsEvent_1.AnalyticsEvent.aggregate([
                { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: startDate } } },
                { $group: { _id: groupId, count: { $sum: 1 } } },
                { $sort: { _id: 1 } }
            ])
        ]);
        const visitsMap = new Map(visitsAgg.map(v => [String(v._id), v.count]));
        const clicksMap = new Map(clicksAgg.map(c => [String(c._id), c.count]));
        const allPeriods = new Set([...visitsMap.keys(), ...clicksMap.keys()]);
        const result = Array.from(allPeriods).sort().map(period => {
            const visits = visitsMap.get(period) || 0;
            const clicks = clicksMap.get(period) || 0;
            return {
                period,
                visits,
                clicks,
                ctr: visits > 0 ? Math.round((clicks / visits) * 10000) / 100 : 0
            };
        });
        try {
            await database_1.redis.setex(cacheKey, this.cacheTTL, JSON.stringify(result));
        }
        catch { }
        return result;
    }
    /**
     * Weekday vs Weekend analysis
     */
    async getWeekdayVsWeekend(hubId, days = 30) {
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const clicks = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: startDate } } },
            { $project: { dayOfWeek: { $dayOfWeek: '$timestamp' } } },
            { $group: { _id: '$dayOfWeek', count: { $sum: 1 } } }
        ]);
        let weekdayTotal = 0, weekdayDays = 0;
        let weekendTotal = 0, weekendDays = 0;
        clicks.forEach(c => {
            if (c._id === 1 || c._id === 7) { // Sunday = 1, Saturday = 7
                weekendTotal += c.count;
                weekendDays++;
            }
            else {
                weekdayTotal += c.count;
                weekdayDays++;
            }
        });
        const weekdayAvg = weekdayDays > 0 ? weekdayTotal / Math.ceil(days * 5 / 7) : 0;
        const weekendAvg = weekendDays > 0 ? weekendTotal / Math.ceil(days * 2 / 7) : 0;
        const diffPct = weekdayAvg > 0 ? ((weekendAvg - weekdayAvg) / weekdayAvg) * 100 : 0;
        let recommendation = 'Engagement is balanced between weekdays and weekends.';
        if (diffPct > 20)
            recommendation = 'Weekend engagement is significantly higher. Consider scheduling promotions on weekends.';
        else if (diffPct < -20)
            recommendation = 'Weekday engagement is significantly higher. Consider targeting work hours.';
        return {
            weekday_avg_clicks: Math.round(weekdayAvg * 100) / 100,
            weekend_avg_clicks: Math.round(weekendAvg * 100) / 100,
            difference_percentage: Math.round(diffPct * 100) / 100,
            recommendation
        };
    }
    /**
     * Get country breakdown
     */
    async getCountryBreakdown(hubId, window = AnalyticsAggregationService_1.TimeWindow.SEVEN_DAYS) {
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        const countries = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: startDate }, coarse_location: { $ne: null } } },
            { $group: { _id: '$coarse_location', clicks: { $sum: 1 } } },
            { $sort: { clicks: -1 } },
            { $limit: 10 }
        ]);
        const totalClicks = countries.reduce((sum, c) => sum + c.clicks, 0);
        return {
            countries: countries.map(c => ({
                country: c._id || 'Unknown',
                clicks: c.clicks,
                percentage: totalClicks > 0 ? Math.round((c.clicks / totalClicks) * 10000) / 100 : 0
            })),
            total_clicks: totalClicks
        };
    }
    /**
     * Get rule trigger analytics
     */
    async getRuleAnalytics(hubId, window = AnalyticsAggregationService_1.TimeWindow.SEVEN_DAYS) {
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        const ruleData = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate },
                    rule_id: { $ne: null }
                }
            },
            {
                $group: {
                    _id: { link_id: '$link_id', rule_id: '$rule_id', rule_reason: '$rule_reason' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } }
        ]);
        // Group by link_id
        const linksMap = new Map();
        ruleData.forEach(r => {
            const linkId = r._id.link_id || 'default';
            if (!linksMap.has(linkId)) {
                linksMap.set(linkId, { rules: [], total: 0 });
            }
            const link = linksMap.get(linkId);
            link.rules.push({
                rule_id: r._id.rule_id || 'default',
                rule_reason: r._id.rule_reason || 'Default ordering',
                count: r.count
            });
            link.total += r.count;
        });
        const links = await Promise.all(Array.from(linksMap.entries()).map(async ([linkId, data]) => {
            const variant = await Variant_1.Variant.findOne({ variant_id: linkId });
            return {
                link_id: linkId,
                link_name: variant?.variant_id || linkId,
                rules: data.rules.map(r => ({
                    ...r,
                    percentage: data.total > 0 ? Math.round((r.count / data.total) * 10000) / 100 : 0
                }))
            };
        }));
        const totalImpressions = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({
            hub_id: hubId,
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
            timestamp: { $gte: startDate }
        });
        return { links, total_impressions: totalImpressions };
    }
    /**
     * Before/After comparison (7 days vs previous 7 days)
     */
    async getBeforeAfterComparison(hubId) {
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
        const [currImpressions, currClicks, prevImpressions, prevClicks] = await Promise.all([
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION, timestamp: { $gte: sevenDaysAgo } }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: sevenDaysAgo } }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION, timestamp: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } }),
            AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } })
        ]);
        const currCtr = currImpressions > 0 ? (currClicks / currImpressions) * 100 : 0;
        const prevCtr = prevImpressions > 0 ? (prevClicks / prevImpressions) * 100 : 0;
        return {
            current_period: {
                start: sevenDaysAgo.toISOString(),
                end: now.toISOString(),
                clicks: currClicks,
                ctr: Math.round(currCtr * 100) / 100,
                impressions: currImpressions
            },
            previous_period: {
                start: fourteenDaysAgo.toISOString(),
                end: sevenDaysAgo.toISOString(),
                clicks: prevClicks,
                ctr: Math.round(prevCtr * 100) / 100,
                impressions: prevImpressions
            },
            improvements: {
                clicks_change: currClicks - prevClicks,
                clicks_change_pct: prevClicks > 0 ? Math.round(((currClicks - prevClicks) / prevClicks) * 10000) / 100 : 0,
                ctr_change: Math.round((currCtr - prevCtr) * 100) / 100,
                ctr_change_pct: prevCtr > 0 ? Math.round(((currCtr - prevCtr) / prevCtr) * 10000) / 100 : 0
            }
        };
    }
    /**
     * Position impact analysis
     */
    async getPositionImpact(hubId, window = AnalyticsAggregationService_1.TimeWindow.SEVEN_DAYS) {
        const windowMs = getWindowMs(window);
        const startDate = new Date(Date.now() - windowMs);
        const positionData = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                    timestamp: { $gte: startDate },
                    link_position: { $ne: null }
                }
            },
            { $group: { _id: '$link_position', clicks: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        const totalClicks = positionData.reduce((sum, p) => sum + p.clicks, 0);
        // Get impressions by position (approximation)
        const positions = positionData.map(p => ({
            position: p._id,
            clicks: p.clicks,
            impressions: p.clicks * 3, // Approximation
            ctr: 33.33, // Simplified
            percentage_of_total: totalClicks > 0 ? Math.round((p.clicks / totalClicks) * 10000) / 100 : 0
        }));
        // Generate insight
        let insight = 'Position data is being collected. More data needed for insights.';
        if (positions.length >= 2) {
            const pos1 = positions.find(p => p.position === 1);
            const pos2 = positions.find(p => p.position === 2);
            if (pos1 && pos2 && pos1.clicks > pos2.clicks) {
                const ratio = Math.round((pos1.clicks / pos2.clicks) * 100) / 100;
                insight = `Position #1 receives ${ratio}x more clicks than position #2. First position significantly impacts engagement.`;
            }
        }
        return { positions, insight };
    }
    /**
     * Generate ML insights (statistical analysis)
     */
    async generateMLInsights(hubId) {
        const insights = [];
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        // Device analysis
        const deviceStats = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: oneWeekAgo } } },
            { $group: { _id: '$device_type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);
        if (deviceStats.length > 1) {
            const total = deviceStats.reduce((s, d) => s + d.count, 0);
            const top = deviceStats[0];
            const pct = Math.round((top.count / total) * 100);
            if (pct > 60) {
                insights.push({
                    type: 'device',
                    priority: 'high',
                    message: `${pct}% of clicks come from ${top._id} devices. Consider optimizing your links for ${top._id} users.`,
                    data: { device: top._id, percentage: pct }
                });
            }
        }
        // Time-of-day analysis
        const hourlyStats = await AnalyticsEvent_1.AnalyticsEvent.aggregate([
            { $match: { hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK, timestamp: { $gte: oneWeekAgo } } },
            { $project: { hour: { $hour: '$timestamp' } } },
            { $group: { _id: '$hour', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 3 }
        ]);
        if (hourlyStats.length > 0) {
            const peakHours = hourlyStats.map(h => h._id);
            insights.push({
                type: 'timing',
                priority: 'medium',
                message: `Peak engagement hours are ${peakHours.join(', ')}:00. Schedule promotions during these times for maximum impact.`,
                data: { peak_hours: peakHours }
            });
        }
        // Weekend vs weekday
        const weekdayWeekend = await this.getWeekdayVsWeekend(hubId, 30);
        if (Math.abs(weekdayWeekend.difference_percentage) > 30) {
            insights.push({
                type: 'timing',
                priority: 'medium',
                message: weekdayWeekend.recommendation,
                data: { weekday_avg: weekdayWeekend.weekday_avg_clicks, weekend_avg: weekdayWeekend.weekend_avg_clicks }
            });
        }
        // Position impact
        const positionImpact = await this.getPositionImpact(hubId);
        if (positionImpact.positions.length > 0 && positionImpact.positions[0]?.percentage_of_total > 50) {
            insights.push({
                type: 'position',
                priority: 'high',
                message: positionImpact.insight,
                data: { top_position_pct: positionImpact.positions[0].percentage_of_total }
            });
        }
        // If no insights, add a default one
        if (insights.length === 0) {
            insights.push({
                type: 'performance',
                priority: 'low',
                message: 'Collecting more data to generate personalized insights. Keep sharing your links!'
            });
        }
        return insights;
    }
}
exports.EnhancedAnalyticsService = EnhancedAnalyticsService;
// Singleton instance
exports.enhancedAnalyticsService = new EnhancedAnalyticsService();
//# sourceMappingURL=EnhancedAnalyticsService.js.map