"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const LinkHub_1 = require("../models/LinkHub");
const RuleTree_1 = require("../models/RuleTree");
const Variant_1 = require("../models/Variant");
const VariantStats_1 = require("../models/VariantStats");
const CacheService_1 = require("../services/CacheService");
const StatsAggregator_1 = require("../workers/StatsAggregator");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// ============== HUB MANAGEMENT ==============
/**
 * Create a new hub
 * POST /hubs
 * Requires authentication - assigns owner_user_id
 */
router.post('/hubs', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        const { hub_id, slug, default_url, theme } = req.body;
        // Validate required fields
        if (!hub_id || !slug || !default_url || !theme) {
            return res.status(400).json({
                error: 'Missing required fields: hub_id, slug, default_url, theme'
            });
        }
        // Check for duplicates
        const existing = await LinkHub_1.LinkHub.findOne({
            $or: [{ hub_id }, { slug }]
        });
        if (existing) {
            return res.status(409).json({ error: 'Hub with this ID or slug already exists' });
        }
        // Create hub with owner
        const hub = await LinkHub_1.LinkHub.create({
            hub_id,
            slug,
            default_url,
            theme,
            owner_user_id: req.user?.user_id,
        });
        return res.status(201).json(hub);
    }
    catch (error) {
        console.error('Create hub error:', error);
        return res.status(500).json({ error: 'Failed to create hub' });
    }
});
/**
 * Get a hub by ID
 * GET /hubs/:hub_id
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const hub = await LinkHub_1.LinkHub.findOne({ hub_id: req.params.hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        return res.json(hub);
    }
    catch (error) {
        console.error('Get hub error:', error);
        return res.status(500).json({ error: 'Failed to get hub' });
    }
});
/**
 * List all hubs owned by the current user
 * GET /hubs
 * Requires authentication - admins see all, users see only their own
 */
router.get('/hubs', authMiddleware_1.requireAuth, async (req, res) => {
    try {
        let query = {};
        // Non-admins only see their own hubs
        if (req.user?.role !== 'admin') {
            query = { owner_user_id: req.user?.user_id };
        }
        const hubs = await LinkHub_1.LinkHub.find(query)
            .sort({ created_at: -1 })
            .lean();
        return res.json(hubs);
    }
    catch (error) {
        console.error('List hubs error:', error);
        return res.status(500).json({ error: 'Failed to list hubs' });
    }
});
/**
 * Update a hub
 * PUT /hubs/:hub_id
 * Requires authentication and ownership
 */
router.put('/hubs/:hub_id', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const { slug, default_url, theme } = req.body;
        const hub = await LinkHub_1.LinkHub.findOneAndUpdate({ hub_id: req.params.hub_id }, { $set: { slug, default_url, theme } }, { new: true });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        return res.json(hub);
    }
    catch (error) {
        console.error('Update hub error:', error);
        return res.status(500).json({ error: 'Failed to update hub' });
    }
});
/**
 * Delete a hub
 * DELETE /hubs/:hub_id
 * Requires authentication and ownership
 */
router.delete('/hubs/:hub_id', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const hub = await LinkHub_1.LinkHub.findOneAndDelete({ hub_id: req.params.hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        // Also delete associated data
        await RuleTree_1.RuleTree.deleteMany({ hub_id: req.params.hub_id });
        await Variant_1.Variant.deleteMany({ hub_id: req.params.hub_id });
        await VariantStats_1.VariantStats.deleteMany({ hub_id: req.params.hub_id });
        // Invalidate cache
        await CacheService_1.cacheService.invalidateRuleTree(req.params.hub_id);
        return res.json({ message: 'Hub deleted successfully' });
    }
    catch (error) {
        console.error('Delete hub error:', error);
        return res.status(500).json({ error: 'Failed to delete hub' });
    }
});
// ============== RULE TREE MANAGEMENT ==============
/**
 * Create or update a rule tree for a hub
 * PUT /hubs/:hub_id/tree
 * Requires authentication and ownership
 */
router.put('/hubs/:hub_id/tree', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const { hub_id } = req.params;
        const { name, root } = req.body;
        // Validate hub exists
        const hub = await LinkHub_1.LinkHub.findOne({ hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        // Get current version
        const current = await RuleTree_1.RuleTree.findOne({ hub_id }).sort({ version: -1 });
        const newVersion = current ? current.version + 1 : 1;
        // Create new version
        const ruleTree = await RuleTree_1.RuleTree.create({
            name: name || 'ruletree',
            hub_id,
            root: root,
            version: newVersion,
        });
        // Update hub reference
        await LinkHub_1.LinkHub.updateOne({ hub_id }, { $set: { rule_tree_id: ruleTree._id } });
        // Invalidate cache
        await CacheService_1.cacheService.invalidateRuleTree(hub_id);
        return res.json({
            message: 'Rule tree updated',
            version: newVersion,
            ruleTree,
        });
    }
    catch (error) {
        console.error('Update tree error:', error);
        return res.status(500).json({ error: 'Failed to update rule tree' });
    }
});
/**
 * Get the current rule tree for a hub
 * GET /hubs/:hub_id/tree
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id/tree', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const ruleTree = await CacheService_1.cacheService.getRuleTree(req.params.hub_id);
        if (!ruleTree) {
            return res.status(404).json({ error: 'Rule tree not found' });
        }
        const isCached = await CacheService_1.cacheService.isCached(req.params.hub_id);
        const cacheTTL = await CacheService_1.cacheService.getCacheTTL(req.params.hub_id);
        return res.json({
            ruleTree,
            cache: {
                cached: isCached,
                ttl_seconds: cacheTTL,
            },
        });
    }
    catch (error) {
        console.error('Get tree error:', error);
        return res.status(500).json({ error: 'Failed to get rule tree' });
    }
});
/**
 * Invalidate the cache for a hub's rule tree
 * POST /hubs/:hub_id/tree/invalidate
 * Requires authentication and ownership
 */
