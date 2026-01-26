import { TimeWindow } from './AnalyticsAggregationService';
/**
 * KPI with day-over-day delta
 */
export interface KPIMetric {
    value: number;
    previous_value: number;
    delta: number;
    delta_percentage: number;
    trend: 'up' | 'down' | 'stable';
}
/**
 * Enhanced KPIs response
 */
export interface EnhancedKPIs {
    total_visits: KPIMetric;
    unique_users: KPIMetric;
    average_ctr: KPIMetric;
    best_link: {
        link_id: string;
        name: string;
        clicks: number;
    } | null;
    generated_at: string;
}
/**
 * Time granularity for trends
 */
export type TimeGranularity = 'day' | 'week' | 'month';
/**
 * Trend data point
 */
export interface TrendDataPoint {
    period: string;
    visits: number;
    clicks: number;
    ctr: number;
}
/**
 * Weekday vs Weekend analysis
 */
export interface WeekdayWeekendAnalysis {
    weekday_avg_clicks: number;
    weekend_avg_clicks: number;
    difference_percentage: number;
    recommendation: string;
}
/**
 * Country breakdown
 */
export interface CountryBreakdown {
    countries: {
        country: string;
        clicks: number;
        percentage: number;
    }[];
    total_clicks: number;
}
/**
 * Rule trigger analytics
 */
export interface RuleTriggerAnalytics {
    links: {
        link_id: string;
        link_name: string;
        rules: {
            rule_id: string;
            rule_reason: string;
            count: number;
            percentage: number;
        }[];
    }[];
    total_impressions: number;
}
/**
 * Before/After comparison
 */
export interface BeforeAfterComparison {
    current_period: {
        start: string;
        end: string;
        clicks: number;
        ctr: number;
        impressions: number;
    };
    previous_period: {
        start: string;
        end: string;
        clicks: number;
        ctr: number;
        impressions: number;
    };
    improvements: {
        clicks_change: number;
        clicks_change_pct: number;
        ctr_change: number;
        ctr_change_pct: number;
    };
}
/**
 * Position impact analysis
 */
export interface PositionImpactAnalysis {
    positions: {
        position: number;
        clicks: number;
        impressions: number;
        ctr: number;
        percentage_of_total: number;
    }[];
    insight: string;
}
/**
 * ML Insight
 */
export interface MLInsight {
    type: 'performance' | 'timing' | 'device' | 'location' | 'position';
    priority: 'high' | 'medium' | 'low';
    message: string;
    data?: Record<string, unknown>;
}
export declare class EnhancedAnalyticsService {
    private cachePrefix;
    private cacheTTL;
    /**
     * Get enhanced KPIs with day-over-day deltas
     */
    getEnhancedKPIs(hubId: string): Promise<EnhancedKPIs>;
    /**
     * Get trends by granularity
     */
    getTrends(hubId: string, granularity?: TimeGranularity, days?: number): Promise<TrendDataPoint[]>;
    /**
     * Weekday vs Weekend analysis
     */
    getWeekdayVsWeekend(hubId: string, days?: number): Promise<WeekdayWeekendAnalysis>;
    /**
     * Get country breakdown
     */
    getCountryBreakdown(hubId: string, window?: TimeWindow): Promise<CountryBreakdown>;
    /**
     * Get rule trigger analytics
     */
    getRuleAnalytics(hubId: string, window?: TimeWindow): Promise<RuleTriggerAnalytics>;
    /**
     * Before/After comparison (7 days vs previous 7 days)
     */
    getBeforeAfterComparison(hubId: string): Promise<BeforeAfterComparison>;
    /**
     * Position impact analysis
     */
    getPositionImpact(hubId: string, window?: TimeWindow): Promise<PositionImpactAnalysis>;
    /**
     * Generate ML insights (statistical analysis)
     */
    generateMLInsights(hubId: string): Promise<MLInsight[]>;
}
export declare const enhancedAnalyticsService: EnhancedAnalyticsService;
//# sourceMappingURL=EnhancedAnalyticsService.d.ts.map