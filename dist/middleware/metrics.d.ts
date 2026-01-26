import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';
/**
 * Prometheus Metrics for Observability
 * Provides metrics for latency, errors, cache, and queue monitoring
 */
declare const register: client.Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const httpRequestDuration: client.Histogram<"method" | "route" | "status_code">;
export declare const httpRequestTotal: client.Counter<"method" | "route" | "status_code">;
export declare const redirectLatency: client.Histogram<"hub_id" | "variant_id">;
export declare const redirectTotal: client.Counter<"hub_id" | "variant_id" | "country" | "device_type">;
export declare const cacheHits: client.Counter<"cache_type">;
export declare const cacheMisses: client.Counter<"cache_type">;
export declare const cacheHitRatio: client.Gauge<"cache_type">;
export declare const eventStreamLength: client.Gauge<string>;
export declare const eventsProcessed: client.Counter<string>;
export declare const statsAggregationDuration: client.Histogram<string>;
export declare const errorTotal: client.Counter<"type" | "route">;
export declare const variantSelections: client.Counter<"hub_id" | "variant_id">;
/**
 * Express middleware to track request metrics
 */
export declare function metricsMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Metrics endpoint handler
 */
export declare function metricsHandler(_req: Request, res: Response): Promise<void>;
export { register };
/**
 * Helper to update cache metrics
 */
export declare function recordCacheAccess(type: string, hit: boolean): void;
/**
 * Helper to record redirect
 */
export declare function recordRedirect(hubId: string, variantId: string, deviceType: string, country: string, durationSeconds: number): void;
//# sourceMappingURL=metrics.d.ts.map