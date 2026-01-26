import { IVariant } from '../models/Variant';
/**
 * Variant Resolver
 * Resolves which variant to use based on:
 * 1. Score (precomputed from clicks, impressions, CTR)
 * 2. Priority (higher is better)
 * 3. Weighted random (for final ties)
 */
export declare class VariantResolver {
    /**
     * Resolve the best variant from a list of variant IDs
     */
    resolveVariant(variantIds: string[], hubId: string): Promise<IVariant | null>;
    /**
     * Weighted random selection among tied variants
     */
    weightedRandom(variants: IVariant[]): IVariant;
    /**
     * Get all enabled variants for a hub
     */
    getEnabledVariants(hubId: string): Promise<IVariant[]>;
    /**
     * Get variant by ID
     */
    getVariant(variantId: string): Promise<IVariant | null>;
}
export declare const variantResolver: VariantResolver;
//# sourceMappingURL=VariantResolver.d.ts.map