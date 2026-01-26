import { Variant, IVariant } from '../models/Variant';
import { VariantStats, IVariantStats } from '../models/VariantStats';

/**
 * Variant with its stats for resolution
 */
interface IVariantWithStats {
    variant: IVariant;
    stats: IVariantStats | null;
}

/**
 * Variant Resolver
 * Resolves which variant to use based on:
 * 1. Score (precomputed from clicks, impressions, CTR)
 * 2. Priority (higher is better)
 * 3. Weighted random (for final ties)
 */
export class VariantResolver {

    /**
     * Resolve the best variant from a list of variant IDs
     */
    async resolveVariant(variantIds: string[], hubId: string): Promise<IVariant | null> {
        if (!variantIds || variantIds.length === 0) {
            return null;
        }

        // Fetch variants and their stats
        const variants = await Variant.find({
            variant_id: { $in: variantIds },
            hub_id: hubId,
            enabled: true,
        });

        if (variants.length === 0) {
            return null;
        }

        // If only one variant, return it directly
        if (variants.length === 1) {
            return variants[0];
        }

        // Fetch stats for all variants
        const stats = await VariantStats.find({
            variant_id: { $in: variantIds },
            hub_id: hubId,
        });

        // Create a map for quick stats lookup
        const statsMap = new Map<string, IVariantStats>();
        for (const stat of stats) {
            statsMap.set(stat.variant_id, stat);
        }

        // Combine variants with their stats
        const variantsWithStats: IVariantWithStats[] = variants.map((variant) => ({
            variant,
            stats: statsMap.get(variant.variant_id) || null,
        }));

        // Sort by score (desc), then priority (desc)
        variantsWithStats.sort((a, b) => {
            const scoreA = a.stats?.score || 0;
            const scoreB = b.stats?.score || 0;

            // First compare by score
            if (scoreB !== scoreA) {
                return scoreB - scoreA;
            }

            // Then by priority
            return b.variant.priority - a.variant.priority;
        });

        // Check if there are ties at the top
        const topScore = variantsWithStats[0].stats?.score || 0;
        const topPriority = variantsWithStats[0].variant.priority;

        const ties = variantsWithStats.filter((v) => {
            const score = v.stats?.score || 0;
            return score === topScore && v.variant.priority === topPriority;
        });

        // If there are ties, use weighted random selection
        if (ties.length > 1) {
            return this.weightedRandom(ties.map((t) => t.variant));
        }

        // Return the top variant
        return variantsWithStats[0].variant;
    }

    /**
     * Weighted random selection among tied variants
     */
    weightedRandom(variants: IVariant[]): IVariant {
        // Calculate total weight
        const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);

        // Handle edge case where all weights are 0
        if (totalWeight === 0) {
            return variants[Math.floor(Math.random() * variants.length)];
        }

        // Pick a random value between 0 and totalWeight
        let random = Math.random() * totalWeight;

        // Find the variant that this random value falls into
        for (const variant of variants) {
            random -= variant.weight;
            if (random <= 0) {
                return variant;
            }
        }

        // Fallback (shouldn't happen)
        return variants[variants.length - 1];
    }

    /**
     * Get all enabled variants for a hub
     */
    async getEnabledVariants(hubId: string): Promise<IVariant[]> {
        return Variant.find({
            hub_id: hubId,
            enabled: true,
        }).sort({ priority: -1 });
    }

    /**
     * Get variant by ID
     */
    async getVariant(variantId: string): Promise<IVariant | null> {
        return Variant.findOne({ variant_id: variantId });
    }
}

// Singleton instance
export const variantResolver = new VariantResolver();
