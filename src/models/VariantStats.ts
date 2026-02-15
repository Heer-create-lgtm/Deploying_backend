import mongoose, { Schema, Document } from 'mongoose';

export interface IVariantStats extends Document {
    variant_id: string;
    hub_id: string;
    clicks: number;
    impressions: number;
    ctr: number;                   // Click-through rate: clicks / impressions
    score: number;                 // Precomputed ranking score (heuristic or ML)
    recent_clicks_hour: number;    // Rolling 60-minute click count (ML feature)
    last_updated: Date;
}

const VariantStatsSchema = new Schema<IVariantStats>({
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
    clicks: {
        type: Number,
        default: 0
    },
    impressions: {
        type: Number,
        default: 0
    },
    ctr: {
        type: Number,
        default: 0
    },
    score: {
        type: Number,
        default: 0
    },
    recent_clicks_hour: {
        type: Number,
        default: 0
    },
    last_updated: {
        type: Date,
        default: Date.now
    },
});

// Index for score-based sorting
VariantStatsSchema.index({ hub_id: 1, score: -1 });

export const VariantStats = mongoose.model<IVariantStats>('VariantStats', VariantStatsSchema);
