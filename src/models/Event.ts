import mongoose, { Schema, Document } from 'mongoose';

/**
 * Event types for analytics
 * - impression: Link resolution completed (variant selected)
 * - click: Redirect executed (user followed the link)
 * - hub_view: Hub profile page was loaded
 */
export type EventType = 'impression' | 'click' | 'hub_view';

export interface IEvent extends Document {
    hub_id: string;
    event_type: EventType;
    ip: string;
    country: string;
    lat: number;
    lon: number;
    user_agent: string;
    device_type: string;
    timestamp: Date;
    chosen_variant_id: string;
    processed: boolean;
}

const EventSchema = new Schema<IEvent>({
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

export const Event = mongoose.model<IEvent>('Event', EventSchema);
