import { Router, Request, Response } from 'express';
import { LinkHub } from '../models/LinkHub';
import { RuleTree, IDecisionNode } from '../models/RuleTree';
import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';
import { cacheService } from '../services/CacheService';
import { statsAggregator } from '../workers/StatsAggregator';
import { requireAuth, requireOwnership, IAuthenticatedRequest } from '../middleware/authMiddleware';

const router = Router();

// ============== HUB MANAGEMENT ==============

/**
 * Create a new hub
 * POST /hubs
 * Requires authentication - assigns owner_user_id
 */
router.post('/hubs', requireAuth, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { hub_id, slug, default_url, theme } = req.body;

        // Validate required fields
        if (!hub_id || !slug || !default_url || !theme) {
            return res.status(400).json({
                error: 'Missing required fields: hub_id, slug, default_url, theme'
            });
        }

        // Check for duplicates
        const existing = await LinkHub.findOne({
            $or: [{ hub_id }, { slug }]
        });

        if (existing) {
            return res.status(409).json({ error: 'Hub with this ID or slug already exists' });
        }

        // Create hub with owner
        const hub = await LinkHub.create({
            hub_id,
            slug,
            default_url,
            theme,
            owner_user_id: req.user?.user_id,
        });

        return res.status(201).json(hub);
    } catch (error) {
        console.error('Create hub error:', error);
        return res.status(500).json({ error: 'Failed to create hub' });
    }
});

/**
 * Get a hub by ID
 * GET /hubs/:hub_id
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const hub = await LinkHub.findOne({ hub_id: req.params.hub_id });

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        return res.json(hub);
    } catch (error) {
        console.error('Get hub error:', error);
        return res.status(500).json({ error: 'Failed to get hub' });
    }
});

/**
 * List all hubs owned by the current user
 * GET /hubs
 * Requires authentication - admins see all, users see only their own
 */
router.get('/hubs', requireAuth, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        let query = {};

        // Non-admins only see their own hubs
        if (req.user?.role !== 'admin') {
            query = { owner_user_id: req.user?.user_id };
        }

        const hubs = await LinkHub.find(query)
            .sort({ created_at: -1 })
            .lean();

        return res.json(hubs);
    } catch (error) {
        console.error('List hubs error:', error);
        return res.status(500).json({ error: 'Failed to list hubs' });
    }
});

/**
 * Update a hub
 * PUT /hubs/:hub_id
 * Requires authentication and ownership
 */
router.put('/hubs/:hub_id', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { slug, default_url, theme } = req.body;

        const hub = await LinkHub.findOneAndUpdate(
            { hub_id: req.params.hub_id },
            { $set: { slug, default_url, theme } },
            { new: true }
        );

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        return res.json(hub);
    } catch (error) {
        console.error('Update hub error:', error);
        return res.status(500).json({ error: 'Failed to update hub' });
    }
});

/**
 * Delete a hub
 * DELETE /hubs/:hub_id
 * Requires authentication and ownership
 */
