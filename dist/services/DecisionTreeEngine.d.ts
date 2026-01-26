import { IDecisionNode } from '../models/RuleTree';
/**
 * Request context for decision tree traversal
 */
export interface IRequestContext {
    userAgent: string;
    country: string;
    lat: number;
    lon: number;
    timestamp: Date;
}
/**
 * Parsed device information
 */
export interface IDeviceInfo {
    type: string;
    browser: string;
    os: string;
}
/**
 * Decision Tree Engine
 * Evaluates requests against a rule tree in strict order: device → location → time
 */
export declare class DecisionTreeEngine {
    /**
     * Main traversal entry point
     * Returns variant IDs from the reached leaf node
     */
    traverse(context: IRequestContext, root: IDecisionNode): string[];
    /**
     * Parse user agent to determine device type
     */
    parseDevice(userAgent: string): IDeviceInfo;
    /**
     * Evaluate device node
     * Branches: mobile, desktop, tablet, default
     */
    private evaluateDeviceNode;
    /**
     * Evaluate location node
     * Priority: country code → polygon contains → radius check → default
     */
    private evaluateLocationNode;
    /**
     * Check if a point is inside a GeoJSON polygon
     */
    private isPointInPolygon;
    /**
     * Check if a point is within a radius of a center point
     */
    private isPointInRadius;
    /**
     * Evaluate time node
     * Checks recurring windows (day + time in timezone) then absolute windows
     */
    private evaluateTimeNode;
    /**
     * Check if timestamp falls within a time window
     */
    private isInTimeWindow;
    /**
     * Check if a variant passes all its conditions for the given context
     * Used for Link Hub mode - filters ALL variants, not picks one
     */
    checkVariantConditions(context: IRequestContext, conditions?: IVariantConditions): boolean;
    /**
     * Filter all variants based on conditions
     * Returns array of variants that pass the filter, sorted by score
     */
    filterVariants(context: IRequestContext, variants: IVariantWithConditions[]): IFilteredVariant[];
}
/**
 * Variant conditions interface
 */
export interface IVariantConditions {
    device_types?: string[];
    countries?: string[];
    time_windows?: Array<{
        branch_id?: string;
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
    }>;
}
/**
 * Variant with conditions for filtering
 */
export interface IVariantWithConditions {
    variant_id: string;
    target_url: string;
    title?: string;
    description?: string;
    icon?: string;
    priority: number;
    enabled: boolean;
    score?: number;
    conditions?: IVariantConditions;
}
/**
 * Filtered variant result
 */
export interface IFilteredVariant {
    variant_id: string;
    target_url: string;
    title: string;
    description?: string;
    icon?: string;
    priority: number;
    score: number;
}
export declare const decisionTreeEngine: DecisionTreeEngine;
//# sourceMappingURL=DecisionTreeEngine.d.ts.map