router.post('/hubs/:hub_id/tree/invalidate', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        await CacheService_1.cacheService.invalidateRuleTree(req.params.hub_id);
        return res.json({ message: 'Cache invalidated' });
    }
    catch (error) {
        console.error('Invalidate cache error:', error);
        return res.status(500).json({ error: 'Failed to invalidate cache' });
    }
});
// ============== VARIANT MANAGEMENT ==============
/**
 * Create a variant
 * POST /hubs/:hub_id/variants
 * Requires authentication and ownership
 */
router.post('/hubs/:hub_id/variants', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const { hub_id } = req.params;
        const { variant_id, target_url, priority, weight, enabled, conditions } = req.body;
        // Validate hub exists
        const hub = await LinkHub_1.LinkHub.findOne({ hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }
        // Check for duplicate variant_id
        const existing = await Variant_1.Variant.findOne({ variant_id });
        if (existing) {
            return res.status(409).json({ error: 'Variant with this ID already exists' });
        }
        const variant = await Variant_1.Variant.create({
            variant_id,
            hub_id,
            target_url,
            priority: priority || 0,
            weight: weight || 1,
            enabled: enabled !== false,
            conditions: conditions || {},
        });
        // Initialize stats for the variant
        await VariantStats_1.VariantStats.create({
            variant_id,
            hub_id,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            score: 0,
            recent_clicks_hour: 0,
        });
        return res.status(201).json(variant);
    }
    catch (error) {
        console.error('Create variant error:', error);
        return res.status(500).json({ error: 'Failed to create variant' });
    }
});
/**
 * Get all variants for a hub
 * GET /hubs/:hub_id/variants
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id/variants', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const variants = await Variant_1.Variant.find({ hub_id: req.params.hub_id })
            .sort({ priority: -1 });
        return res.json(variants);
    }
    catch (error) {
        console.error('Get variants error:', error);
        return res.status(500).json({ error: 'Failed to get variants' });
    }
});
/**
 * Update a variant
 * PUT /hubs/:hub_id/variants/:variant_id
 * Requires authentication and ownership
 */
router.put('/hubs/:hub_id/variants/:variant_id', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const { target_url, priority, weight, enabled, conditions } = req.body;
        const variant = await Variant_1.Variant.findOneAndUpdate({
            variant_id: req.params.variant_id,
            hub_id: req.params.hub_id
        }, { $set: { target_url, priority, weight, enabled, conditions } }, { new: true });
        if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
        }
        return res.json(variant);
    }
    catch (error) {
        console.error('Update variant error:', error);
        return res.status(500).json({ error: 'Failed to update variant' });
    }
});
/**
 * Delete a variant
 * DELETE /hubs/:hub_id/variants/:variant_id
 * Requires authentication and ownership
 */
router.delete('/hubs/:hub_id/variants/:variant_id', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const variant = await Variant_1.Variant.findOneAndDelete({
            variant_id: req.params.variant_id,
            hub_id: req.params.hub_id
        });
        if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
        }
        // Also delete stats
        await VariantStats_1.VariantStats.deleteOne({ variant_id: req.params.variant_id });
        return res.json({ message: 'Variant deleted successfully' });
    }
    catch (error) {
        console.error('Delete variant error:', error);
        return res.status(500).json({ error: 'Failed to delete variant' });
    }
});
// ============== ANALYTICS ==============
/**
 * Get stats for all variants in a hub
 * GET /hubs/:hub_id/stats
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id/stats', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        const stats = await StatsAggregator_1.statsAggregator.getHubStats(req.params.hub_id);
        // Calculate aggregated stats
        const aggregated = {
            total_clicks: stats.reduce((sum, s) => sum + s.clicks, 0),
            total_impressions: stats.reduce((sum, s) => sum + s.impressions, 0),
            average_ctr: stats.length > 0
                ? stats.reduce((sum, s) => sum + s.ctr, 0) / stats.length
                : 0,
            variant_count: stats.length,
        };
        return res.json({
            aggregated,
            variants: stats
        });
    }
    catch (error) {
        console.error('Get stats error:', error);
        return res.status(500).json({ error: 'Failed to get stats' });
    }
});
/**
 * Force stats aggregation
 * POST /hubs/:hub_id/stats/aggregate
 * Requires authentication and ownership
 */
router.post('/hubs/:hub_id/stats/aggregate', authMiddleware_1.requireAuth, authMiddleware_1.requireOwnership, async (req, res) => {
    try {
        await StatsAggregator_1.statsAggregator.forceAggregate();
        const stats = await StatsAggregator_1.statsAggregator.getHubStats(req.params.hub_id);
        return res.json({ message: 'Aggregation completed', stats });
    }
    catch (error) {
        console.error('Aggregate stats error:', error);
        return res.status(500).json({ error: 'Failed to aggregate stats' });
    }
});
exports.default = router;
//# sourceMappingURL=admin.js.map