router.delete('/hubs/:hub_id', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const hub = await LinkHub.findOneAndDelete({ hub_id: req.params.hub_id });

        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        // Also delete associated data
        await RuleTree.deleteMany({ hub_id: req.params.hub_id });
        await Variant.deleteMany({ hub_id: req.params.hub_id });
        await VariantStats.deleteMany({ hub_id: req.params.hub_id });

        // Invalidate cache
        await cacheService.invalidateRuleTree(req.params.hub_id);

        return res.json({ message: 'Hub deleted successfully' });
    } catch (error) {
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
router.put('/hubs/:hub_id/tree', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { hub_id } = req.params;
        const { name, root } = req.body;

        // Validate hub exists
        const hub = await LinkHub.findOne({ hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        // Get current version
        const current = await RuleTree.findOne({ hub_id }).sort({ version: -1 });
        const newVersion = current ? current.version + 1 : 1;

        // Create new version
        const ruleTree = await RuleTree.create({
            name: name || 'ruletree',
            hub_id,
            root: root as IDecisionNode,
            version: newVersion,
        });

        // Update hub reference
        await LinkHub.updateOne(
            { hub_id },
            { $set: { rule_tree_id: ruleTree._id } }
        );

        // Invalidate cache
        await cacheService.invalidateRuleTree(hub_id);

        return res.json({
            message: 'Rule tree updated',
            version: newVersion,
            ruleTree,
        });
    } catch (error) {
        console.error('Update tree error:', error);
        return res.status(500).json({ error: 'Failed to update rule tree' });
    }
});

/**
 * Get the current rule tree for a hub
 * GET /hubs/:hub_id/tree
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id/tree', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const ruleTree = await cacheService.getRuleTree(req.params.hub_id);

        if (!ruleTree) {
            return res.status(404).json({ error: 'Rule tree not found' });
        }

        const isCached = await cacheService.isCached(req.params.hub_id);
        const cacheTTL = await cacheService.getCacheTTL(req.params.hub_id);

        return res.json({
            ruleTree,
            cache: {
                cached: isCached,
                ttl_seconds: cacheTTL,
            },
        });
    } catch (error) {
        console.error('Get tree error:', error);
        return res.status(500).json({ error: 'Failed to get rule tree' });
    }
});

/**
 * Invalidate the cache for a hub's rule tree
 * POST /hubs/:hub_id/tree/invalidate
 * Requires authentication and ownership
 */
router.post('/hubs/:hub_id/tree/invalidate', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        await cacheService.invalidateRuleTree(req.params.hub_id);
        return res.json({ message: 'Cache invalidated' });
    } catch (error) {
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
router.post('/hubs/:hub_id/variants', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { hub_id } = req.params;
        const { variant_id, target_url, priority, weight, enabled, conditions } = req.body;

        // Validate hub exists
        const hub = await LinkHub.findOne({ hub_id });
        if (!hub) {
            return res.status(404).json({ error: 'Hub not found' });
        }

        // Check for duplicate variant_id
        const existing = await Variant.findOne({ variant_id });
        if (existing) {
            return res.status(409).json({ error: 'Variant with this ID already exists' });
        }

        const variant = await Variant.create({
            variant_id,
            hub_id,
            target_url,
            priority: priority || 0,
            weight: weight || 1,
            enabled: enabled !== false,
            conditions: conditions || {},
        });

        // Initialize stats for the variant
        await VariantStats.create({
            variant_id,
            hub_id,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            score: 0,
            recent_clicks_hour: 0,
        });

        return res.status(201).json(variant);
    } catch (error) {
        console.error('Create variant error:', error);
        return res.status(500).json({ error: 'Failed to create variant' });
    }
});

/**
 * Get all variants for a hub
 * GET /hubs/:hub_id/variants
 * Requires authentication and ownership
 */
router.get('/hubs/:hub_id/variants', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const variants = await Variant.find({ hub_id: req.params.hub_id })
            .sort({ priority: -1 });

        return res.json(variants);
    } catch (error) {
        console.error('Get variants error:', error);
        return res.status(500).json({ error: 'Failed to get variants' });
    }
});

/**
 * Update a variant
 * PUT /hubs/:hub_id/variants/:variant_id
 * Requires authentication and ownership
 */
router.put('/hubs/:hub_id/variants/:variant_id', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const { target_url, priority, weight, enabled, conditions } = req.body;

        const variant = await Variant.findOneAndUpdate(
            {
                variant_id: req.params.variant_id,
                hub_id: req.params.hub_id
            },
            { $set: { target_url, priority, weight, enabled, conditions } },
            { new: true }
        );

        if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
        }

        return res.json(variant);
    } catch (error) {
        console.error('Update variant error:', error);
        return res.status(500).json({ error: 'Failed to update variant' });
    }
});

/**
 * Delete a variant
 * DELETE /hubs/:hub_id/variants/:variant_id
 * Requires authentication and ownership
 */
router.delete('/hubs/:hub_id/variants/:variant_id', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const variant = await Variant.findOneAndDelete({
            variant_id: req.params.variant_id,
            hub_id: req.params.hub_id
        });

        if (!variant) {
            return res.status(404).json({ error: 'Variant not found' });
        }

        // Also delete stats
        await VariantStats.deleteOne({ variant_id: req.params.variant_id });

        return res.json({ message: 'Variant deleted successfully' });
    } catch (error) {
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
router.get('/hubs/:hub_id/stats', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        const stats = await statsAggregator.getHubStats(req.params.hub_id);

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
    } catch (error) {
        console.error('Get stats error:', error);
        return res.status(500).json({ error: 'Failed to get stats' });
    }
});

/**
 * Force stats aggregation
 * POST /hubs/:hub_id/stats/aggregate
 * Requires authentication and ownership
 */
router.post('/hubs/:hub_id/stats/aggregate', requireAuth, requireOwnership, async (req: IAuthenticatedRequest, res: Response) => {
    try {
        await statsAggregator.forceAggregate();
        const stats = await statsAggregator.getHubStats(req.params.hub_id);
        return res.json({ message: 'Aggregation completed', stats });
    } catch (error) {
        console.error('Aggregate stats error:', error);
        return res.status(500).json({ error: 'Failed to aggregate stats' });
    }
});

export default router;
