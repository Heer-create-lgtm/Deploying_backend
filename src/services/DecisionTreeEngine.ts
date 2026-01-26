import UAParser from 'ua-parser-js';
import { DateTime } from 'luxon';
import * as geolib from 'geolib';
import { IDecisionNode, ITimeWindow, IGeoPolygon, IRadiusFallback } from '../models/RuleTree';

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
    type: string;          // "mobile" | "desktop" | "tablet" | "other"
    browser: string;
    os: string;
}

/**
 * Decision Tree Engine
 * Evaluates requests against a rule tree in strict order: device → location → time
 */
export class DecisionTreeEngine {

    /**
     * Main traversal entry point
     * Returns variant IDs from the reached leaf node
     */
    traverse(context: IRequestContext, root: IDecisionNode): string[] {
        let currentNode: IDecisionNode | undefined = root;

        // Traverse until we reach a leaf
        while (currentNode && currentNode.type !== 'leaf') {
            switch (currentNode.type) {
                case 'device':
                    currentNode = this.evaluateDeviceNode(context.userAgent, currentNode);
                    break;
                case 'location':
                    currentNode = this.evaluateLocationNode(
                        context.country,
                        context.lat,
                        context.lon,
                        currentNode
                    );
                    break;
                case 'time':
                    currentNode = this.evaluateTimeNode(context.timestamp, currentNode);
                    break;
                default:
                    // Unknown node type, return empty
                    return [];
            }
        }

        // Return variant IDs from leaf or empty array
        return currentNode?.variant_ids || [];
    }

    /**
     * Parse user agent to determine device type
     */
    parseDevice(userAgent: string): IDeviceInfo {
        const parser = new UAParser(userAgent);
        const result = parser.getResult();

        let type = 'other';
        const deviceType = result.device?.type;

        if (deviceType === 'mobile') {
            type = 'mobile';
        } else if (deviceType === 'tablet') {
            type = 'tablet';
        } else if (!deviceType || deviceType === 'undefined') {
            // No device type usually means desktop browser
            type = 'desktop';
        }

        return {
            type,
            browser: result.browser?.name || 'unknown',
            os: result.os?.name || 'unknown',
        };
    }

    /**
     * Evaluate device node
     * Branches: mobile, desktop, tablet, default
     */
    private evaluateDeviceNode(userAgent: string, node: IDecisionNode): IDecisionNode | undefined {
        const deviceInfo = this.parseDevice(userAgent);
        const branches = node.device_branches;

        if (!branches) {
            return undefined;
        }

        // Convert Map to object if needed (MongoDB returns Map)
        const branchesObj = branches instanceof Map
            ? Object.fromEntries(branches)
            : branches;

        // Try exact match first
        if (branchesObj[deviceInfo.type]) {
            return branchesObj[deviceInfo.type] as IDecisionNode;
        }

        // Fall back to default
        if (branchesObj['default']) {
            return branchesObj['default'] as IDecisionNode;
        }

        return undefined;
    }

    /**
     * Evaluate location node
     * Priority: country code → polygon contains → radius check → default
     */
    private evaluateLocationNode(
        country: string,
        lat: number,
        lon: number,
        node: IDecisionNode
    ): IDecisionNode | undefined {
        const countryBranches = node.country_branches;

        // Convert Map to object if needed
        const branchesObj = countryBranches instanceof Map
            ? Object.fromEntries(countryBranches)
            : countryBranches;

        // 1. Try country code match
        if (branchesObj && branchesObj[country.toUpperCase()]) {
            return branchesObj[country.toUpperCase()] as IDecisionNode;
        }

        // 2. Try polygon containment check
        if (node.polygon_fallback && node.polygon_fallback_node) {
            if (this.isPointInPolygon(lat, lon, node.polygon_fallback)) {
                return node.polygon_fallback_node;
            }
        }

        // 3. Try radius check
        if (node.radius_fallback && node.radius_fallback_node) {
            if (this.isPointInRadius(lat, lon, node.radius_fallback)) {
                return node.radius_fallback_node;
            }
        }

        // 4. Fall back to default
        if (node.location_default_node) {
            return node.location_default_node;
        }

        return undefined;
    }

    /**
     * Check if a point is inside a GeoJSON polygon
     */
    private isPointInPolygon(lat: number, lon: number, polygon: IGeoPolygon): boolean {
        if (!polygon.coordinates || polygon.coordinates.length === 0) {
            return false;
        }

        // Convert GeoJSON coordinates (lon, lat) to geolib format
        const ring = polygon.coordinates[0];
        const geolibPolygon = ring.map(([lng, lt]) => ({ latitude: lt, longitude: lng }));

        return geolib.isPointInPolygon(
            { latitude: lat, longitude: lon },
            geolibPolygon
        );
    }

