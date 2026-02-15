import mongoose, { Schema, Document } from 'mongoose';
import { ITimeWindow } from './RuleTree';

export interface IVariantConditions {
    device_types?: string[];      // ["mobile", "desktop"]
    countries?: string[];          // ["US", "IN", "GB"]
    time_windows?: ITimeWindow[];
}

export interface IVariant extends Document {
    variant_id: string;
    hub_id: string;
    target_url: string;
    title?: string;                // Display title for the link
    description?: string;          // Optional description
    icon?: string;                 // Emoji or icon string
    priority: number;              // Higher = better (used for tie-breaking)
    weight: number;                // For weighted random selection
    enabled: boolean;
    conditions: IVariantConditions;
    created_at: Date;
    updated_at: Date;
}

const TimeWindowConditionSchema = new Schema({
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

const VariantConditionsSchema = new Schema({
    device_types: [String],
    countries: [String],
    time_windows: [TimeWindowConditionSchema],
}, { _id: false });

const VariantSchema = new Schema<IVariant>({
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

export const Variant = mongoose.model<IVariant>('Variant', VariantSchema);
