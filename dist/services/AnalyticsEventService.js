"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsEventService = exports.AnalyticsEventService = void 0;
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const uuid_1 = require("uuid");
const ua_parser_js_1 = __importDefault(require("ua-parser-js"));
/**
 * Analytics Event Service
 * Handles async, non-blocking event logging with enhanced fields
 */
class AnalyticsEventService {
    eventQueue = [];
    isProcessing = false;
    batchSize = 100;
    flushInterval = 5000; // 5 seconds
    constructor() {
        // Start background flush timer
        setInterval(() => this.flushQueue(), this.flushInterval);
    }
    /**
     * Log an analytics event (async, non-blocking)
     */
    async logEvent(params) {
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
    async logEventSync(params) {
        try {
            const event = await this.createEvent(params);
            return event;
        }
        catch (error) {
            console.error('Failed to log analytics event:', error);
            return null;
        }
    }
    /**
     * Create and persist an event
     */
    async createEvent(params) {
        const deviceType = this.parseDeviceType(params.user_agent);
        const location = params.ip_address ? await this.getCoarseLocation(params.ip_address) : null;
        const event = new AnalyticsEvent_1.AnalyticsEvent({
            event_id: (0, uuid_1.v4)(),
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
            source_type: params.source_type || AnalyticsEvent_1.SourceType.DIRECT,
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
    async flushQueue() {
        if (this.isProcessing || this.eventQueue.length === 0)
            return;
        this.isProcessing = true;
        const eventsToProcess = this.eventQueue.splice(0, this.batchSize);
        try {
            const eventDocs = await Promise.all(eventsToProcess.map(async (params) => {
                const deviceType = this.parseDeviceType(params.user_agent);
                const location = params.ip_address
                    ? await this.getCoarseLocation(params.ip_address)
                    : null;
                return {
                    event_id: (0, uuid_1.v4)(),
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
                    source_type: params.source_type || AnalyticsEvent_1.SourceType.DIRECT,
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
            }));
            // Bulk insert for efficiency
            await AnalyticsEvent_1.AnalyticsEvent.insertMany(eventDocs, { ordered: false });
        }
        catch (error) {
            console.error('Failed to flush analytics events:', error);
            // Re-queue failed events
            this.eventQueue.unshift(...eventsToProcess);
        }
        finally {
            this.isProcessing = false;
        }
    }
    /**
     * Parse device type from user agent
     */
    parseDeviceType(userAgent) {
        const parser = new ua_parser_js_1.default(userAgent);
        const device = parser.getDevice();
        if (device.type === 'mobile')
            return AnalyticsEvent_1.DeviceType.MOBILE;
        if (device.type === 'tablet')
            return AnalyticsEvent_1.DeviceType.TABLET;
        return AnalyticsEvent_1.DeviceType.DESKTOP;
    }
    /**
     * Get coarse location from IP (simplified)
     */
    async getCoarseLocation(ipAddress) {
        // In production, use a geo-IP service like MaxMind or ip-api
        try {
            // Skip local/private IPs
            if (ipAddress === '127.0.0.1' || ipAddress === '::1' || ipAddress.startsWith('192.168.')) {
                return 'local';
            }
            // Would integrate with geo-IP service here
            return null;
        }
        catch {
            return null;
        }
    }
    /**
     * Log HUB_IMPRESSION event (enhanced)
     */
    async logHubImpression(hubId, sessionId, userAgent, referrer, ip, sourceType = AnalyticsEvent_1.SourceType.DIRECT) {
        await this.logEvent({
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
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
    async logLinkClick(hubId, linkId, variantId, sessionId, userAgent, referrer, ip, options) {
        await this.logEvent({
            event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
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
            source_type: options?.source_type || AnalyticsEvent_1.SourceType.DIRECT
        });
    }
    /**
     * Log REDIRECT event (enhanced)
     */
    async logRedirect(hubId, variantId, sessionId, userAgent, targetUrl, ip, options) {
        await this.logEvent({
            event_type: AnalyticsEvent_1.AnalyticsEventType.REDIRECT,
            hub_id: hubId,
            variant_id: variantId,
            session_id: sessionId,
            user_agent: userAgent,
            ip_address: ip,
            rule_id: options?.rule_id,
            rule_reason: options?.rule_reason,
            source_type: options?.source_type || AnalyticsEvent_1.SourceType.DIRECT,
            metadata: { target_url: targetUrl }
        });
    }
}
exports.AnalyticsEventService = AnalyticsEventService;
// Singleton instance
exports.analyticsEventService = new AnalyticsEventService();
//# sourceMappingURL=AnalyticsEventService.js.map