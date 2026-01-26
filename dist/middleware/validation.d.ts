import { z } from 'zod';
/**
 * Input Validation Schemas using Zod
 * Provides strict schema validation for all admin API inputs
 */
export declare const themeSchema: z.ZodObject<{
    bg: z.ZodString;
    accent: z.ZodString;
}, z.core.$strip>;
export declare const createHubSchema: z.ZodObject<{
    hub_id: z.ZodString;
    slug: z.ZodString;
    default_url: z.ZodString;
    theme: z.ZodObject<{
        bg: z.ZodString;
        accent: z.ZodString;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const updateHubSchema: z.ZodObject<{
    slug: z.ZodOptional<z.ZodString>;
    default_url: z.ZodOptional<z.ZodString>;
    theme: z.ZodOptional<z.ZodObject<{
        bg: z.ZodString;
        accent: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const decisionNodeSchema: z.ZodType<any>;
export declare const updateRuleTreeSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    root: z.ZodType<any, unknown, z.core.$ZodTypeInternals<any, unknown>>;
}, z.core.$strip>;
export declare const createVariantSchema: z.ZodObject<{
    variant_id: z.ZodString;
    target_url: z.ZodString;
    priority: z.ZodDefault<z.ZodNumber>;
    weight: z.ZodDefault<z.ZodNumber>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    conditions: z.ZodDefault<z.ZodObject<{
        device_types: z.ZodOptional<z.ZodArray<z.ZodString>>;
        countries: z.ZodOptional<z.ZodArray<z.ZodString>>;
        time_windows: z.ZodOptional<z.ZodArray<z.ZodObject<{
            branch_id: z.ZodString;
            recurring: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodNumber>;
                start_time: z.ZodString;
                end_time: z.ZodString;
                timezone: z.ZodString;
            }, z.core.$strip>>;
            absolute: z.ZodOptional<z.ZodObject<{
                start: z.ZodUnion<[z.ZodString, z.ZodDate]>;
                end: z.ZodUnion<[z.ZodString, z.ZodDate]>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const updateVariantSchema: z.ZodObject<{
    target_url: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodNumber>;
    weight: z.ZodOptional<z.ZodNumber>;
    enabled: z.ZodOptional<z.ZodBoolean>;
    conditions: z.ZodOptional<z.ZodObject<{
        device_types: z.ZodOptional<z.ZodArray<z.ZodString>>;
        countries: z.ZodOptional<z.ZodArray<z.ZodString>>;
        time_windows: z.ZodOptional<z.ZodArray<z.ZodObject<{
            branch_id: z.ZodString;
            recurring: z.ZodOptional<z.ZodObject<{
                days: z.ZodArray<z.ZodNumber>;
                start_time: z.ZodString;
                end_time: z.ZodString;
                timezone: z.ZodString;
            }, z.core.$strip>>;
            absolute: z.ZodOptional<z.ZodObject<{
                start: z.ZodUnion<[z.ZodString, z.ZodDate]>;
                end: z.ZodUnion<[z.ZodString, z.ZodDate]>;
            }, z.core.$strip>>;
        }, z.core.$strip>>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
/**
 * Validation helper function
 */
export declare function validate<T>(schema: z.ZodSchema<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
};
/**
 * Express middleware for request body validation
 */
export declare function validateBody<T>(schema: z.ZodSchema<T>): (req: Express.Request & {
    body: unknown;
    validatedBody?: T;
}, res: any, next: () => void) => any;
//# sourceMappingURL=validation.d.ts.map