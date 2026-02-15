import { DecisionTreeEngine, IRequestContext } from '../services/DecisionTreeEngine';
import { IDecisionNode } from '../models/RuleTree';

describe('DecisionTreeEngine', () => {
    let engine: DecisionTreeEngine;

    beforeEach(() => {
        engine = new DecisionTreeEngine();
    });

    describe('parseDevice', () => {
        it('should identify mobile devices', () => {
            const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15';
            const result = engine.parseDevice(mobileUA);
            expect(result.type).toBe('mobile');
        });

        it('should identify desktop devices', () => {
            const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/91.0';
            const result = engine.parseDevice(desktopUA);
            expect(result.type).toBe('desktop');
        });

        it('should identify tablet devices', () => {
            const tabletUA = 'Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15';
            const result = engine.parseDevice(tabletUA);
            expect(result.type).toBe('tablet');
        });
    });

    describe('traverse', () => {
        const sampleTree: IDecisionNode = {
            type: 'device',
            device_branches: {
                mobile: {
                    type: 'location',
                    country_branches: {
                        US: {
                            type: 'leaf',
                            variant_ids: ['var_us_mobile'],
                        },
                        IN: {
                            type: 'leaf',
                            variant_ids: ['var_in_mobile'],
                        },
                    },
                    location_default_node: {
                        type: 'leaf',
                        variant_ids: ['var_global_mobile'],
                    },
                },
                desktop: {
                    type: 'location',
                    country_branches: {
                        US: {
                            type: 'leaf',
                            variant_ids: ['var_us_desktop'],
                        },
                    },
                    location_default_node: {
                        type: 'leaf',
                        variant_ids: ['var_global_desktop'],
                    },
                },
                default: {
                    type: 'leaf',
                    variant_ids: ['var_other'],
                },
            },
        };

        it('should resolve mobile + US correctly', () => {
            const context: IRequestContext = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                country: 'US',
                lat: 0,
                lon: 0,
                timestamp: new Date(),
            };

            const result = engine.traverse(context, sampleTree);
            expect(result).toEqual(['var_us_mobile']);
        });

        it('should resolve mobile + IN correctly', () => {
            const context: IRequestContext = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                country: 'IN',
                lat: 0,
                lon: 0,
                timestamp: new Date(),
            };

            const result = engine.traverse(context, sampleTree);
            expect(result).toEqual(['var_in_mobile']);
        });

        it('should resolve desktop + US correctly', () => {
            const context: IRequestContext = {
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0',
                country: 'US',
                lat: 0,
                lon: 0,
                timestamp: new Date(),
            };

            const result = engine.traverse(context, sampleTree);
            expect(result).toEqual(['var_us_desktop']);
        });

        it('should fall back to global for unknown country', () => {
            const context: IRequestContext = {
                userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X)',
                country: 'FR',
                lat: 0,
                lon: 0,
                timestamp: new Date(),
            };

            const result = engine.traverse(context, sampleTree);
            expect(result).toEqual(['var_global_mobile']);
        });

        it('should use default device branch for unknown devices', () => {
            const context: IRequestContext = {
                userAgent: 'SomeBot/1.0',
                country: 'US',
                lat: 0,
                lon: 0,
                timestamp: new Date(),
            };

            const result = engine.traverse(context, sampleTree);
            expect(result).toEqual(['var_other']);
        });
    });

    describe('time window evaluation', () => {
        const timeTree: IDecisionNode = {
            type: 'time',
            time_windows: [
                {
                    branch_id: 'business_hours',
                    recurring: {
                        days: [1, 2, 3, 4, 5], // Mon-Fri
                        start_time: '09:00',
                        end_time: '17:00',
                        timezone: 'America/New_York',
                    },
                    next_node: {
                        type: 'leaf',
                        variant_ids: ['var_business'],
                    },
                },
            ],
            time_default_node: {
                type: 'leaf',
                variant_ids: ['var_afterhours'],
            },
        };

        it('should match business hours on weekday', () => {
            // Monday at 10:00 AM Eastern
            const context: IRequestContext = {
                userAgent: '',
                country: 'US',
                lat: 0,
                lon: 0,
                timestamp: new Date('2026-01-26T15:00:00Z'), // 10 AM EST on Monday
            };

            const result = engine.traverse(context, timeTree);
            expect(result).toEqual(['var_business']);
        });

        it('should use default for weekend', () => {
            // Saturday at 10:00 AM Eastern
            const context: IRequestContext = {
                userAgent: '',
                country: 'US',
                lat: 0,
                lon: 0,
                timestamp: new Date('2026-01-24T15:00:00Z'), // Saturday
            };

            const result = engine.traverse(context, timeTree);
            expect(result).toEqual(['var_afterhours']);
        });
    });
});
