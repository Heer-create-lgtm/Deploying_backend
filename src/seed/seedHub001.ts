import dotenv from 'dotenv';
dotenv.config();

import { connectMongoDB, closeConnections } from '../config/database';
import { LinkHub } from '../models/LinkHub';
import { RuleTree, IDecisionNode } from '../models/RuleTree';
import { Variant } from '../models/Variant';
import { VariantStats } from '../models/VariantStats';

/**
 * Seed script for hub_001
 * Creates the hub, rule tree, and sample variants as specified
 */
async function seedHub001(): Promise<void> {
    console.log('Seeding hub_001...');

    // Connect to MongoDB
    await connectMongoDB();

    const HUB_ID = 'hub_001';

    // Clean up existing data for this hub
    await LinkHub.deleteMany({ hub_id: HUB_ID });
    await RuleTree.deleteMany({ hub_id: HUB_ID });
    await Variant.deleteMany({ hub_id: HUB_ID });
    await VariantStats.deleteMany({ hub_id: HUB_ID });

    console.log('Cleaned up existing data');

    // ============== CREATE HUB ==============
    const hub = await LinkHub.create({
        hub_id: HUB_ID,
        slug: 'smart-hub',
        default_url: 'https://example.com/fallback',
        theme: {
            bg: 'black',
            accent: 'green',
        },
    });

    console.log('✓ Created hub:', hub.hub_id);

    // ============== CREATE RULE TREE ==============
    // Structure: device → location → time
    // Each leaf contains variant_ids

    const ruleTree: IDecisionNode = {
        type: 'device',
        device_branches: {
            // Mobile branch
            mobile: {
                type: 'location',
                country_branches: {
                    US: {
                        type: 'time',
                        time_windows: [
                            {
                                branch_id: 'us_mobile_business_hours',
                                recurring: {
                                    days: [1, 2, 3, 4, 5], // Mon-Fri
                                    start_time: '09:00',
                                    end_time: '17:00',
                                    timezone: 'America/New_York',
                                },
                                next_node: {
                                    type: 'leaf',
                                    variant_ids: ['var_us_mobile_day', 'var_us_mobile_promo'],
                                },
                            },
                            {
                                branch_id: 'us_mobile_evening',
                                recurring: {
                                    days: [0, 1, 2, 3, 4, 5, 6], // All week
                                    start_time: '17:00',
                                    end_time: '23:00',
                                    timezone: 'America/New_York',
                                },
                                next_node: {
                                    type: 'leaf',
                                    variant_ids: ['var_us_mobile_evening'],
                                },
                            },
                        ],
                        time_default_node: {
                            type: 'leaf',
                            variant_ids: ['var_us_mobile_default'],
                        },
                    },
                    IN: {
                        type: 'time',
                        time_windows: [
                            {
                                branch_id: 'in_mobile_business_hours',
                                recurring: {
                                    days: [1, 2, 3, 4, 5, 6], // Mon-Sat
                                    start_time: '10:00',
                                    end_time: '19:00',
                                    timezone: 'Asia/Kolkata',
                                },
                                next_node: {
                                    type: 'leaf',
                                    variant_ids: ['var_in_mobile_day', 'var_in_mobile_promo'],
                                },
                            },
                        ],
                        time_default_node: {
                            type: 'leaf',
                            variant_ids: ['var_in_mobile_default'],
                        },
                    },
                    GB: {
                        type: 'leaf',
                        variant_ids: ['var_gb_mobile'],
                    },
                },
                location_default_node: {
                    type: 'leaf',
                    variant_ids: ['var_mobile_global'],
                },
            },

            // Desktop branch
            desktop: {
                type: 'location',
                country_branches: {
                    US: {
                        type: 'time',
                        time_windows: [
                            {
                                branch_id: 'us_desktop_business_hours',
                                recurring: {
                                    days: [1, 2, 3, 4, 5],
                                    start_time: '09:00',
                                    end_time: '17:00',
                                    timezone: 'America/New_York',
                                },
                                next_node: {
                                    type: 'leaf',
                                    variant_ids: ['var_us_desktop_day', 'var_us_desktop_enterprise'],
                                },
                            },
                        ],
                        time_default_node: {
                            type: 'leaf',
                            variant_ids: ['var_us_desktop_default'],
                        },
                    },
                    IN: {
                        type: 'leaf',
                        variant_ids: ['var_in_desktop', 'var_in_desktop_promo'],
                    },
                },
                // Polygon fallback for European region
                polygon_fallback: {
                    type: 'Polygon',
                    coordinates: [[
                        [-10.0, 35.0],  // SW corner
                        [40.0, 35.0],   // SE corner
                        [40.0, 70.0],   // NE corner
                        [-10.0, 70.0],  // NW corner
                        [-10.0, 35.0],  // Close polygon
                    ]],
                },
                polygon_fallback_node: {
                    type: 'leaf',
                    variant_ids: ['var_europe_desktop'],
                },
                location_default_node: {
                    type: 'leaf',
                    variant_ids: ['var_desktop_global'],
                },
            },

            // Default device branch (tablet, other)
            default: {
                type: 'location',
                country_branches: {
                    US: {
                        type: 'leaf',
                        variant_ids: ['var_us_other'],
                    },
                },
                location_default_node: {
                    type: 'leaf',
                    variant_ids: ['var_other_global'],
                },
            },
        },
    };

    const tree = await RuleTree.create({
        name: 'ruletree',
        hub_id: HUB_ID,
        root: ruleTree,
        version: 1,
    });

    // Update hub with tree reference
    await LinkHub.updateOne(
        { hub_id: HUB_ID },
        { $set: { rule_tree_id: tree._id } }
    );

    console.log('✓ Created rule tree with version:', tree.version);

    // ============== CREATE VARIANTS ==============
    const variants = [
        // US Mobile variants
        {
            variant_id: 'var_us_mobile_day',
            target_url: 'https://example.com/us/mobile/daytime',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['US'] },
        },
        {
            variant_id: 'var_us_mobile_promo',
            target_url: 'https://example.com/us/mobile/promo',
            priority: 5,
            weight: 2,
            conditions: { device_types: ['mobile'], countries: ['US'] },
        },
        {
            variant_id: 'var_us_mobile_evening',
            target_url: 'https://example.com/us/mobile/evening',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['US'] },
        },
        {
            variant_id: 'var_us_mobile_default',
            target_url: 'https://example.com/us/mobile/default',
            priority: 1,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['US'] },
        },

        // India Mobile variants
        {
            variant_id: 'var_in_mobile_day',
            target_url: 'https://example.com/in/mobile/daytime',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['IN'] },
        },
        {
            variant_id: 'var_in_mobile_promo',
            target_url: 'https://example.com/in/mobile/promo',
            priority: 5,
            weight: 3,
            conditions: { device_types: ['mobile'], countries: ['IN'] },
        },
        {
            variant_id: 'var_in_mobile_default',
            target_url: 'https://example.com/in/mobile/default',
            priority: 1,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['IN'] },
        },

        // GB Mobile
        {
            variant_id: 'var_gb_mobile',
            target_url: 'https://example.com/gb/mobile',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['mobile'], countries: ['GB'] },
        },

        // Global Mobile fallback
        {
            variant_id: 'var_mobile_global',
            target_url: 'https://example.com/global/mobile',
            priority: 1,
            weight: 1,
            conditions: { device_types: ['mobile'] },
        },

        // US Desktop variants
        {
            variant_id: 'var_us_desktop_day',
            target_url: 'https://example.com/us/desktop/daytime',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['desktop'], countries: ['US'] },
        },
        {
            variant_id: 'var_us_desktop_enterprise',
            target_url: 'https://example.com/us/desktop/enterprise',
            priority: 8,
            weight: 2,
            conditions: { device_types: ['desktop'], countries: ['US'] },
        },
        {
            variant_id: 'var_us_desktop_default',
            target_url: 'https://example.com/us/desktop/default',
            priority: 1,
            weight: 1,
            conditions: { device_types: ['desktop'], countries: ['US'] },
        },

        // India Desktop variants
        {
            variant_id: 'var_in_desktop',
            target_url: 'https://example.com/in/desktop',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['desktop'], countries: ['IN'] },
        },
        {
            variant_id: 'var_in_desktop_promo',
            target_url: 'https://example.com/in/desktop/promo',
            priority: 5,
            weight: 2,
            conditions: { device_types: ['desktop'], countries: ['IN'] },
        },

        // Europe Desktop (polygon fallback)
        {
            variant_id: 'var_europe_desktop',
            target_url: 'https://example.com/europe/desktop',
            priority: 10,
            weight: 1,
            conditions: { device_types: ['desktop'] },
        },

        // Global Desktop fallback
        {
            variant_id: 'var_desktop_global',
            target_url: 'https://example.com/global/desktop',
            priority: 1,
            weight: 1,
            conditions: { device_types: ['desktop'] },
        },

        // Other devices
        {
            variant_id: 'var_us_other',
            target_url: 'https://example.com/us/other',
            priority: 10,
            weight: 1,
            conditions: { countries: ['US'] },
        },
        {
            variant_id: 'var_other_global',
            target_url: 'https://example.com/global/other',
            priority: 1,
            weight: 1,
            conditions: {},
        },
    ];

    // Create all variants
    for (const v of variants) {
        await Variant.create({
            ...v,
            hub_id: HUB_ID,
            enabled: true,
        });

        // Initialize stats
        await VariantStats.create({
            variant_id: v.variant_id,
            hub_id: HUB_ID,
            clicks: 0,
            impressions: 0,
            ctr: 0,
            score: 0,
            recent_clicks_hour: 0,
        });
    }

    console.log(`✓ Created ${variants.length} variants with stats`);

    // Close connections
    await closeConnections();

    console.log('\n✓ Seeding complete!');
    console.log('\nHub summary:');
    console.log('  - Hub ID:', HUB_ID);
    console.log('  - Slug:', 'smart-hub');
    console.log('  - Default URL:', 'https://example.com/fallback');
    console.log('  - Theme:', '{ bg: "black", accent: "green" }');
    console.log('  - Rule tree:', 'device → location → time');
    console.log('  - Variants:', variants.length);
}

seedHub001().catch((error) => {
    console.error('Seeding failed:', error);
    process.exit(1);
});
