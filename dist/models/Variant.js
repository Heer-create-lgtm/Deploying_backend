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
exports.Variant = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const TimeWindowConditionSchema = new mongoose_1.Schema({
    branch_id: String,
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
const VariantConditionsSchema = new mongoose_1.Schema({
    device_types: [String],
    countries: [String],
    time_windows: [TimeWindowConditionSchema],
}, { _id: false });
const VariantSchema = new mongoose_1.Schema({
    variant_id: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    hub_id: {
        type: String,
        required: true,
        index: true
    },
    target_url: {
        type: String,
        required: true
    },
    title: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    icon: {
        type: String,
        default: ''
    },
    priority: {
        type: Number,
        default: 0
    },
    weight: {
        type: Number,
        default: 1,
        min: 0
    },
    enabled: {
        type: Boolean,
        default: true
    },
    conditions: {
        type: VariantConditionsSchema,
        default: {}
    },
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});
// Compound index for efficient hub-based queries
VariantSchema.index({ hub_id: 1, enabled: 1 });
VariantSchema.index({ hub_id: 1, priority: -1 });
exports.Variant = mongoose_1.default.model('Variant', VariantSchema);
//# sourceMappingURL=Variant.js.map