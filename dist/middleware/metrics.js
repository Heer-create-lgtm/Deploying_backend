"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.register = exports.variantSelections = exports.errorTotal = exports.statsAggregationDuration = exports.eventsProcessed = exports.eventStreamLength = exports.cacheHitRatio = exports.cacheMisses = exports.cacheHits = exports.redirectTotal = exports.redirectLatency = exports.httpRequestTotal = exports.httpRequestDuration = void 0;
exports.metricsMiddleware = metricsMiddleware;
exports.metricsHandler = metricsHandler;
exports.recordCacheAccess = recordCacheAccess;
exports.recordRedirect = recordRedirect;
const prom_client_1 = __importDefault(require("prom-client"));
/**
 * Prometheus Metrics for Observability
 * Provides metrics for latency, errors, cache, and queue monitoring
 */
// Create a Registry
const register = new prom_client_1.default.Registry();
exports.register = register;
// Add default metrics (CPU, memory, etc.)
prom_client_1.default.collectDefaultMetrics({ register });
// ============== REQUEST METRICS ==============
// HTTP request duration histogram
exports.httpRequestDuration = new prom_client_1.default.Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
});
register.registerMetric(exports.httpRequestDuration);
// HTTP request counter
exports.httpRequestTotal = new prom_client_1.default.Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
});
register.registerMetric(exports.httpRequestTotal);
// ============== REDIRECT METRICS ==============
// Redirect latency histogram
exports.redirectLatency = new prom_client_1.default.Histogram({
    name: 'redirect_latency_seconds',
    help: 'Latency of redirect resolution',
    labelNames: ['hub_id', 'variant_id'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
});
register.registerMetric(exports.redirectLatency);
// Redirect counter
exports.redirectTotal = new prom_client_1.default.Counter({
    name: 'redirects_total',
    help: 'Total number of redirects',
    labelNames: ['hub_id', 'variant_id', 'device_type', 'country'],
});
register.registerMetric(exports.redirectTotal);
// ============== CACHE METRICS ==============
// Cache hit/miss counter
exports.cacheHits = new prom_client_1.default.Counter({
    name: 'cache_hits_total',
    help: 'Total cache hits',
    labelNames: ['cache_type'],
});
register.registerMetric(exports.cacheHits);
exports.cacheMisses = new prom_client_1.default.Counter({
    name: 'cache_misses_total',
    help: 'Total cache misses',
    labelNames: ['cache_type'],
});
register.registerMetric(exports.cacheMisses);
// Cache hit ratio gauge (updated periodically)
exports.cacheHitRatio = new prom_client_1.default.Gauge({
    name: 'cache_hit_ratio',
    help: 'Cache hit ratio (hits / total)',
    labelNames: ['cache_type'],
});
register.registerMetric(exports.cacheHitRatio);
// ============== QUEUE METRICS ==============
// Event stream length gauge
exports.eventStreamLength = new prom_client_1.default.Gauge({
    name: 'event_stream_length',
    help: 'Number of unprocessed events in the stream',
});
register.registerMetric(exports.eventStreamLength);
// Events processed counter
exports.eventsProcessed = new prom_client_1.default.Counter({
    name: 'events_processed_total',
    help: 'Total events processed by worker',
});
register.registerMetric(exports.eventsProcessed);
// Stats aggregation duration
exports.statsAggregationDuration = new prom_client_1.default.Histogram({
    name: 'stats_aggregation_duration_seconds',
    help: 'Duration of stats aggregation job',
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60],
});
register.registerMetric(exports.statsAggregationDuration);
// ============== ERROR METRICS ==============
// Error counter
exports.errorTotal = new prom_client_1.default.Counter({
    name: 'errors_total',
    help: 'Total errors',
    labelNames: ['type', 'route'],
});
register.registerMetric(exports.errorTotal);
// ============== VARIANT METRICS ==============
// Variant selection counter
exports.variantSelections = new prom_client_1.default.Counter({
    name: 'variant_selections_total',
    help: 'Total variant selections',
    labelNames: ['hub_id', 'variant_id'],
});
register.registerMetric(exports.variantSelections);
// ============== MIDDLEWARE ==============
/**
 * Express middleware to track request metrics
 */
function metricsMiddleware(req, res, next) {
    const start = Date.now();
    res.on('finish', () => {
        const duration = (Date.now() - start) / 1000;
        const route = req.route?.path || req.path || 'unknown';
        const labels = {
            method: req.method,
            route,
            status_code: res.statusCode.toString(),
        };
        exports.httpRequestDuration.observe(labels, duration);
        exports.httpRequestTotal.inc(labels);
    });
    next();
}
/**
 * Metrics endpoint handler
 */
async function metricsHandler(_req, res) {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    }
    catch (error) {
        res.status(500).end('Error collecting metrics');
    }
}
/**
 * Helper to update cache metrics
 */
function recordCacheAccess(type, hit) {
    if (hit) {
        exports.cacheHits.inc({ cache_type: type });
    }
    else {
        exports.cacheMisses.inc({ cache_type: type });
    }
}
/**
 * Helper to record redirect
 */
function recordRedirect(hubId, variantId, deviceType, country, durationSeconds) {
    exports.redirectLatency.observe({ hub_id: hubId, variant_id: variantId }, durationSeconds);
    exports.redirectTotal.inc({ hub_id: hubId, variant_id: variantId, device_type: deviceType, country });
    exports.variantSelections.inc({ hub_id: hubId, variant_id: variantId });
}
//# sourceMappingURL=metrics.js.map