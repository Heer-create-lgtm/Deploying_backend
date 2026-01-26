import { Router, Request, Response } from 'express';
import { LinkHub } from '../models/LinkHub';
import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';
import { decisionTreeEngine, IRequestContext, IVariantWithConditions } from '../services/DecisionTreeEngine';
import { eventLogger } from '../services/EventLogger';
import { analyticsEventService } from '../services/AnalyticsEventService';
import { analyticsAggregationService } from '../services/AnalyticsAggregationService';
import { AnalyticsEventType, SourceType } from '../models/AnalyticsEvent';

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

        // Build request context
        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
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

        // Log HUB_VIEW event
        eventLogger.logHubView({
            hub_id: hub.hub_id,
            ip: getClientIP(req),
            country: context.country,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
        });

        // Return JSON response for the Link Hub page
        return res.json({
            profile: {
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

        // Build request context from the actual request
        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
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

        // Log CLICK event
        eventLogger.logClick({
            hub_id,
            ip: getClientIP(req),
            country: context.country,
            lat: context.lat,
            lon: context.lon,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
            chosen_variant_id: variant_id,
        });

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
        });
    } catch (error) {
        console.error('Debug error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Extract country from request headers or query params
 */
function extractCountry(req: Request): string {
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry) return cfCountry as string;

    const xCountry = req.headers['x-country'];
    if (xCountry) return xCountry as string;

    if (req.query.country) return req.query.country as string;

    return 'unknown';
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
