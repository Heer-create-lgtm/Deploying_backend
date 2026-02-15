import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { connectMongoDB, ensureMongoConnection, closeConnections } from './config/database';
import { redirectRoutes, adminRoutes, authRoutes, analyticsRoutes, shorturlRoutes, exportRoutes } from './routes';
import {
    redirectLimiter,
    adminLimiter,
    metricsMiddleware,
    metricsHandler
} from './middleware';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(metricsMiddleware);

// Trust proxy for getting real IP addresses
app.set('trust proxy', true);

// Ensure MongoDB is connected for every request (serverless-safe)
app.use(async (_req, _res, next) => {
    await ensureMongoConnection();
    next();
});

// Health check
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

// Keep-alive endpoint — prevents Vercel cold starts
// Called by: Vercel cron (every 10 min) + frontend KeepAlive component (every 5 min)
app.get('/api/keep-alive', async (_req, res) => {
    try {
        await ensureMongoConnection();
        res.json({
            status: 'warm',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            mongodb: 'connected',
        });
    } catch (error) {
        res.status(500).json({ status: 'cold', error: 'Failed to warm up' });
    }
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', metricsHandler);

// Auth routes (login, register) - no rate limit on register, login has its own
app.use('/api/auth', authRoutes);

// Admin routes with rate limiting (requires authentication)
app.use('/api/admin', adminLimiter, adminRoutes);

// Analytics routes (requires authentication)
app.use('/api/analytics', adminLimiter, analyticsRoutes);

// Export routes (requires authentication)
app.use('/api/export', adminLimiter, exportRoutes);

// Short URL routes (public - /r/:code for truly short URLs)
app.use('/r', redirectLimiter, shorturlRoutes);

// Redirect routes with rate limiting (public - at root level for slug-based URLs)
app.use('/', redirectLimiter, redirectRoutes);

// 404 handler
app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handling
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Import migration function
import { migrateShortCodes } from './models/LinkHub';

// Start server (only when running locally, not in Vercel serverless)
const isVercel = process.env.VERCEL === '1';

if (!isVercel) {
    async function start(): Promise<void> {
        try {
            // Connect to MongoDB
            await connectMongoDB();

            // Run migrations for short_code
            try {
                const migrated = await migrateShortCodes();
                if (migrated > 0) {
                    console.log(`✓ Migrated ${migrated} hubs with short_code`);
                }
            } catch (migrationError) {
                console.warn('Warning: Short code migration error:', migrationError);
            }

            // Start Express server
            app.listen(PORT, () => {
                console.log(`\n✓ Server running on http://localhost:${PORT}`);
                console.log(`  GET  /health         - Health check`);
                console.log(`  POST /api/auth/login - Login & get JWT`);
                console.log(`  GET  /api/admin/hubs - List your hubs`);
            });

            // Graceful shutdown
            const shutdown = async () => {
                console.log('\nShutting down server...');
                await closeConnections();
                process.exit(0);
            };

            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
        } catch (error) {
            console.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    start();
}

export default app;
