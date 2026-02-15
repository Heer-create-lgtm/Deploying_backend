import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { analyticsAggregationService, TimeWindow } from '../services/AnalyticsAggregationService';
import { LinkHub } from '../models/LinkHub';

const router = Router();

/**
 * Validate time window parameter
 */
function parseTimeWindow(range?: string): TimeWindow {
    switch (range) {
        case '5m': return TimeWindow.FIVE_MINUTES;
        case '1h': return TimeWindow.ONE_HOUR;
        case '24h': return TimeWindow.TWENTY_FOUR_HOURS;
        case '7d': return TimeWindow.SEVEN_DAYS;
        case 'lifetime': return TimeWindow.LIFETIME;
        default: return TimeWindow.TWENTY_FOUR_HOURS;
    }
}

/**
 * Validate hub ownership
 */
async function validateHubAccess(hubId: string, userId: string): Promise<boolean> {
    const hub = await LinkHub.findOne({ hub_id: hubId, owner_user_id: userId });
    return hub !== null;
}

/**
 * GET /api/analytics/hub/:hubId/overview
 * Returns hub overview metrics
 */
router.get('/hub/:hubId/overview', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        // Validate access
        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const overview = await analyticsAggregationService.getHubOverview(hubId, window);

        res.json({
            success: true,
            data: overview,
            meta: {
                hub_id: hubId,
                time_window: window,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/timeseries
 * Returns time series data for charts
 */
router.get('/hub/:hubId/timeseries', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const timeseries = await analyticsAggregationService.getTimeSeries(hubId, window);

        res.json({
            success: true,
            data: timeseries,
            meta: {
                hub_id: hubId,
                time_window: window,
                data_points: timeseries.length,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics timeseries error:', error);
        res.status(500).json({ error: 'Failed to fetch timeseries data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/links
 * Returns link performance metrics
 */
router.get('/hub/:hubId/links', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const links = await analyticsAggregationService.getLinkPerformance(hubId, window);

        res.json({
            success: true,
            data: links,
            meta: {
                hub_id: hubId,
                time_window: window,
                total_links: links.length,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics links error:', error);
        res.status(500).json({ error: 'Failed to fetch link performance' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/segments
 * Returns audience segment data (devices, locations)
 */
router.get('/hub/:hubId/segments', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const segments = await analyticsAggregationService.getSegments(hubId, window);

        res.json({
            success: true,
            data: segments,
            meta: {
                hub_id: hubId,
                time_window: window,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics segments error:', error);
        res.status(500).json({ error: 'Failed to fetch segment data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/heatmap
 * Returns temporal heatmap data
 */
router.get('/hub/:hubId/heatmap', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const heatmap = await analyticsAggregationService.getHeatmap(hubId, window);

        res.json({
            success: true,
            data: heatmap,
            meta: {
                hub_id: hubId,
                time_window: window,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics heatmap error:', error);
        res.status(500).json({ error: 'Failed to fetch heatmap data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/performance
 * Returns top-performing and least-performing link classification
 * 
 * Performance Score = rank_score × CTR
 * - rank_score: time-decayed click count (24h half-life)
 * - CTR: clicks / impressions
 */
router.get('/hub/:hubId/performance', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const classification = await analyticsAggregationService.getPerformanceClassification(hubId, window);

        res.json({
            success: true,
            ...classification
        });
    } catch (error) {
        console.error('Analytics performance error:', error);
        res.status(500).json({ error: 'Failed to fetch performance classification' });
    }
});

// ==================== ENHANCED ANALYTICS ENDPOINTS ====================

import { enhancedAnalyticsService, TimeGranularity } from '../services/EnhancedAnalyticsService';

/**
 * GET /api/analytics/hub/:hubId/kpi
 * Returns KPIs with day-over-day deltas and trend indicators
 */
router.get('/hub/:hubId/kpi', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const kpis = await enhancedAnalyticsService.getEnhancedKPIs(hubId);

        // Transform to frontend-expected format with metrics array
        res.json({
            success: true,
            metrics: [
                { name: 'Total Visits', value: kpis.total_visits.value, previousValue: kpis.total_visits.previous_value, delta: kpis.total_visits.delta_percentage, trend: kpis.total_visits.trend },
                { name: 'Unique Users', value: kpis.unique_users.value, previousValue: kpis.unique_users.previous_value, delta: kpis.unique_users.delta_percentage, trend: kpis.unique_users.trend },
                { name: 'Average CTR', value: kpis.average_ctr.value, previousValue: kpis.average_ctr.previous_value, delta: kpis.average_ctr.delta_percentage, trend: kpis.average_ctr.trend },
                { name: 'Best Link', value: kpis.best_link?.name || 'N/A', previousValue: kpis.best_link?.clicks || 0, delta: 0, trend: 'stable' as const }
            ],
            generated_at: kpis.generated_at
        });
    } catch (error) {
        console.error('Analytics KPI error:', error);
        res.status(500).json({ error: 'Failed to fetch KPIs' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/trends
 * Returns time-based trends with granularity selector
 */
router.get('/hub/:hubId/trends', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { granularity = 'day', days = '30' } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const trends = await enhancedAnalyticsService.getTrends(
            hubId,
            granularity as TimeGranularity,
            parseInt(days as string, 10)
        );

        res.json({
            success: true,
            data: trends,
            meta: {
                hub_id: hubId,
                granularity,
                days: parseInt(days as string, 10),
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Analytics trends error:', error);
        res.status(500).json({ error: 'Failed to fetch trends' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/weekday-weekend
 * Returns weekday vs weekend engagement comparison
 */
router.get('/hub/:hubId/weekday-weekend', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { days = '30' } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const analysis = await enhancedAnalyticsService.getWeekdayVsWeekend(hubId, parseInt(days as string, 10));

        // Transform to frontend-expected format
        res.json({
            success: true,
            weekdayAvg: analysis.weekday_avg_clicks,
            weekendAvg: analysis.weekend_avg_clicks,
            percentDifference: analysis.difference_percentage,
            recommendation: analysis.recommendation
        });
    } catch (error) {
        console.error('Weekday/weekend analysis error:', error);
        res.status(500).json({ error: 'Failed to fetch weekday/weekend analysis' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/countries
 * Returns country breakdown for location analytics
 */
router.get('/hub/:hubId/countries', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const countries = await enhancedAnalyticsService.getCountryBreakdown(hubId, window);

        res.json({
            success: true,
            data: countries
        });
    } catch (error) {
        console.error('Country breakdown error:', error);
        res.status(500).json({ error: 'Failed to fetch country breakdown' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/rules
 * Returns rule trigger analytics - explains why links were shown
 */
router.get('/hub/:hubId/rules', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const ruleAnalytics = await enhancedAnalyticsService.getRuleAnalytics(hubId, window);

        res.json({
            success: true,
            data: ruleAnalytics
        });
    } catch (error) {
        console.error('Rule analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch rule analytics' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/compare
 * Returns before/after comparison (last 7 days vs previous 7 days)
 */
router.get('/hub/:hubId/compare', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const comparison = await enhancedAnalyticsService.getBeforeAfterComparison(hubId);

        // Transform to frontend-expected format with metrics array
        const impressionsChangePct = comparison.previous_period.impressions > 0
            ? Math.round(((comparison.current_period.impressions - comparison.previous_period.impressions) / comparison.previous_period.impressions) * 10000) / 100
            : 0;

        res.json({
            success: true,
            metrics: [
                { name: 'Clicks', before: comparison.previous_period.clicks, after: comparison.current_period.clicks, changePercent: comparison.improvements.clicks_change_pct },
                { name: 'CTR', before: comparison.previous_period.ctr, after: comparison.current_period.ctr, changePercent: comparison.improvements.ctr_change_pct },
                { name: 'Impressions', before: comparison.previous_period.impressions, after: comparison.current_period.impressions, changePercent: impressionsChangePct }
            ]
        });
    } catch (error) {
        console.error('Before/after comparison error:', error);
        res.status(500).json({ error: 'Failed to fetch comparison data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/position-impact
 * Returns link position impact analysis
 */
router.get('/hub/:hubId/position-impact', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const positionImpact = await enhancedAnalyticsService.getPositionImpact(hubId, window);

        res.json({
            success: true,
            data: positionImpact
        });
    } catch (error) {
        console.error('Position impact error:', error);
        res.status(500).json({ error: 'Failed to fetch position impact data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/insights
 * Returns ML-generated insights and recommendations (advisory only)
 */
router.get('/hub/:hubId/insights', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const rawInsights = await enhancedAnalyticsService.generateMLInsights(hubId);

        // Transform to frontend-expected format
        const insights = rawInsights.map(i => ({
            type: i.type === 'performance' ? 'success' : i.type === 'timing' ? 'opportunity' : i.type === 'device' ? 'info' : 'opportunity',
            priority: i.priority,
            title: i.type.charAt(0).toUpperCase() + i.type.slice(1) + ' Insight',
            description: i.message,
            action: i.priority === 'high' ? 'Review and optimize' : undefined,
            confidence: i.priority === 'high' ? 85 : i.priority === 'medium' ? 70 : 55
        }));

        res.json({
            success: true,
            insights,
            disclaimer: 'These are advisory recommendations only. No automatic changes are made.',
            generated_at: new Date().toISOString()
        });
    } catch (error) {
        console.error('ML insights error:', error);
        res.status(500).json({ error: 'Failed to generate insights' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/engagement
 * Returns engagement metrics (dwell time, score distribution)
 */
router.get('/hub/:hubId/engagement', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);
        const metrics = await analyticsAggregationService.getEngagementMetrics(hubId, window);

        res.json({
            success: true,
            data: metrics,
            meta: {
                hub_id: hubId,
                time_window: window,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Engagement metrics error:', error);
        res.status(500).json({ error: 'Failed to fetch engagement metrics' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/rage-clicks
 * Returns rage click incidents for a hub to identify UX problems
 */
router.get('/hub/:hubId/rage-clicks', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const { range } = req.query;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const window = parseTimeWindow(range as string);

        // Calculate time cutoff based on window
        const now = new Date();
        let cutoffDate = new Date(now.getTime() - 24 * 60 * 60 * 1000); // default 24h

        switch (window) {
            case TimeWindow.FIVE_MINUTES:
                cutoffDate = new Date(now.getTime() - 5 * 60 * 1000);
                break;
            case TimeWindow.ONE_HOUR:
                cutoffDate = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case TimeWindow.SEVEN_DAYS:
                cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case TimeWindow.LIFETIME:
                cutoffDate = new Date(0);
                break;
        }

        const { AnalyticsEvent, AnalyticsEventType } = await import('../models/AnalyticsEvent');

        // Aggregate rage clicks by element/variant
        const rageClicks = await AnalyticsEvent.aggregate([
            {
                $match: {
                    hub_id: hubId,
                    event_type: AnalyticsEventType.RAGE_CLICK,
                    timestamp: { $gte: cutoffDate }
                }
            },
            {
                $group: {
                    _id: {
                        variant_id: '$variant_id',
                        element_selector: '$element_selector',
                        target_url: '$target_url'
                    },
                    total_incidents: { $sum: 1 },
                    total_clicks: { $sum: '$rage_click_count' },
                    last_occurrence: { $max: '$timestamp' },
                    avg_clicks_per_incident: { $avg: '$rage_click_count' }
                }
            },
            {
                $sort: { total_incidents: -1 }
            },
            {
                $limit: 50
            },
            {
                $project: {
                    _id: 0,
                    variant_id: '$_id.variant_id',
                    element_selector: '$_id.element_selector',
                    target_url: '$_id.target_url',
                    total_incidents: 1,
                    total_clicks: 1,
                    last_occurrence: 1,
                    avg_clicks_per_incident: { $round: ['$avg_clicks_per_incident', 1] }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                rage_clicks: rageClicks,
                total_incidents: rageClicks.reduce((sum, r) => sum + r.total_incidents, 0),
                most_problematic: rageClicks[0] || null
            },
            meta: {
                hub_id: hubId,
                time_window: window,
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Rage clicks analytics error:', error);
        res.status(500).json({ error: 'Failed to fetch rage click data' });
    }
});

/**
 * GET /api/analytics/hub/:hubId/link-ranking
 * Returns AI-suggested link ordering based on historical performance
 */
router.get('/hub/:hubId/link-ranking', requireAuth, async (req: Request, res: Response) => {
    try {
        const { hubId } = req.params;
        const userId = (req as any).user?.user_id;

        if (!await validateHubAccess(hubId, userId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        // Get link performance for the last 7 days
        const window = TimeWindow.SEVEN_DAYS;
        const links = await analyticsAggregationService.getLinkPerformance(hubId, window);

        // Calculate ranking score for each link
        // Formula: (CTR * 100) + (total_clicks / 10) + (recent_trend_bonus)
        const rankedLinks = links.map((link: any) => {
            const ctr = link.total_clicks / Math.max(link.total_impressions, 1);
            const ctrScore = ctr * 100;
            const volumeScore = link.total_clicks / 10;

            // Simple recent trend: if clicks in last 24h > average, bonus points
            const recentBonus = 0; // Would need time-series data for accurate calculation

            const rankingScore = ctrScore + volumeScore + recentBonus;

            return {
                variant_id: link.variant_id,
                title: link.title || link.variant_id,
                current_position: link.position || 0,
                suggested_position: 0, // Will be set after sorting
                ranking_score: Math.round(rankingScore * 100) / 100,
                ctr: Math.round(ctr * 10000) / 100,
                total_clicks: link.total_clicks,
                total_impressions: link.total_impressions,
                confidence: ctr > 0.01 && link.total_impressions > 50 ? 'high' :
                    link.total_impressions > 10 ? 'medium' : 'low',
                reasoning: ctr > 0.05
                    ? `High CTR (${(ctr * 100).toFixed(1)}%) indicates strong user interest`
                    : link.total_clicks > 100
                        ? `High engagement with ${link.total_clicks} total clicks`
                        : `Limited data available for confident ranking`
            };
        });

        // Sort by ranking score and assign suggested positions
        rankedLinks.sort((a: any, b: any) => b.ranking_score - a.ranking_score);
        rankedLinks.forEach((link: any, index: number) => {
            link.suggested_position = index + 1;
        });

        res.json({
            success: true,
            data: {
                ranked_links: rankedLinks,
                total_links: rankedLinks.length,
                recommendation: rankedLinks.length > 0
                    ? `Place "${rankedLinks[0].title}" at the top for best results`
                    : 'Not enough data to provide recommendations'
            },
            meta: {
                hub_id: hubId,
                time_window: window,
                algorithm: 'ctr_weighted_volume',
                generated_at: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('Link ranking error:', error);
        res.status(500).json({ error: 'Failed to generate link ranking' });
    }
});

export default router;


