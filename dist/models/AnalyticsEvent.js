"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnalyticsEvent = exports.SourceType = exports.DeviceType = exports.AnalyticsEventType = void 0;
const mongoose_1 = __importStar(require("mongoose"));
/**
 * Event types for analytics
 */
var AnalyticsEventType;
(function (AnalyticsEventType) {
    AnalyticsEventType["HUB_IMPRESSION"] = "hub_impression";
    AnalyticsEventType["LINK_CLICK"] = "link_click";
    AnalyticsEventType["REDIRECT"] = "redirect";
    AnalyticsEventType["CONVERSION"] = "conversion";
    AnalyticsEventType["RAGE_CLICK"] = "rage_click";
})(AnalyticsEventType || (exports.AnalyticsEventType = AnalyticsEventType = {}));
/**
 * Device types
 */
var DeviceType;
(function (DeviceType) {
    DeviceType["MOBILE"] = "mobile";
    DeviceType["TABLET"] = "tablet";
    DeviceType["DESKTOP"] = "desktop";
    DeviceType["UNKNOWN"] = "unknown";
})(DeviceType || (exports.DeviceType = DeviceType = {}));
/**
 * Source types
 */
var SourceType;
(function (SourceType) {
    SourceType["DIRECT"] = "direct";
    SourceType["QR"] = "qr";
    SourceType["SOCIAL"] = "social";
    SourceType["EMAIL"] = "email";
    SourceType["OTHER"] = "other";
})(SourceType || (exports.SourceType = SourceType = {}));
const AnalyticsEventSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.Mixed,
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
exports.AnalyticsEvent = mongoose_1.default.model('AnalyticsEvent', AnalyticsEventSchema);
//# sourceMappingURL=AnalyticsEvent.js.map