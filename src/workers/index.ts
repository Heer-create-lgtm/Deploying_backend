import dotenv from 'dotenv';
dotenv.config();

import { connectMongoDB, closeConnections } from '../config/database';
import { eventProcessor } from './EventProcessor';
import { statsAggregator } from './StatsAggregator';

/**
 * Worker Entry Point
 * Starts both the event processor and stats aggregator
 */
async function main(): Promise<void> {
    console.log('Starting workers...');

    // Connect to databases
    await connectMongoDB();

    // Start workers
    statsAggregator.start();

    // Start event processor (runs in a loop)
    eventProcessor.start();

    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down workers...');
        eventProcessor.stop();
        statsAggregator.stop();
        await closeConnections();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch((error) => {
    console.error('Worker failed to start:', error);
    process.exit(1);
});

export { eventProcessor, statsAggregator };
