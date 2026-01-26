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
exports.RuleTree = void 0;
const mongoose_1 = __importStar(require("mongoose"));
// Nested schema for time windows
const TimeWindowSchema = new mongoose_1.Schema({
    branch_id: { type: String, required: true },
    recurring: {
        days: [{ type: Number, min: 0, max: 6 }],
        start_time: String,
        end_time: String,
        timezone: String,
    },
    absolute: {
        start: Date,
        end: Date,
    },
}, { _id: false });
// Recursive schema for decision nodes
const DecisionNodeSchema = new mongoose_1.Schema({
    type: {
        type: String,
        enum: ['device', 'location', 'time', 'leaf'],
        required: true
    },
    device_branches: { type: Map, of: mongoose_1.Schema.Types.Mixed },
    country_branches: { type: Map, of: mongoose_1.Schema.Types.Mixed },
    polygon_fallback: {
        type: { type: String, enum: ['Polygon'] },
        coordinates: [[[Number]]],
    },
    polygon_fallback_node: mongoose_1.Schema.Types.Mixed,
    radius_fallback: {
        center: [Number],
        radius_km: Number,
    },
    radius_fallback_node: mongoose_1.Schema.Types.Mixed,
    location_default_node: mongoose_1.Schema.Types.Mixed,
    time_windows: [mongoose_1.Schema.Types.Mixed],
    time_default_node: mongoose_1.Schema.Types.Mixed,
    variant_ids: [String],
}, { _id: false, strict: false });
const RuleTreeSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true
    },
    hub_id: {
        type: String,
        required: true,
        index: true
    },
    root: {
        type: DecisionNodeSchema,
        required: true
    },
    version: {
        type: Number,
        default: 1
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
// Compound index for efficient lookups
RuleTreeSchema.index({ hub_id: 1, version: -1 });
exports.RuleTree = mongoose_1.default.model('RuleTree', RuleTreeSchema);
//# sourceMappingURL=RuleTree.js.map