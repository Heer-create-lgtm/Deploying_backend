"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateVariantSchema = exports.createVariantSchema = exports.updateRuleTreeSchema = exports.decisionNodeSchema = exports.updateHubSchema = exports.createHubSchema = exports.themeSchema = void 0;
exports.validate = validate;
exports.validateBody = validateBody;
const zod_1 = require("zod");
/**
 * Input Validation Schemas using Zod
 * Provides strict schema validation for all admin API inputs
 */
// Theme schema
exports.themeSchema = zod_1.z.object({
    bg: zod_1.z.string().min(1).max(50),
    accent: zod_1.z.string().min(1).max(50),
});
// Hub creation schema
exports.createHubSchema = zod_1.z.object({
    hub_id: zod_1.z.string()
        .min(1, 'hub_id is required')
        .max(100, 'hub_id too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'hub_id can only contain alphanumeric, underscore, or hyphen'),
    slug: zod_1.z.string()
        .min(1, 'slug is required')
        .max(100, 'slug too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'slug can only contain alphanumeric, underscore, or hyphen'),
    default_url: zod_1.z.string().url('Invalid URL format'),
    theme: exports.themeSchema,
});
// Hub update schema
exports.updateHubSchema = zod_1.z.object({
    slug: zod_1.z.string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
    default_url: zod_1.z.string().url().optional(),
    theme: exports.themeSchema.optional(),
});
// Time window schema
const recurringWindowSchema = zod_1.z.object({
    days: zod_1.z.array(zod_1.z.number().min(0).max(6)).min(1),
    start_time: zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    end_time: zod_1.z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    timezone: zod_1.z.string().min(1),
});
const absoluteWindowSchema = zod_1.z.object({
    start: zod_1.z.string().datetime().or(zod_1.z.date()),
    end: zod_1.z.string().datetime().or(zod_1.z.date()),
});
const timeWindowSchema = zod_1.z.object({
    branch_id: zod_1.z.string(),
    recurring: recurringWindowSchema.optional(),
    absolute: absoluteWindowSchema.optional(),
}).refine((data) => data.recurring || data.absolute, 'Either recurring or absolute window must be specified');
// GeoJSON polygon schema (limited to prevent abuse)
const geoPolygonSchema = zod_1.z.object({
    type: zod_1.z.literal('Polygon'),
    coordinates: zod_1.z.array(zod_1.z.array(zod_1.z.array(zod_1.z.number()).length(2))
        .min(4) // Minimum 4 points for a closed polygon
        .max(100) // Limit polygon complexity
    ).max(1), // Only outer ring supported
});
// Radius fallback schema
const radiusFallbackSchema = zod_1.z.object({
    center: zod_1.z.array(zod_1.z.number()).length(2),
    radius_km: zod_1.z.number().min(0.1).max(20000), // Max ~half Earth circumference
});
// Decision node schema (recursive)
const baseNodeSchema = zod_1.z.object({
    type: zod_1.z.enum(['device', 'location', 'time', 'leaf']),
    variant_ids: zod_1.z.array(zod_1.z.string()).optional(),
});
// Simplified decision node validation (deep validation is complex with recursion)
exports.decisionNodeSchema = zod_1.z.lazy(() => zod_1.z.object({
    type: zod_1.z.enum(['device', 'location', 'time', 'leaf']),
    device_branches: zod_1.z.record(zod_1.z.string(), exports.decisionNodeSchema).optional(),
    country_branches: zod_1.z.record(zod_1.z.string(), exports.decisionNodeSchema).optional(),
    polygon_fallback: geoPolygonSchema.optional(),
    polygon_fallback_node: exports.decisionNodeSchema.optional(),
    radius_fallback: radiusFallbackSchema.optional(),
    radius_fallback_node: exports.decisionNodeSchema.optional(),
    location_default_node: exports.decisionNodeSchema.optional(),
    time_windows: zod_1.z.array(zod_1.z.object({
        branch_id: zod_1.z.string(),
        recurring: recurringWindowSchema.optional(),
        absolute: absoluteWindowSchema.optional(),
        next_node: exports.decisionNodeSchema,
    })).optional(),
    time_default_node: exports.decisionNodeSchema.optional(),
    variant_ids: zod_1.z.array(zod_1.z.string().max(100)).max(50).optional(),
}));
// Rule tree update schema
exports.updateRuleTreeSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).max(100).optional(),
    root: exports.decisionNodeSchema,
});
// Variant conditions schema
const variantConditionsSchema = zod_1.z.object({
    device_types: zod_1.z.array(zod_1.z.string()).optional(),
    countries: zod_1.z.array(zod_1.z.string().length(2)).optional(), // ISO country codes
    time_windows: zod_1.z.array(timeWindowSchema).optional(),
});
// Variant creation schema
exports.createVariantSchema = zod_1.z.object({
    variant_id: zod_1.z.string()
        .min(1, 'variant_id is required')
        .max(100, 'variant_id too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'variant_id can only contain alphanumeric, underscore, or hyphen'),
    target_url: zod_1.z.string().url('Invalid URL format'),
    priority: zod_1.z.number().min(-1000).max(1000).default(0),
    weight: zod_1.z.number().min(0).max(1000).default(1),
    enabled: zod_1.z.boolean().default(true),
    conditions: variantConditionsSchema.default({}),
});
// Variant update schema
exports.updateVariantSchema = zod_1.z.object({
    target_url: zod_1.z.string().url().optional(),
    priority: zod_1.z.number().min(-1000).max(1000).optional(),
    weight: zod_1.z.number().min(0).max(1000).optional(),
    enabled: zod_1.z.boolean().optional(),
    conditions: variantConditionsSchema.optional(),
});
/**
 * Validation helper function
 */
function validate(schema, data) {
    const result = schema.safeParse(data);
    if (result.success) {
        return { success: true, data: result.data };
    }
    const errorMessages = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    return { success: false, error: errorMessages };
}
/**
 * Express middleware for request body validation
 */
function validateBody(schema) {
    return (req, res, next) => {
        const result = validate(schema, req.body);
        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }
        req.validatedBody = result.data;
        next();
    };
}
//# sourceMappingURL=validation.js.map