import { Request, Response, NextFunction } from 'express';
import client from 'prom-client';

/**
 * Prometheus Metrics for Observability
 * Provides metrics for latency, errors, cache, and queue monitoring
 */

// Create a Registry
const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({ register });

// ============== REQUEST METRICS ==============

// HTTP request duration histogram
export const httpRequestDuration = new client.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
register.registerMetric(httpRequestDuration);

// HTTP request counter
export const httpRequestTotal = new client.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(httpRequestTotal);

// ============== REDIRECT METRICS ==============

// Redirect latency histogram
export const redirectLatency = new client.Histogram({
    name: 'redirect_latency_seconds',
    help: 'Latency of redirect resolution',
    labelNames: ['hub_id', 'variant_id'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});
register.registerMetric(redirectLatency);

// Redirect counter
export const redirectTotal = new client.Counter({
    name: 'redirects_total',
    help: 'Total number of redirects',
    labelNames: ['hub_id', 'variant_id', 'device_type', 'country'],
});
register.registerMetric(redirectTotal);

// ============== CACHE METRICS ==============

// Cache hit/miss counter
export const cacheHits = new client.Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_type'],
});
register.registerMetric(cacheHits);

export const cacheMisses = new client.Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_type'],
});
register.registerMetric(cacheMisses);

// Cache hit ratio gauge (updated periodically)
export const cacheHitRatio = new client.Gauge({
    name: 'cache_hit_ratio',
    help: 'Cache hit ratio (hits / total)',
    labelNames: ['cache_type'],
});
register.registerMetric(cacheHitRatio);

// ============== QUEUE METRICS ==============

// Event stream length gauge
export const eventStreamLength = new client.Gauge({
    name: 'event_stream_length',
    help: 'Number of unprocessed events in the stream',
});
register.registerMetric(eventStreamLength);

// Events processed counter
export const eventsProcessed = new client.Counter({
    name: 'events_processed_total',
    help: 'Total events processed by worker',
});
register.registerMetric(eventsProcessed);

// Stats aggregation duration
export const statsAggregationDuration = new client.Histogram({
    name: 'stats_aggregation_duration_seconds',
    help: 'Duration of stats aggregation job',
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});
register.registerMetric(statsAggregationDuration);

// ============== ERROR METRICS ==============

// Error counter
export const errorTotal = new client.Counter({
    name: 'errors_total',
    help: 'Total errors',
    labelNames: ['type', 'route'],
});
register.registerMetric(errorTotal);

// ============== VARIANT METRICS ==============

// Variant selection counter
export const variantSelections = new client.Counter({
    name: 'variant_selections_total',
    help: 'Total variant selections',
    labelNames: ['hub_id', 'variant_id'],
});
register.registerMetric(variantSelections);

// ============== MIDDLEWARE ==============

/**
 * Express middleware to track request metrics
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();

    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path || 'unknown';
        const labels = {
            method: req.method,
            route,
            status_code: res.statusCode.toString(),
        };

        httpRequestDuration.observe(labels, duration);
        httpRequestTotal.inc(labels);
    });

    next();
}

/**
 * Metrics endpoint handler
 */
export async function metricsHandler(_req: Request, res: Response): Promise<void> {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (error) {
        res.status(500).end('Error collecting metrics');
    }
}

// Export the registry for custom operations
export { register };

/**
 * Helper to update cache metrics
 */
export function recordCacheAccess(type: string, hit: boolean): void {
    if (hit) {
        cacheHits.inc({ cache_type: type });
    } else {
        cacheMisses.inc({ cache_type: type });
    }
}

/**
 * Helper to record redirect
 */
export function recordRedirect(hubId: string, variantId: string, deviceType: string, country: string, durationSeconds: number): void {
    redirectLatency.observe({ hub_id: hubId, variant_id: variantId }, durationSeconds);
    redirectTotal.inc({ hub_id: hubId, variant_id: variantId, device_type: deviceType, country });
    variantSelections.inc({ hub_id: hubId, variant_id: variantId });
}
