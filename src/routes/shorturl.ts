import { Router, Request, Response } from 'express';
import { LinkHub } from '../models/LinkHub';
import { decisionTreeEngine, IRequestContext } from '../services/DecisionTreeEngine';
import { variantResolver } from '../services/VariantResolver';
import { cacheService } from '../services/CacheService';
import { eventLogger } from '../services/EventLogger';
import { analyticsEventService } from '../services/AnalyticsEventService';
import { geoIPService } from '../services/GeoIPService';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * GET /s/:code - Short URL redirect
 * Resolves short code to hub and redirects
 * Logs analytics events same as regular redirect
 */
router.get('/:code', async (req: Request, res: Response) => {
    try {
        const { code } = req.params;

        // Find hub by short_code
        const hub = await LinkHub.findOne({ short_code: code }).lean();

        if (!hub) {
            return res.status(404).json({ error: 'Short URL not found' });
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

        // Redirect to Hub Profile Page (Frontend)
        // User requested that /r/:code should open the Full URL (Hub Profile)
        // rather than the smart redirect target.
        const hubProfileUrl = `/${hub.slug}`;

        // Generate session ID
        const sessionId = req.cookies?.session_id || uuidv4();

        // Get device info for logging
        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        // Create base event context
        const eventContext = {
            hub_id: hub.hub_id,
            ip: getClientIP(req),
            country: context.country,
            lat: context.lat,
            lon: context.lon,
            user_agent: context.userAgent,
            device_type: deviceInfo.type,
            timestamp: context.timestamp,
            chosen_variant_id: 'hub_profile',
        };

        // Log to legacy eventLogger
        eventLogger.logImpression(eventContext);
        eventLogger.logClick(eventContext);

        // Log to analyticsEventService
        analyticsEventService.logHubImpression(
            hub.hub_id,
            sessionId,
            context.userAgent,
            req.headers.referer,
            getClientIP(req)
        );
        analyticsEventService.logRedirect(
            hub.hub_id,
            'hub_profile', // explicit variant
            sessionId,
            context.userAgent,
            hubProfileUrl,
            getClientIP(req)
        );

        // Redirect to the Hub Profile
        return res.redirect(302, hubProfileUrl);
    } catch (error) {
        console.error('Short URL redirect error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Get country from request with IP-based geolocation fallback
 */
async function getCountryFromRequest(req: Request): Promise<string> {
    // Try headers first (Cloudflare, custom)
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry) return cfCountry as string;

    const xCountry = req.headers['x-country'];
    if (xCountry) return xCountry as string;

    if (req.query.country) return req.query.country as string;

    // Fallback to IP geolocation
    const ip = getClientIP(req);
    const geoResult = await geoIPService.lookupIP(ip);
    return geoResult?.countryCode || 'unknown';
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
