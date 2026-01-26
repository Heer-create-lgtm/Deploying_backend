import { Router, Request, Response } from 'express';
import { LinkHub } from '../models/LinkHub';
import { decisionTreeEngine, IRequestContext } from '../services/DecisionTreeEngine';
import { variantResolver } from '../services/VariantResolver';
import { cacheService } from '../services/CacheService';
import { eventLogger } from '../services/EventLogger';
import { analyticsEventService } from '../services/AnalyticsEventService';
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

        // Build request context
        const context: IRequestContext = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: parseFloat(req.query.lat as string) || 0,
            lon: parseFloat(req.query.lon as string) || 0,
            timestamp: new Date(),
        };

        // Get the rule tree (cached)
        const ruleTree = await cacheService.getRuleTree(hub.hub_id);

        let targetUrl = hub.default_url;
        let chosenVariantId = 'default';

        if (ruleTree) {
            const variantIds = decisionTreeEngine.traverse(context, ruleTree.root);

            if (variantIds && variantIds.length > 0) {
                const variant = await variantResolver.resolveVariant(variantIds, hub.hub_id);

                if (variant) {
                    targetUrl = variant.target_url;
                    chosenVariantId = variant.variant_id;
                }
            }
        }

        // Get device info for logging
        const deviceInfo = decisionTreeEngine.parseDevice(context.userAgent);

        // Generate session ID
        const sessionId = req.cookies?.session_id || uuidv4();

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
            chosen_variant_id: chosenVariantId,
        };

        // Log to legacy eventLogger
        eventLogger.logImpression(eventContext);
        eventLogger.logClick(eventContext);

        // Log to analyticsEventService (MongoDB for Analysis Page)
        analyticsEventService.logHubImpression(
            hub.hub_id,
            sessionId,
            context.userAgent,
            req.headers.referer,
            getClientIP(req)
        );
        analyticsEventService.logLinkClick(
            hub.hub_id,
            chosenVariantId,
            chosenVariantId,
            sessionId,
            context.userAgent,
            req.headers.referer,
            getClientIP(req)
        );
        analyticsEventService.logRedirect(
            hub.hub_id,
            chosenVariantId,
            sessionId,
            context.userAgent,
            targetUrl,
            getClientIP(req)
        );

        // Redirect to the target URL
        return res.redirect(302, targetUrl);
    } catch (error) {
        console.error('Short URL redirect error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * Extract country from request headers
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
