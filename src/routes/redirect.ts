import { Router, Request, Response } from 'express';
import { LinkHub } from '../models/LinkHub';
import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';
import { decisionTreeEngine, IRequestContext, IVariantWithConditions } from '../services/DecisionTreeEngine';
import { eventLogger } from '../services/EventLogger';
import { analyticsEventService } from '../services/AnalyticsEventService';
import { analyticsAggregationService } from '../services/AnalyticsAggregationService';
import { AnalyticsEventType, SourceType } from '../models/AnalyticsEvent';
import { geoIPService } from '../services/GeoIPService';

const router = Router();

/**
 * Main hub endpoint - Returns JSON for Link Hub profile page
 * GET /:slug - Returns profile and filtered links (NOT a redirect)
 * 
 * Event logging:
 * - Logs a HUB_VIEW when the hub is loaded
 */
router.get('/:slug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        // Find the hub by slug
        const hub = await LinkHub.findOne({ slug }).lean();

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        // Build request context with async geolocation
        const country = await getCountryFromRequest(req);
        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country,
            lat: parseFloat(req.query.lat as string) || 0,
            lon: parseFloat(req.query.lon as string) || 0,
            timestamp: new Date(),
        };

        // Get all variants for this hub
        const variants = await Variant.find({
            hub_id: hub.hub_id,
            enabled: true
        }).lean();

        // Get stats for scoring
        const stats = await VariantStats.find({ hub_id: hub.hub_id }).lean();
        const statsMap = new Map(stats.map(s => [s.variant_id, s]));

        // Prepare variants with conditions and scores
        const variantsWithConditions: IVariantWithConditions[] = variants.map(v => {
            // Append tracking tokens to target_url
            const separator = v.target_url.includes('?') ? '&' : '?';
            const trackedUrl = `${v.target_url}${separator}hub_id=${hub.hub_id}&link_id=${v.variant_id}`;

            return {
                variant_id: v.variant_id,
                target_url: trackedUrl,
                title: v.title || v.variant_id,
                description: v.description,
                icon: v.icon,
                priority: v.priority,
                enabled: v.enabled,
                score: statsMap.get(v.variant_id)?.score || 0,
                conditions: v.conditions,
            };
        });

        // Filter variants based on context (device, location, time)
        const filteredLinks = decisionTreeEngine.filterVariants(context, variantsWithConditions);

        // Get device info for logging
        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        // Log HUB_VIEW event to Redis stream
        eventLogger.logHubView({
            hub_id: hub.hub_id,
            ip: getClientIP(req),
            country: context.country,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
        });

        // Log HUB_IMPRESSION to AnalyticsEvent collection (for analytics queries)
        const sessionId = req.cookies?.session_id || `session_${Date.now()}`;
        analyticsEventService.logHubImpression(
            hub.hub_id,
            sessionId,
            context.userAgent,
            req.headers.referer,
            getClientIP(req),
            SourceType.DIRECT
        );

        // Immediately update impressions for all filtered/visible links
        // This ensures impression counts are updated in real-time
        if (filteredLinks.length > 0) {
            try {
                const bulkOps = filteredLinks.map((link: { variant_id: string }) => ({
                    updateOne: {
                        filter: { variant_id: link.variant_id, hub_id: hub.hub_id },
                        update: {
                            $inc: { impressions: 1 },
                            $set: { last_updated: new Date() }
                        },
                        upsert: true
                    }
                }));
                await VariantStats.bulkWrite(bulkOps);

                // Update CTR for all affected variants
                for (const link of filteredLinks) {
                    const stats = await VariantStats.findOne({ variant_id: link.variant_id, hub_id: hub.hub_id });
                    if (stats && stats.impressions > 0) {
                        const ctr = stats.clicks / stats.impressions;
                        const score = (stats.clicks * 0.3) + (ctr * 100 * 0.7);
                        await VariantStats.updateOne(
                            { variant_id: link.variant_id, hub_id: hub.hub_id },
                            { $set: { ctr, score } }
                        );
                    }
                }
            } catch (statsError) {
                // Log but don't fail the request
                console.error('Impression stats update error (non-blocking):', statsError);
            }
        }



        // Return JSON response for the Link Hub page
        return res.json({
            profile: {
                hub_id: hub.hub_id,
                username: hub.username || hub.slug,
                avatar: hub.avatar || null,
                bio: hub.bio || '',
                slug: hub.slug,
                theme: hub.theme || { bg: '#000000', accent: '#00FF00' },
            },
            links: filteredLinks,
            context: {
                device: deviceInfo.type,
                country: context.country,
                timestamp: context.timestamp,
            },
        });
    } catch (error) {
        console.error('Hub load error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Context-Aware Redirect Endpoint
 * GET /:slug/go - Redirects to the best matching link based on context
 * 
 * Uses device, location, and time rules to determine the best link
 * and immediately redirects the user there.
 */
router.get('/:slug/go', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        // Find the hub by slug
        const hub = await LinkHub.findOne({ slug }).lean();

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        // Build request context from the actual request with async geolocation
        const country = await getCountryFromRequest(req);
        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country,
            lat: parseFloat(req.query.lat as string) || 0,
            lon: parseFloat(req.query.lon as string) || 0,
            timestamp: new Date(),
        };

        // Get all enabled variants for this hub
        const variants = await Variant.find({
            hub_id: hub.hub_id,
            enabled: true
        }).lean();

        if (variants.length === 0) {
            // No links configured - redirect to hub page
            return res.redirect(`/${slug}`);
        }

        // Get stats for scoring
        const stats = await VariantStats.find({ hub_id: hub.hub_id }).lean();
        const statsMap = new Map(stats.map(s => [s.variant_id, s]));

        // Prepare variants with conditions and scores
        const variantsWithConditions: IVariantWithConditions[] = variants.map(v => {
            return {
                variant_id: v.variant_id,
                target_url: v.target_url,
                title: v.title || v.variant_id,
                description: v.description,
                icon: v.icon,
                priority: v.priority,
                enabled: v.enabled,
                score: statsMap.get(v.variant_id)?.score || 0,
                conditions: v.conditions,
            };
        });

        // Filter variants based on context (device, location, time)
        const filteredLinks = decisionTreeEngine.filterVariants(context, variantsWithConditions);

        // Get device info for logging
        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        if (filteredLinks.length === 0) {
            // No matching links after filtering - use first available variant
            const fallback = variantsWithConditions[0];
            if (fallback) {
                // Log click event
                eventLogger.logClick({
                    hub_id: hub.hub_id,
                    ip: getClientIP(req),
                    country: context.country,
                    lat: context.lat,
                    lon: context.lon,
                    user_agent: context.userAgent,
                    device_type: deviceInfo.type,
                    timestamp: context.timestamp,
                    chosen_variant_id: fallback.variant_id,
                });

                return res.redirect(fallback.target_url);
            }
            // Truly no links - redirect to hub page
            return res.redirect(`/${slug}`);
        }

        // Select the best matching link (first one, as they're already sorted)
        const bestLink = filteredLinks[0];

        // Log HUB_VIEW event
        eventLogger.logHubView({
            hub_id: hub.hub_id,
            ip: getClientIP(req),
            country: context.country,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
        });

        // Log CLICK event for the auto-selected link
        eventLogger.logClick({
            hub_id: hub.hub_id,
            ip: getClientIP(req),
            country: context.country,
            lat: context.lat,
            lon: context.lon,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
            chosen_variant_id: bestLink.variant_id,
        });

        // Immediately update VariantStats for real-time analytics
        try {
            const stats = await VariantStats.findOneAndUpdate(
                { variant_id: bestLink.variant_id, hub_id: hub.hub_id },
                {
                    $inc: { clicks: 1, recent_clicks_hour: 1 },
                    $set: { last_updated: new Date() }
                },
                { upsert: true, new: true }
            );

            // Recalculate CTR and score
            if (stats) {
                const impressions = stats.impressions || 1;
                const ctr = stats.clicks / impressions;
                const score = (stats.clicks * 0.3) + (ctr * 100 * 0.7);
                
                await VariantStats.updateOne(
                    { variant_id: bestLink.variant_id, hub_id: hub.hub_id },
                    { $set: { ctr, score } }
                );
            }
        } catch (statsError) {
            console.error('VariantStats update error (non-blocking):', statsError);
        }

        // Redirect to the best matching link
        return res.redirect(bestLink.target_url);
    } catch (error) {
        console.error('Context redirect error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Click tracking endpoint
 * POST /api/analytics/click - Logs link click events
 * 
 * This endpoint immediately updates VariantStats in addition to async event logging
 * to ensure analytics are reflected in real-time.
 */
router.post('/api/analytics/click', async (req: Request, res: Response) => {
    try {
        const { hub_id, variant_id, visitor_context } = req.body;

        if (!hub_id || !variant_id) {
            return res.status(400).json({ error: 'hub_id and variant_id required' });
        }

        const context: IRequestContext = {
            userAgent: visitor_context?.userAgent || req.headers['user-agent'] || '',
            country: visitor_context?.country || extractCountry(req),
            lat: visitor_context?.lat || 0,
            lon: visitor_context?.lon || 0,
            timestamp: new Date(),
        };

        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);
        const sessionId = req.cookies?.session_id || `session_${Date.now()}`;
        const clientIP = getClientIP(req);

        // Log CLICK event to Redis stream (async, for background processing)
        eventLogger.logClick({
            hub_id,
            ip: clientIP,
            country: context.country,
            lat: context.lat,
            lon: context.lon,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
            chosen_variant_id: variant_id,
        });

        // Log LINK_CLICK to AnalyticsEvent collection (for analytics queries)
        // This is the critical call that updates the analytics dashboard
        analyticsEventService.logLinkClick(
            hub_id,
            variant_id,
            variant_id,
            sessionId,
            context.userAgent,
            req.headers.referer,
            clientIP,
            { source_type: SourceType.DIRECT }
        );

        // Immediately update VariantStats for real-time analytics
        // This ensures analytics are updated on every click without waiting for aggregation
        try {
            const stats = await VariantStats.findOneAndUpdate(
                { variant_id, hub_id },
                {
                    $inc: { clicks: 1, recent_clicks_hour: 1 },
                    $set: { last_updated: new Date() }
                },
                { upsert: true, new: true }
            );

            // Recalculate CTR and score
            if (stats) {
                const impressions = stats.impressions || 1; // Avoid division by zero
                const ctr = stats.clicks / impressions;
                // Simple score: weighted combination of clicks and CTR
                const score = (stats.clicks * 0.3) + (ctr * 100 * 0.7);
                
                await VariantStats.updateOne(
                    { variant_id, hub_id },
                    { $set: { ctr, score } }
                );
            }
        } catch (statsError) {
            // Log but don't fail the request - stats update is secondary
            console.error('VariantStats update error (non-blocking):', statsError);
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Click tracking error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Conversion Attribution Endpoint
 * POST /api/analytics/conversion
 */
router.post('/api/analytics/conversion', async (req: Request, res: Response) => {
    try {
        const { hub_id, link_id, event_type, revenue, metadata } = req.body;

        if (!hub_id) {
            return res.status(400).json({ error: 'hub_id required' });
        }

        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: 0,
            lon: 0,
            timestamp: new Date(),
        };

        await analyticsEventService.logEvent({
            event_type: AnalyticsEventType.CONVERSION,
            hub_id,
            link_id: link_id || undefined,
            variant_id: link_id || undefined, // link_id maps to variant_id
            session_id: 'external', // Conversion might come from webhook without session context
            user_agent: context.userAgent,
            ip_address: getClientIP(req),
            source_type: SourceType.OTHER,
            conversion_type: event_type || 'unknown',
            revenue: typeof revenue === 'number' ? revenue : 0,
            metadata: metadata || {}
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Conversion tracking error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Conversion Metrics Getter Endpoint
 * GET /api/analytics/hub/:hub_id/conversions
 */
router.get('/api/analytics/hub/:hub_id/conversions', async (req: Request, res: Response) => {
    try {
        const { hub_id } = req.params;
        const range = req.query.range as string || '7d';

        // Map range to TimeWindow enum
        let window = '7d';
        if (range === '24h') window = '24h';
        if (range === '1h') window = '1h';
        if (range === '30d') window = '30d';

        const metrics = await analyticsAggregationService.getConversionMetrics(hub_id, window as any);

        return res.json({ success: true, data: metrics });
    } catch (error) {
        console.error('Conversion metrics error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Referral Metrics Endpoint
 * GET /api/analytics/hub/:hub_id/referrals
 */
router.get('/api/analytics/hub/:hub_id/referrals', async (req: Request, res: Response) => {
    try {
        const { hub_id } = req.params;
        const range = req.query.range as string || '7d';

        // Map range to TimeWindow enum
        let window = '7d';
        if (range === '24h') window = '24h';
        if (range === '1h') window = '1h';
        if (range === '30d') window = '30d'; // Fallback to 7d in service if not mapped, but let's pass string

        const metrics = await analyticsAggregationService.getReferralMetrics(hub_id, window as any);

        return res.json({ success: true, data: metrics });
    } catch (error) {
        console.error('Referral metrics error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Engagement tracking endpoint
 * POST /api/analytics/engagement - Logs time & attention metrics
 */
router.post('/api/analytics/engagement', async (req: Request, res: Response) => {
    try {
        // Use JSON.parse for beacon data if content-type is text/plain (sendBeacon quirk)
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { }
        }

        const { hub_id, dwell_time, scroll_depth, engagement_score, session_id } = body;

        if (!hub_id) {
            return res.status(400).json({ error: 'hub_id required' });
        }

        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: 0,
            lon: 0,
            timestamp: new Date(),
        };

        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        // We use HUB_IMPRESSION type but with extra data to indicate end-of-session engagement
        // Or we could have a specific type. reusing HUB_IMPRESSION for now to keep it simple 
        // as "User spent time on Hub". Ideally we'd update the existing session but we are stateless here.

        await analyticsEventService.logEvent({
            event_type: AnalyticsEventType.HUB_IMPRESSION,
            hub_id,
            session_id: session_id || 'unknown', // Tracker should ideally send session_id
            user_agent: context.userAgent,
            ip_address: getClientIP(req),
            source_type: SourceType.DIRECT,
            dwell_time,
            scroll_depth,
            engagement_score
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Engagement tracking error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Rage Click tracking endpoint
 * POST /api/analytics/rage-click - Logs rapid click events indicating frustration
 */
router.post('/api/analytics/rage-click', async (req: Request, res: Response) => {
    try {
        // Use JSON.parse for beacon data if content-type is text/plain
        let body = req.body;
        if (typeof body === 'string') {
            try { body = JSON.parse(body); } catch { }
        }

        const { hub_id, variant_id, rage_click_count, element_selector, target_url, session_id } = body;

        if (!hub_id) {
            return res.status(400).json({ error: 'hub_id required' });
        }

        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: 0,
            lon: 0,
            timestamp: new Date(),
        };

        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        // Log RAGE_CLICK event
        await analyticsEventService.logEvent({
            event_type: AnalyticsEventType.RAGE_CLICK,
            hub_id,
            variant_id: variant_id || undefined,
            session_id: session_id || 'unknown',
            user_agent: context.userAgent,
            ip_address: getClientIP(req),
            source_type: SourceType.DIRECT,
            rage_click_count,
            element_selector,
            target_url
        });

        return res.json({ success: true });
    } catch (error) {
        console.error('Rage click tracking error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});


/**
 * Debug endpoint - returns resolution details
 * GET /:slug/debug
 */
router.get('/:slug/debug', async (req: Request, res: Response) => {
    try {
        const { slug } = req.params;

        const hub = await LinkHub.findOne({ slug }).lean();

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: parseFloat(req.query.lat as string) || 0,
            lon: parseFloat(req.query.lon as string) || 0,
            timestamp: new Date(),
        };

        const variants = await Variant.find({
            hub_id: hub.hub_id,
            enabled: true
        }).lean();

        const stats = await VariantStats.find({ hub_id: hub.hub_id }).lean();
        const statsMap = new Map(stats.map(s => [s.variant_id, s]));

        const variantsWithConditions: IVariantWithConditions[] = variants.map(v => ({
            variant_id: v.variant_id,
            target_url: v.target_url,
            title: v.title || v.variant_id,
            priority: v.priority,
            enabled: v.enabled,
            score: statsMap.get(v.variant_id)?.score || 0,
            conditions: v.conditions,
        }));

        const filteredLinks = decisionTreeEngine.filterVariants(context, variantsWithConditions);
        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        return res.json({
            hub: {
                hub_id: hub.hub_id,
                slug: hub.slug,
                username: hub.username,
            },
            context: {
                ...context,
                device: deviceInfo,
            },
            total_variants: variants.length,
            filtered_links: filteredLinks.length,
            links: filteredLinks,
            all_variants_debug: variantsWithConditions, // Added for debugging
        });
    } catch (error) {
        console.error('Debug error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Extract country from request headers, query params, or IP geolocation
 * Note: This function is async - use getCountryFromRequest for async IP lookup
 */
function extractCountrySync(req: Request): string | null {
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry) return cfCountry as string;

    const xCountry = req.headers['x-country'];
    if (xCountry) return xCountry as string;

    if (req.query.country) return req.query.country as string;

    return null; // Need async IP lookup
}

/**
 * Get country from request with IP-based geolocation fallback
 */
async function getCountryFromRequest(req: Request): Promise<string> {
    // Try sync methods first (headers, query params)
    const syncCountry = extractCountrySync(req);
    if (syncCountry) return syncCountry;

    // Fallback to IP geolocation
    const ip = getClientIP(req);
    const geoResult = await geoIPService.lookupIP(ip);
    
    if (geoResult) {
        return geoResult.countryCode;
    }

    return 'unknown';
}

// Legacy sync function for backwards compatibility
function extractCountry(req: Request): string {
    return extractCountrySync(req) || 'unknown';
}

/**
 * Get client IP address
 */
function getClientIP(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return (forwarded as string).split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}

export default router;
