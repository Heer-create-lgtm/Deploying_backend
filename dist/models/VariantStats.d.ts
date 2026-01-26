import mongoose, { Document } from 'mongoose';
export interface IVariantStats extends Document {
    variant_id: string;
    hub_id: string;
    clicks: number;
    impressions: number;
    ctr: number;
    score: number;
    recent_clicks_hour: number;
    last_updated: Date;
}
export declare const VariantStats: mongoose.Model<IVariantStats, {}, {}, {}, mongoose.Document<unknown, {}, IVariantStats, {}, {}> & IVariantStats & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=VariantStats.d.ts.map