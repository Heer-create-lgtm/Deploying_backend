/**
 * Time windows for aggregation
 */
export declare enum TimeWindow {
    FIVE_MINUTES = "5m",
    ONE_HOUR = "1h",
    TWENTY_FOUR_HOURS = "24h",
    SEVEN_DAYS = "7d",
    LIFETIME = "lifetime"
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
    top_performing_link: {
        link_id: string;
        name: string;
        clicks: number;
    } | null;
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
    devices: {
        type: string;
        count: number;
        percentage: number;
    }[];
    locations: {
        location: string;
        count: number;
        percentage: number;
    }[];
}
/**
 * Heatmap Data
 */
export interface HeatmapData {
    data: {
        hour: number;
        day: number;
        value: number;
    }[];
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
export declare class AnalyticsAggregationService {
    private cachePrefix;
    private cacheTTL;
    /**
     * Get hub overview metrics
     */
    getHubOverview(hubId: string, window?: TimeWindow): Promise<HubOverviewMetrics>;
    /**
     * Get time series data
     */
    getTimeSeries(hubId: string, window?: TimeWindow): Promise<TimeSeriesPoint[]>;
    /**
     * Get link performance metrics
     */
    getLinkPerformance(hubId: string, window?: TimeWindow): Promise<LinkPerformanceMetrics[]>;
    /**
     * Get audience segments
     */
    getSegments(hubId: string, window?: TimeWindow): Promise<SegmentData>;
    /**
     * Get temporal heatmap data
     */
    getHeatmap(hubId: string, window?: TimeWindow): Promise<HeatmapData>;
    /**
     * Compute time-decayed rank score
     */
    private computeRankScore;
    /**
     * Get top performing link
     */
    private getTopPerformingLink;
    /**
     * Get performance classification for links
     * Identifies TOP-PERFORMING and LEAST-PERFORMING links based on analytics
     *
     * Performance Score = rank_score × CTR
     * - rank_score: time-decayed click count (24h half-life)
     * - CTR: clicks / impressions
     */
    getPerformanceClassification(hubId: string, window?: TimeWindow): Promise<PerformanceClassification>;
    /**
     * Get engagement metrics (Time & Attention)
     */
    getEngagementMetrics(hubId: string, window?: TimeWindow): Promise<EngagementMetrics>;
    /**
     * Get referral metrics
     */
    getReferralMetrics(hubId: string, window?: TimeWindow): Promise<ReferralMetrics>;
    /**
     * Get conversion attribution metrics
     */
    getConversionMetrics(hubId: string, window?: TimeWindow): Promise<ConversionMetrics>;
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
export declare const analyticsAggregationService: AnalyticsAggregationService;
//# sourceMappingURL=AnalyticsAggregationService.d.ts.map