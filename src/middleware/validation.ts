import { z } from 'zod';

/**
 * Input Validation Schemas using Zod
 * Provides strict schema validation for all admin API inputs
 */

// Theme schema
export const themeSchema = z.object({
    bg: z.string().min(1).max(50),
    accent: z.string().min(1).max(50),
});

// Hub creation schema
export const createHubSchema = z.object({
    hub_id: z.string()
        .min(1, 'hub_id is required')
        .max(100, 'hub_id too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'hub_id can only contain alphanumeric, underscore, or hyphen'),
    slug: z.string()
        .min(1, 'slug is required')
        .max(100, 'slug too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'slug can only contain alphanumeric, underscore, or hyphen'),
    default_url: z.string().url('Invalid URL format'),
    theme: themeSchema,
});

// Hub update schema
export const updateHubSchema = z.object({
    slug: z.string()
        .min(1)
        .max(100)
        .regex(/^[a-zA-Z0-9_-]+$/)
        .optional(),
    default_url: z.string().url().optional(),
    theme: themeSchema.optional(),
});

// Time window schema
const recurringWindowSchema = z.object({
    days: z.array(z.number().min(0).max(6)).min(1),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    timezone: z.string().min(1),
});

const absoluteWindowSchema = z.object({
    start: z.string().datetime().or(z.date()),
    end: z.string().datetime().or(z.date()),
});

const timeWindowSchema = z.object({
    branch_id: z.string(),
    recurring: recurringWindowSchema.optional(),
    absolute: absoluteWindowSchema.optional(),
}).refine(
    (data) => data.recurring || data.absolute,
    'Either recurring or absolute window must be specified'
);

// GeoJSON polygon schema (limited to prevent abuse)
const geoPolygonSchema = z.object({
    type: z.literal('Polygon'),
    coordinates: z.array(
        z.array(z.array(z.number()).length(2))
            .min(4) // Minimum 4 points for a closed polygon
            .max(100) // Limit polygon complexity
    ).max(1), // Only outer ring supported
});

// Radius fallback schema
const radiusFallbackSchema = z.object({
    center: z.array(z.number()).length(2),
    radius_km: z.number().min(0.1).max(20000), // Max ~half Earth circumference
});

// Decision node schema (recursive)
const baseNodeSchema = z.object({
    type: z.enum(['device', 'location', 'time', 'leaf']),
    variant_ids: z.array(z.string()).optional(),
});

// Simplified decision node validation (deep validation is complex with recursion)
export const decisionNodeSchema: z.ZodType<any> = z.lazy(() =>
    z.object({
        type: z.enum(['device', 'location', 'time', 'leaf']),
        device_branches: z.record(z.string(), decisionNodeSchema).optional(),
        country_branches: z.record(z.string(), decisionNodeSchema).optional(),
        polygon_fallback: geoPolygonSchema.optional(),
        polygon_fallback_node: decisionNodeSchema.optional(),
        radius_fallback: radiusFallbackSchema.optional(),
        radius_fallback_node: decisionNodeSchema.optional(),
        location_default_node: decisionNodeSchema.optional(),
        time_windows: z.array(z.object({
            branch_id: z.string(),
            recurring: recurringWindowSchema.optional(),
            absolute: absoluteWindowSchema.optional(),
            next_node: decisionNodeSchema,
        })).optional(),
        time_default_node: decisionNodeSchema.optional(),
        variant_ids: z.array(z.string().max(100)).max(50).optional(),
    })
);

// Rule tree update schema
export const updateRuleTreeSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    root: decisionNodeSchema,
});

// Variant conditions schema
const variantConditionsSchema = z.object({
    device_types: z.array(z.string()).optional(),
    countries: z.array(z.string().length(2)).optional(), // ISO country codes
    time_windows: z.array(timeWindowSchema).optional(),
});

// Variant creation schema
export const createVariantSchema = z.object({
    variant_id: z.string()
        .min(1, 'variant_id is required')
        .max(100, 'variant_id too long')
        .regex(/^[a-zA-Z0-9_-]+$/, 'variant_id can only contain alphanumeric, underscore, or hyphen'),
    target_url: z.string().url('Invalid URL format'),
    priority: z.number().min(-1000).max(1000).default(0),
    weight: z.number().min(0).max(1000).default(1),
    enabled: z.boolean().default(true),
    conditions: variantConditionsSchema.default({}),
});

// Variant update schema
export const updateVariantSchema = z.object({
    target_url: z.string().url().optional(),
    priority: z.number().min(-1000).max(1000).optional(),
    weight: z.number().min(0).max(1000).optional(),
    enabled: z.boolean().optional(),
    conditions: variantConditionsSchema.optional(),
});

/**
 * Validation helper function
 */
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; error: string } {
    const result = schema.safeParse(data);

    if (result.success) {
        return { success: true, data: result.data };
    }

    const errorMessages = result.error.issues.map(
        (issue) => `${issue.path.join('.')}: ${issue.message}`
    ).join('; ');

    return { success: false, error: errorMessages };
}

/**
 * Express middleware for request body validation
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
    return (req: Express.Request & { body: unknown; validatedBody?: T }, res: any, next: () => void) => {
        const result = validate(schema, req.body);

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        (req as any).validatedBody = result.data;
        next();
    };
}
