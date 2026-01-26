import { AnalyticsEvent, AnalyticsEventType, DeviceType, SourceType, IAnalyticsEvent } from '../models/AnalyticsEvent';
import { v4 as uuidv4 } from 'uuid';
import UAParser from 'ua-parser-js';

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
    // Enhanced fields
    rule_id?: string | null;
    rule_reason?: string | null;
    link_position?: number | null;
    source_type?: SourceType;
    metadata?: Record<string, unknown>;

    // Engagement fields (optional for standard clicks)
    dwell_time?: number;
    scroll_depth?: number;
    engagement_score?: 'Low' | 'Medium' | 'High';

    // Rage click fields
    rage_click_count?: number;
    element_selector?: string;
    target_url?: string;

    // Conversion fields
    conversion_type?: string;
    revenue?: number;
}

/**
 * Analytics Event Service
 * Handles async, non-blocking event logging with enhanced fields
 */
export class AnalyticsEventService {
    private eventQueue: EnhancedEventParams[] = [];
    private isProcessing = false;
    private batchSize = 100;
    private flushInterval = 5000; // 5 seconds

    constructor() {
        // Start background flush timer
        setInterval(() => this.flushQueue(), this.flushInterval);
    }

    /**
     * Log an analytics event (async, non-blocking)
     */
    async logEvent(params: EnhancedEventParams): Promise<void> {
        // Add to queue for batch processing
        this.eventQueue.push(params);

        // If queue is large enough, trigger immediate flush
        if (this.eventQueue.length >= this.batchSize) {
            this.flushQueue();
        }
    }

    /**
     * Log event immediately (for critical events)
     */
    async logEventSync(params: EnhancedEventParams): Promise<IAnalyticsEvent | null> {
        try {
            const event = await this.createEvent(params);
            return event;
        } catch (error) {
            console.error('Failed to log analytics event:', error);
            return null;
        }
    }

    /**
     * Create and persist an event
     */
    private async createEvent(params: EnhancedEventParams): Promise<IAnalyticsEvent> {
        const deviceType = this.parseDeviceType(params.user_agent);
        const location = params.ip_address ? await this.getCoarseLocation(params.ip_address) : null;

        const event = new AnalyticsEvent({
            event_id: uuidv4(),
            event_type: params.event_type,
            hub_id: params.hub_id,
            link_id: params.link_id || null,
            variant_id: params.variant_id || null,
            timestamp: new Date(),
            session_id: params.session_id,
            user_agent: params.user_agent,
            device_type: deviceType,
            coarse_location: location,
            referrer: params.referrer || null,
            // Enhanced fields
            rule_id: params.rule_id || null,
            rule_reason: params.rule_reason || null,
            link_position: params.link_position ?? null,
            source_type: params.source_type || SourceType.DIRECT,
            metadata: params.metadata || {},
            dwell_time: params.dwell_time,
            scroll_depth: params.scroll_depth,
            engagement_score: params.engagement_score,
            rage_click_count: params.rage_click_count,
            element_selector: params.element_selector,
            target_url: params.target_url,
            conversion_type: params.conversion_type,
            revenue: params.revenue
        });

        await event.save();
        return event;
    }

