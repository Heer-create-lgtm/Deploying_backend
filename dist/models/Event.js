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
exports.Event = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const EventSchema = new mongoose_1.Schema({
    hub_id: {
        type: String,
        required: true,
        index: true
    },
    event_type: {
        type: String,
        enum: ['impression', 'click', 'hub_view'],
        required: true,
        default: 'click',
        index: true
    },
    ip: {
        type: String,
        required: true
    },
    country: {
        type: String,
        default: 'unknown'
    },
    lat: {
        type: Number,
        default: 0
    },
    lon: {
        type: Number,
        default: 0
    },
    user_agent: {
        type: String,
        default: ''
    },
    device_type: {
        type: String,
        default: 'unknown'
    },
    timestamp: {
        type: Date,
        default: Date.now,
        // Note: Don't add index: true here - TTL index below creates the index
    },
    chosen_variant_id: {
        type: String,
        required: true,
        index: true
    },
    processed: {
        type: Boolean,
        default: false
    },
});
// Compound indexes for efficient querying
EventSchema.index({ hub_id: 1, timestamp: -1 });
EventSchema.index({ hub_id: 1, event_type: 1, timestamp: -1 });
EventSchema.index({ chosen_variant_id: 1, event_type: 1, timestamp: -1 });
EventSchema.index({ processed: 1, timestamp: 1 });
// TTL index to auto-delete old events after 90 days (optional)
EventSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
exports.Event = mongoose_1.default.model('Event', EventSchema);
//# sourceMappingURL=Event.js.map