    /**
     * Check if a point is within a radius of a center point
     */
    private isPointInRadius(lat: number, lon: number, radius: IRadiusFallback): boolean {
        const [centerLat, centerLon] = radius.center;

        const distance = geolib.getDistance(
            { latitude: lat, longitude: lon },
            { latitude: centerLat, longitude: centerLon }
        );

        // Convert km to meters for comparison
        return distance <= radius.radius_km * 1000;
    }

    /**
     * Evaluate time node
     * Checks recurring windows (day + time in timezone) then absolute windows
     */
    private evaluateTimeNode(timestamp: Date, node: IDecisionNode): IDecisionNode | undefined {
        const timeWindows = node.time_windows;

        if (!timeWindows || timeWindows.length === 0) {
            return node.time_default_node;
        }

        // Check each time window in order
        for (const window of timeWindows) {
            if (this.isInTimeWindow(timestamp, window)) {
                return window.next_node;
            }
        }

        // Fall back to default
        return node.time_default_node;
    }

    /**
     * Check if timestamp falls within a time window
     */
    private isInTimeWindow(timestamp: Date, window: ITimeWindow & { next_node: IDecisionNode }): boolean {
        // Check recurring windows first
        if (window.recurring) {
            const { days, start_time, end_time, timezone } = window.recurring;

            // Convert timestamp to the specified timezone
            const dt = DateTime.fromJSDate(timestamp).setZone(timezone);
            const currentDay = dt.weekday % 7; // Luxon uses 1-7 (Mon-Sun), convert to 0-6 (Sun-Sat)

            // Check if current day matches
            if (!days.includes(currentDay)) {
                return false;
            }

            // Parse start and end times
            const [startHour, startMin] = start_time.split(':').map(Number);
            const [endHour, endMin] = end_time.split(':').map(Number);

            const currentMinutes = dt.hour * 60 + dt.minute;
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;

            // Handle overnight windows (e.g., 22:00 - 06:00)
            if (startMinutes <= endMinutes) {
                return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
            } else {
                return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
            }
        }

        // Check absolute windows
        if (window.absolute) {
            const { start, end } = window.absolute;
            const ts = timestamp.getTime();
            return ts >= new Date(start).getTime() && ts <= new Date(end).getTime();
        }

        return false;
    }

    /**
     * Check if a variant passes all its conditions for the given context
     * Used for Link Hub mode - filters ALL variants, not picks one
     */
    checkVariantConditions(context: IRequestContext, conditions?: IVariantConditions): boolean {
        if (!conditions) {
            return true; // No conditions = always show
        }

        const deviceInfo = this.parseDevice(context.userAgent);

        // Check device type condition
        if (conditions.device_types && conditions.device_types.length > 0) {
            if (!conditions.device_types.includes(deviceInfo.type)) {
                return false;
            }
        }

        // Check country condition
        if (conditions.countries && conditions.countries.length > 0) {
            if (!conditions.countries.includes(context.country.toUpperCase())) {
                return false;
            }
        }

        // Check time window conditions
        if (conditions.time_windows && conditions.time_windows.length > 0) {
            const inAnyWindow = conditions.time_windows.some((tw) => {
                if (tw.recurring) {
                    const dt = DateTime.fromJSDate(context.timestamp).setZone(tw.recurring.timezone);
                    const currentDay = dt.weekday % 7;
                    
                    if (!tw.recurring.days.includes(currentDay)) {
                        return false;
                    }

                    const [startHour, startMin] = tw.recurring.start_time.split(':').map(Number);
                    const [endHour, endMin] = tw.recurring.end_time.split(':').map(Number);
                    const currentMinutes = dt.hour * 60 + dt.minute;
                    const startMinutes = startHour * 60 + startMin;
                    const endMinutes = endHour * 60 + endMin;

                    if (startMinutes <= endMinutes) {
                        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
                    } else {
                        return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
                    }
                }
                if (tw.absolute) {
                    const ts = context.timestamp.getTime();
                    return ts >= new Date(tw.absolute.start).getTime() && ts <= new Date(tw.absolute.end).getTime();
                }
                return false;
            });

            if (!inAnyWindow) {
                return false;
            }
        }

        return true;
    }

    /**
     * Filter all variants based on conditions
     * Returns array of variants that pass the filter, sorted by score
     */
    filterVariants(context: IRequestContext, variants: IVariantWithConditions[]): IFilteredVariant[] {
        const passing: IFilteredVariant[] = [];

        for (const variant of variants) {
            if (!variant.enabled) continue;
            
            if (this.checkVariantConditions(context, variant.conditions)) {
                passing.push({
                    variant_id: variant.variant_id,
                    target_url: variant.target_url,
                    title: variant.title || variant.variant_id,
                    description: variant.description,
                    icon: variant.icon,
                    priority: variant.priority,
                    score: variant.score || 0,
                });
            }
        }

        // Sort by score (descending), then by priority (descending)
        passing.sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }
            return b.priority - a.priority;
        });

        return passing;
    }
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

// Singleton instance
export const decisionTreeEngine = new DecisionTreeEngine();
