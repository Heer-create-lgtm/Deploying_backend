"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const database_1 = require("./config/database");
const routes_1 = require("./routes");
const middleware_1 = require("./middleware");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3000;
// Middleware
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '1mb' })); // Limit payload size
app.use(middleware_1.metricsMiddleware);
// Trust proxy for getting real IP addresses
app.set('trust proxy', true);
// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});
// Metrics endpoint (Prometheus format)
app.get('/metrics', middleware_1.metricsHandler);
// Auth routes (login, register) - no rate limit on register, login has its own
app.use('/api/auth', routes_1.authRoutes);
// Admin routes with rate limiting (requires authentication)
app.use('/api/admin', middleware_1.adminLimiter, routes_1.adminRoutes);
// Analytics routes (requires authentication)
app.use('/api/analytics', middleware_1.adminLimiter, routes_1.analyticsRoutes);
// Export routes (requires authentication)
app.use('/api/export', middleware_1.adminLimiter, routes_1.exportRoutes);
// Short URL routes (public - /r/:code for truly short URLs)
app.use('/r', middleware_1.redirectLimiter, routes_1.shorturlRoutes);
// Redirect routes with rate limiting (public - at root level for slug-based URLs)
app.use('/', middleware_1.redirectLimiter, routes_1.redirectRoutes);
// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handling
app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});
// Import migration function
const LinkHub_1 = require("./models/LinkHub");
// Start server
async function start() {
    try {
        // Connect to MongoDB
        await (0, database_1.connectMongoDB)();
        // Run migrations for short_code
        try {
            const migrated = await (0, LinkHub_1.migrateShortCodes)();
            if (migrated > 0) {
                console.log(`✓ Migrated ${migrated} hubs with short_code`);
            }
        }
        catch (migrationError) {
            console.warn('Warning: Short code migration error:', migrationError);
        }
        // Start Express server
        app.listen(PORT, () => {
            console.log(`\n✓ Server running on http://localhost:${PORT}`);
            console.log(`\nPublic Endpoints:`);
            console.log(`  GET  /health         - Health check`);
            console.log(`  GET  /metrics        - Prometheus metrics`);
            console.log(`  GET  /:slug          - Redirect to resolved URL`);
            console.log(`  GET  /:slug/debug    - Debug resolution without redirect`);
            console.log(`  GET  /r/:code        - Short URL redirect (6-char Base62)`);
            console.log(`\nAuth Endpoints:`);
            console.log(`  POST /api/auth/register - Create account`);
            console.log(`  POST /api/auth/login    - Login & get JWT`);
            console.log(`  GET  /api/auth/me       - Get current user`);
            console.log(`\nAdmin Endpoints (auth required):`);
            console.log(`  GET  /api/admin/hubs               - List your hubs`);
            console.log(`  POST /api/admin/hubs               - Create hub`);
            console.log(`  GET  /api/admin/hubs/:hub_id       - Get hub`);
            console.log(`  GET  /api/admin/hubs/:hub_id/stats - Analytics`);
            console.log(`\nAnalytics Endpoints (auth required):`);
            console.log(`  GET  /api/analytics/...            - Enhanced analytics`);
            console.log(`\nExport Endpoints (auth required):`);
            console.log(`  GET  /api/export/...               - Data export`);
            console.log(`\nRate limits:`);
            console.log(`  - Redirect: 200 req/min per IP`);
            console.log(`  - Admin:    100 req/min per IP`);
            console.log(`  - Login:    5 attempts/15min per IP`);
        });
        // Graceful shutdown
        const shutdown = async () => {
            console.log('\nShutting down server...');
            await (0, database_1.closeConnections)();
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
    catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}
start();
exports.default = app;
//# sourceMappingURL=index.js.map