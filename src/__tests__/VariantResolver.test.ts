import { VariantResolver } from '../services/VariantResolver';
import { IVariant } from '../models/Variant';
import { IVariantStats } from '../models/VariantStats';

// Mock mongoose models
jest.mock('../models/Variant', () => ({
    Variant: {
        find: jest.fn(),
        findOne: jest.fn(),
    },
}));

jest.mock('../models/VariantStats', () => ({
    VariantStats: {
        find: jest.fn(),
    },
}));

import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';

describe('VariantResolver', () => {
    let resolver: VariantResolver;

    beforeEach(() => {
        resolver = new VariantResolver();
        jest.clearAllMocks();
    });

    describe('resolveVariant', () => {
        it('should return null for empty variant list', async () => {
            const result = await resolver.resolveVariant([], 'hub_001');
            expect(result).toBeNull();
        });

        it('should return variant directly if only one option', async () => {
            const mockVariant = {
                variant_id: 'var_1',
                hub_id: 'hub_001',
                target_url: 'https://example.com',
                priority: 10,
                weight: 1,
                enabled: true,
            } as IVariant;

            (Variant.find as jest.Mock).mockResolvedValue([mockVariant]);

            const result = await resolver.resolveVariant(['var_1'], 'hub_001');
            expect(result).toEqual(mockVariant);
        });

        it('should select variant with highest score', async () => {
            const variants = [
                { variant_id: 'var_1', hub_id: 'hub_001', target_url: 'url1', priority: 5, weight: 1 },
                { variant_id: 'var_2', hub_id: 'hub_001', target_url: 'url2', priority: 5, weight: 1 },
            ] as IVariant[];

            const stats = [
                { variant_id: 'var_1', hub_id: 'hub_001', score: 0.5 },
                { variant_id: 'var_2', hub_id: 'hub_001', score: 0.8 }, // Higher score
            ] as IVariantStats[];

            (Variant.find as jest.Mock).mockResolvedValue(variants);
            (VariantStats.find as jest.Mock).mockResolvedValue(stats);

            const result = await resolver.resolveVariant(['var_1', 'var_2'], 'hub_001');
            expect(result?.variant_id).toBe('var_2');
        });

        it('should break ties using priority', async () => {
            const variants = [
                { variant_id: 'var_1', hub_id: 'hub_001', target_url: 'url1', priority: 5, weight: 1 },
                { variant_id: 'var_2', hub_id: 'hub_001', target_url: 'url2', priority: 10, weight: 1 }, // Higher priority
            ] as IVariant[];

            const stats = [
                { variant_id: 'var_1', hub_id: 'hub_001', score: 0.5 },
                { variant_id: 'var_2', hub_id: 'hub_001', score: 0.5 }, // Same score
            ] as IVariantStats[];

            (Variant.find as jest.Mock).mockResolvedValue(variants);
            (VariantStats.find as jest.Mock).mockResolvedValue(stats);

            const result = await resolver.resolveVariant(['var_1', 'var_2'], 'hub_001');
            expect(result?.variant_id).toBe('var_2');
        });
    });

    describe('weightedRandom', () => {
        it('should select from variants based on weight', () => {
            const variants = [
                { variant_id: 'var_1', weight: 1 },
                { variant_id: 'var_2', weight: 9 }, // Much higher weight
            ] as IVariant[];

            // Run multiple times to test distribution
            const counts: Record<string, number> = { var_1: 0, var_2: 0 };
            const iterations = 1000;

            for (let i = 0; i < iterations; i++) {
                const result = resolver.weightedRandom(variants);
                counts[result.variant_id]++;
            }

            // var_2 should be selected ~90% of the time
            expect(counts.var_2).toBeGreaterThan(counts.var_1 * 5);
        });

        it('should handle zero weights', () => {
            const variants = [
                { variant_id: 'var_1', weight: 0 },
                { variant_id: 'var_2', weight: 0 },
            ] as IVariant[];

            // Should still return a variant (random selection)
            const result = resolver.weightedRandom(variants);
            expect(['var_1', 'var_2']).toContain(result.variant_id);
        });
    });
});
