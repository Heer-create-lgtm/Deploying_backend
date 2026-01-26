import mongoose, { Schema, Document } from 'mongoose';

// Time window for recurring or absolute time-based routing
export interface ITimeWindow {
    branch_id: string;
    recurring?: {
        days: number[];        // 0-6 (Sunday-Saturday)
        start_time: string;    // "09:00" in 24h format
        end_time: string;      // "17:00" in 24h format
        timezone: string;      // IANA timezone e.g., "Asia/Kolkata"
    };
    absolute?: {
        start: Date;
        end: Date;
    };
}

// Decision node types
export type NodeType = 'device' | 'location' | 'time' | 'leaf';

// Polygon for geo-fencing
export interface IGeoPolygon {
    type: 'Polygon';
    coordinates: number[][][];
}

// Radius-based location fallback
export interface IRadiusFallback {
    center: [number, number];  // [lat, lon]
    radius_km: number;
}

// Decision node structure (recursive for tree)
export interface IDecisionNode {
    type: NodeType;

    // Device node branches
    device_branches?: Record<string, IDecisionNode>;  // "mobile" | "desktop" | "tablet" | "default"

    // Location node branches
    country_branches?: Record<string, IDecisionNode>; // Country codes: "US", "IN", "GB", etc.
    polygon_fallback?: IGeoPolygon;
    polygon_fallback_node?: IDecisionNode;
    radius_fallback?: IRadiusFallback;
    radius_fallback_node?: IDecisionNode;
    location_default_node?: IDecisionNode;

    // Time node branches
    time_windows?: Array<ITimeWindow & { next_node: IDecisionNode }>;
    time_default_node?: IDecisionNode;

    // Leaf node - contains variant IDs
    variant_ids?: string[];
}

export interface IRuleTree extends Document {
    name: string;
    hub_id: string;
    root: IDecisionNode;
    version: number;
    created_at: Date;
    updated_at: Date;
}

// Nested schema for time windows
const TimeWindowSchema = new Schema({
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
const DecisionNodeSchema = new Schema({
    type: {
        type: String,
        enum: ['device', 'location', 'time', 'leaf'],
        required: true
    },
    device_branches: { type: Map, of: Schema.Types.Mixed },
    country_branches: { type: Map, of: Schema.Types.Mixed },
    polygon_fallback: {
        type: { type: String, enum: ['Polygon'] },
        coordinates: [[[Number]]],
    },
    polygon_fallback_node: Schema.Types.Mixed,
    radius_fallback: {
        center: [Number],
        radius_km: Number,
    },
    radius_fallback_node: Schema.Types.Mixed,
    location_default_node: Schema.Types.Mixed,
    time_windows: [Schema.Types.Mixed],
    time_default_node: Schema.Types.Mixed,
    variant_ids: [String],
}, { _id: false, strict: false });

const RuleTreeSchema = new Schema<IRuleTree>({
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

export const RuleTree = mongoose.model<IRuleTree>('RuleTree', RuleTreeSchema);
