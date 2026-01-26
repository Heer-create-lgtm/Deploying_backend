import mongoose, { Document } from 'mongoose';
/**
 * Event types for analytics
 */
export declare enum AnalyticsEventType {
    HUB_IMPRESSION = "hub_impression",
    LINK_CLICK = "link_click",
    REDIRECT = "redirect",
    CONVERSION = "conversion",
    RAGE_CLICK = "rage_click"
}
/**
 * Device types
 */
export declare enum DeviceType {
    MOBILE = "mobile",
    TABLET = "tablet",
    DESKTOP = "desktop",
    UNKNOWN = "unknown"
}
/**
 * Source types
 */
export declare enum SourceType {
    DIRECT = "direct",
    QR = "qr",
    SOCIAL = "social",
    EMAIL = "email",
    OTHER = "other"
}
export interface IAnalyticsEvent extends Document {
    event_id: string;
    event_type: AnalyticsEventType;
    hub_id: string;
    link_id?: string;
    variant_id?: string;
    timestamp: Date;
    session_id: string;
    user_agent: string;
    device_type: DeviceType;
    coarse_location?: string;
    referrer?: string;
    ip_address?: string;
    rule_id?: string;
    rule_reason?: string;
    link_position?: number;
    source_type: SourceType;
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
export declare const AnalyticsEvent: mongoose.Model<IAnalyticsEvent, {}, {}, {}, mongoose.Document<unknown, {}, IAnalyticsEvent, {}, {}> & IAnalyticsEvent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=AnalyticsEvent.d.ts.map