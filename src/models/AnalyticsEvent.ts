import mongoose, { Schema, Document } from 'mongoose';

/**
 * Event types for analytics
 */
export enum AnalyticsEventType {
    HUB_IMPRESSION = 'hub_impression',
    LINK_CLICK = 'link_click',
    REDIRECT = 'redirect',
    CONVERSION = 'conversion',
    RAGE_CLICK = 'rage_click'
}

/**
 * Device types
 */
export enum DeviceType {
    MOBILE = 'mobile',
    TABLET = 'tablet',
    DESKTOP = 'desktop',
    UNKNOWN = 'unknown'
}

/**
 * Source types
 */
export enum SourceType {
    DIRECT = 'direct',
    QR = 'qr',
    SOCIAL = 'social',
    EMAIL = 'email',
    OTHER = 'other'
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

    // Enhanced fields
    rule_id?: string;
    rule_reason?: string;
    link_position?: number;
    source_type: SourceType;
    metadata?: Record<string, unknown>;

    // Engagement Metrics
    dwell_time?: number;
    scroll_depth?: number;
    engagement_score?: 'Low' | 'Medium' | 'High';

    // Rage Click Metrics
    rage_click_count?: number;
    element_selector?: string;
    target_url?: string;

    // Conversion Metrics
    conversion_type?: string;
    revenue?: number;
}

const AnalyticsEventSchema = new Schema<IAnalyticsEvent>({
    event_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    event_type: {
        type: String,
        enum: Object.values(AnalyticsEventType),
        required: true,
        index: true
    },
    hub_id: {
        type: String,
        required: true,
        index: true
    },
    link_id: {
        type: String,
        index: true
    },
    variant_id: {
        type: String,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    session_id: {
        type: String,
        required: true,
        index: true
    },
    user_agent: {
        type: String,
        required: true
    },
    device_type: {
        type: String,
        enum: Object.values(DeviceType),
        default: DeviceType.UNKNOWN,
        index: true
    },
    coarse_location: {
        type: String,
        index: true
    },
    referrer: String,
    ip_address: String,

    // Enhanced fields
    rule_id: String,
    rule_reason: String,
    link_position: Number,
    source_type: {
        type: String,
        enum: Object.values(SourceType),
        default: SourceType.DIRECT
    },
    metadata: {
        type: Schema.Types.Mixed,
        default: {}
    },

    // Engagement Metrics
    dwell_time: Number,
    scroll_depth: Number,
    engagement_score: {
        type: String,
        enum: ['Low', 'Medium', 'High']
    },

    // Rage Click Metrics
    rage_click_count: Number,
    element_selector: String,
    target_url: String,

    // Conversion Metrics
    conversion_type: String,
    revenue: Number
}, {
    timestamps: true // Adds createdAt/updatedAt
});

// Compound indexes for common queries
AnalyticsEventSchema.index({ hub_id: 1, event_type: 1, timestamp: -1 });
AnalyticsEventSchema.index({ variant_id: 1, timestamp: -1 });

// TTL index (optional - 90 days)
AnalyticsEventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const AnalyticsEvent = mongoose.model<IAnalyticsEvent>('AnalyticsEvent', AnalyticsEventSchema);
