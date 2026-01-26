import mongoose, { Document } from 'mongoose';
import { ITimeWindow } from './RuleTree';
export interface IVariantConditions {
    device_types?: string[];
    countries?: string[];
    time_windows?: ITimeWindow[];
}
export interface IVariant extends Document {
    variant_id: string;
    hub_id: string;
    target_url: string;
    title?: string;
    description?: string;
    icon?: string;
    priority: number;
    weight: number;
    enabled: boolean;
    conditions: IVariantConditions;
    created_at: Date;
    updated_at: Date;
}
export declare const Variant: mongoose.Model<IVariant, {}, {}, {}, mongoose.Document<unknown, {}, IVariant, {}, {}> & IVariant & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=Variant.d.ts.map