import mongoose, { Document } from 'mongoose';
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
export declare const Event: mongoose.Model<IEvent, {}, {}, {}, mongoose.Document<unknown, {}, IEvent, {}, {}> & IEvent & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Event.d.ts.map