    /**
     * Flush queued events to database
     */
    private async flushQueue(): Promise<void> {
        if (this.isProcessing || this.eventQueue.length === 0) return;

        this.isProcessing = true;
        const eventsToProcess = this.eventQueue.splice(0, this.batchSize);

        try {
            const eventDocs = await Promise.all(
                eventsToProcess.map(async (params) => {
                    const deviceType = this.parseDeviceType(params.user_agent);
                    const location = params.ip_address
                        ? await this.getCoarseLocation(params.ip_address)
                        : null;

                    return {
                        event_id: uuidv4(),
                        event_type: params.event_type,
                        hub_id: params.hub_id,
                        link_id: params.link_id || null,
                        variant_id: params.variant_id || null,
                        timestamp: new Date(),
                        session_id: params.session_id,
                        user_agent: params.user_agent,
                        device_type: deviceType,
                        coarse_location: location,
                        referrer: params.referrer || null,
                        // Enhanced fields
                        rule_id: params.rule_id || null,
                        rule_reason: params.rule_reason || null,
                        link_position: params.link_position ?? null,
                        source_type: params.source_type || SourceType.DIRECT,
                        metadata: params.metadata || {},
                        dwell_time: params.dwell_time,
                        scroll_depth: params.scroll_depth,
                        engagement_score: params.engagement_score,
                        rage_click_count: params.rage_click_count,
                        element_selector: params.element_selector,
                        target_url: params.target_url,
                        conversion_type: params.conversion_type,
                        revenue: params.revenue
                    };
                })
            );

            // Bulk insert for efficiency
            await AnalyticsEvent.insertMany(eventDocs, { ordered: false });
        } catch (error) {
            console.error('Failed to flush analytics events:', error);
            // Re-queue failed events
            this.eventQueue.unshift(...eventsToProcess);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Parse device type from user agent
     */
    private parseDeviceType(userAgent: string): DeviceType {
        const parser = new UAParser(userAgent);
        const device = parser.getDevice();

        if (device.type === 'mobile') return DeviceType.MOBILE;
        if (device.type === 'tablet') return DeviceType.TABLET;
        return DeviceType.DESKTOP;
    }

    /**
     * Get coarse location from IP (simplified)
     */
    private async getCoarseLocation(ipAddress: string): Promise<string | null> {
        // In production, use a geo-IP service like MaxMind or ip-api
        try {
            // Skip local/private IPs
            if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('192.168.')) {
                return 'local';
            }
            // Would integrate with geo-IP service here
            return null;
        } catch {
            return null;
        }
    }

    /**
     * Log HUB_IMPRESSION event (enhanced)
     */
    async logHubImpression(
        hubId: string,
        sessionId: string,
        userAgent: string,
        referrer?: string,
        ip?: string,
        sourceType: SourceType = SourceType.DIRECT
    ): Promise<void> {
        await this.logEvent({
            event_type: AnalyticsEventType.HUB_IMPRESSION,
            hub_id: hubId,
            session_id: sessionId,
            user_agent: userAgent,
            referrer: referrer,
            ip_address: ip,
            source_type: sourceType
        });
    }

    /**
     * Log LINK_CLICK event (enhanced with rule and position tracking)
     */
    async logLinkClick(
        hubId: string,
        linkId: string,
        variantId: string | null,
        sessionId: string,
        userAgent: string,
        referrer?: string,
        ip?: string,
        options?: {
            rule_id?: string;
            rule_reason?: string;
            link_position?: number;
            source_type?: SourceType;
        }
    ): Promise<void> {
        await this.logEvent({
            event_type: AnalyticsEventType.LINK_CLICK,
            hub_id: hubId,
            link_id: linkId,
            variant_id: variantId,
            session_id: sessionId,
            user_agent: userAgent,
            referrer: referrer,
            ip_address: ip,
            rule_id: options?.rule_id,
            rule_reason: options?.rule_reason,
            link_position: options?.link_position,
            source_type: options?.source_type || SourceType.DIRECT
        });
    }

    /**
     * Log REDIRECT event (enhanced)
     */
    async logRedirect(
        hubId: string,
        variantId: string,
        sessionId: string,
        userAgent: string,
        targetUrl: string,
        ip?: string,
        options?: {
            rule_id?: string;
            rule_reason?: string;
            source_type?: SourceType;
        }
    ): Promise<void> {
        await this.logEvent({
            event_type: AnalyticsEventType.REDIRECT,
            hub_id: hubId,
            variant_id: variantId,
            session_id: sessionId,
            user_agent: userAgent,
            ip_address: ip,
            rule_id: options?.rule_id,
            rule_reason: options?.rule_reason,
            source_type: options?.source_type || SourceType.DIRECT,
            metadata: { target_url: targetUrl }
        });
    }
}

// Singleton instance
export const analyticsEventService = new AnalyticsEventService();

