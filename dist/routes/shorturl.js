"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const LinkHub_1 = require("../models/LinkHub");
const DecisionTreeEngine_1 = require("../services/DecisionTreeEngine");
const VariantResolver_1 = require("../services/VariantResolver");
const CacheService_1 = require("../services/CacheService");
const EventLogger_1 = require("../services/EventLogger");
const AnalyticsEventService_1 = require("../services/AnalyticsEventService");
const uuid_1 = require("uuid");
const router = (0, express_1.Router)();
/**
 * GET /s/:code - Short URL redirect
 * Resolves short code to hub and redirects
 * Logs analytics events same as regular redirect
 */
router.get('/:code', async (req, res) => {
    try {
        const { code } = req.params;
        // Find hub by short_code
        const hub = await LinkHub_1.LinkHub.findOne({ short_code: code }).lean();
        if (!hub) {
            return res.status(404).json({ error: 'Short URL not found' });
        }
        // Build request context
        const context = {
            userAgent: req.headers['user-agent'] || '',
            country: extractCountry(req),
            lat: parseFloat(req.query.lat) || 0,
            lon: parseFloat(req.query.lon) || 0,
            timestamp: new Date(),
        };
        // Get the rule tree (cached)
        const ruleTree = await CacheService_1.cacheService.getRuleTree(hub.hub_id);
        let targetUrl = hub.default_url;
        let chosenVariantId = 'default';
        if (ruleTree) {
            const variantIds = DecisionTreeEngine_1.decisionTreeEngine.traverse(context, ruleTree.root);
            if (variantIds && variantIds.length > 0) {
                const variant = await VariantResolver_1.variantResolver.resolveVariant(variantIds, hub.hub_id);
                if (variant) {
                    targetUrl = variant.target_url;
                    chosenVariantId = variant.variant_id;
                }
            }
        }
        // Get device info for logging
        const deviceInfo = DecisionTreeEngine_1.decisionTreeEngine.parseDevice(context.userAgent);
        // Generate session ID
        const sessionId = req.cookies?.session_id || (0, uuid_1.v4)();
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
        EventLogger_1.eventLogger.logImpression(eventContext);
        EventLogger_1.eventLogger.logClick(eventContext);
        // Log to analyticsEventService (MongoDB for Analysis Page)
        AnalyticsEventService_1.analyticsEventService.logHubImpression(hub.hub_id, sessionId, context.userAgent, req.headers.referer, getClientIP(req));
        AnalyticsEventService_1.analyticsEventService.logLinkClick(hub.hub_id, chosenVariantId, chosenVariantId, sessionId, context.userAgent, req.headers.referer, getClientIP(req));
        AnalyticsEventService_1.analyticsEventService.logRedirect(hub.hub_id, chosenVariantId, sessionId, context.userAgent, targetUrl, getClientIP(req));
        // Redirect to the target URL
        return res.redirect(302, targetUrl);
    }
    catch (error) {
        console.error('Short URL redirect error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
});
/**
 * Extract country from request headers
 */
function extractCountry(req) {
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry)
        return cfCountry;
    const xCountry = req.headers['x-country'];
    if (xCountry)
        return xCountry;
    if (req.query.country)
        return req.query.country;
    return 'unknown';
}
/**
 * Get client IP address
 */
function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket.remoteAddress || 'unknown';
}
exports.default = router;
//# sourceMappingURL=shorturl.js.map