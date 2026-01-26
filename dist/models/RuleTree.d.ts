import mongoose, { Document } from 'mongoose';
export interface ITimeWindow {
    branch_id: string;
    recurring?: {
        days: number[];
        start_time: string;
        end_time: string;
        timezone: string;
    };
    absolute?: {
        start: Date;
        end: Date;
    };
}
export type NodeType = 'device' | 'location' | 'time' | 'leaf';
export interface IGeoPolygon {
    type: 'Polygon';
    coordinates: number[][][];
}
export interface IRadiusFallback {
    center: [number, number];
    radius_km: number;
}
export interface IDecisionNode {
    type: NodeType;
    device_branches?: Record<string, IDecisionNode>;
    country_branches?: Record<string, IDecisionNode>;
    polygon_fallback?: IGeoPolygon;
    polygon_fallback_node?: IDecisionNode;
    radius_fallback?: IRadiusFallback;
    radius_fallback_node?: IDecisionNode;
    location_default_node?: IDecisionNode;
    time_windows?: Array<ITimeWindow & {
        next_node: IDecisionNode;
    }>;
    time_default_node?: IDecisionNode;
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
export declare const RuleTree: mongoose.Model<IRuleTree, {}, {}, {}, mongoose.Document<unknown, {}, IRuleTree, {}, {}> & IRuleTree & Required<{
    _id: mongoose.Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=RuleTree.d.ts.map