import { AnalyticsEventType, SourceType, IAnalyticsEvent } from '../models/AnalyticsEvent';
/**
 * Enhanced Event Parameters (supports new fields)
 */
export interface EnhancedEventParams {
    event_type: AnalyticsEventType;
    hub_id: string;
    link_id?: string | null;
    variant_id?: string | null;
    session_id: string;
    user_agent: string;
    referrer?: string | null;
    ip_address?: string;
    rule_id?: string | null;
    rule_reason?: string | null;
    link_position?: number | null;
    source_type?: SourceType;
    metadata?: Record<string, unknown>;
    dwell_time?: number;
    scroll_depth?: number;
    engagement_score?: 'Low' | 'Medium' | 'High';
    rage_click_count?: number;
    element_selector?: string;
    target_url?: string;
    conversion_type?: string;
    revenue?: number;
}
/**
 * Analytics Event Service
 * Handles async, non-blocking event logging with enhanced fields
 */
export declare class AnalyticsEventService {
    private eventQueue;
    private isProcessing;
    private batchSize;
    private flushInterval;
    constructor();
    /**
     * Log an analytics event (async, non-blocking)
     */
    logEvent(params: EnhancedEventParams): Promise<void>;
    /**
     * Log event immediately (for critical events)
     */
    logEventSync(params: EnhancedEventParams): Promise<IAnalyticsEvent | null>;
    /**
     * Create and persist an event
     */
    private createEvent;
    /**
     * Flush queued events to database
     */
    private flushQueue;
    /**
     * Parse device type from user agent
     */
    private parseDeviceType;
    /**
     * Get coarse location from IP (simplified)
     */
    private getCoarseLocation;
    /**
     * Log HUB_IMPRESSION event (enhanced)
     */
    logHubImpression(hubId: string, sessionId: string, userAgent: string, referrer?: string, ip?: string, sourceType?: SourceType): Promise<void>;
    /**
     * Log LINK_CLICK event (enhanced with rule and position tracking)
     */
    logLinkClick(hubId: string, linkId: string, variantId: string | null, sessionId: string, userAgent: string, referrer?: string, ip?: string, options?: {
        rule_id?: string;
        rule_reason?: string;
        link_position?: number;
        source_type?: SourceType;
    }): Promise<void>;
    /**
     * Log REDIRECT event (enhanced)
     */
    logRedirect(hubId: string, variantId: string, sessionId: string, userAgent: string, targetUrl: string, ip?: string, options?: {
        rule_id?: string;
        rule_reason?: string;
        source_type?: SourceType;
    }): Promise<void>;
}
export declare const analyticsEventService: AnalyticsEventService;
//# sourceMappingURL=AnalyticsEventService.d.ts.map