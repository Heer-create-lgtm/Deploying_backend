import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Import all models to ensure they're registered
import { User } from '../../models/User';
import { LinkHub } from '../../models/LinkHub';
import { Variant } from '../../models/Variant';
import { VariantStats } from '../../models/VariantStats';
import { Event } from '../../models/Event';
import { RuleTree } from '../../models/RuleTree';

let mongoServer: MongoMemoryServer | null = null;
let isInitialized = false;
let usingExternalDb = false;

/**
 * Test Database Setup
 * Uses in-memory MongoDB for complete isolation
 * Falls back to external test database if MongoMemoryServer fails (e.g., EPERM on macOS)
 * Uses a single connection for all tests to avoid index conflicts
 */
export async function setupTestDatabase(): Promise<string> {
    // If already connected, just ensure indexes and return
    if (isInitialized && mongoose.connection.readyState === 1) {
        return mongoose.connection.host || '';
    }

    // Close any existing connection
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
    }

    let uri: string;

    // Try to create in-memory MongoDB server, fallback to external if it fails
    try {
        if (!mongoServer) {
            mongoServer = await MongoMemoryServer.create();
        }
        uri = mongoServer.getUri();
        console.log('✓ Using in-memory MongoDB');
    } catch (error: any) {
        // Fallback to external test database
        console.warn('⚠ MongoMemoryServer failed, using external test database');
        console.warn(`  Error: ${error.message}`);

        uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/smart-link-hub-test';
        usingExternalDb = true;

        // Ensure we're using test database, not production
        if (!uri.includes('test')) {
            uri = uri.replace(/\/([^/?]+)(\?|$)/, '/smart-link-hub-test$2');
        }
        console.log(`✓ Using external MongoDB: ${uri}`);
    }

    await mongoose.connect(uri);

    // CRITICAL: Synchronize all indexes explicitly (foreground mode)
    // Only do this once per server instance
    if (!isInitialized) {
        await syncAllIndexes();
        await verifyIndexes();
        isInitialized = true;
    }

    console.log('✓ Test database connected');

    return uri;
}

/**
 * Synchronize all model indexes in foreground mode
 * Blocks until all indexes are confirmed created
 */
async function syncAllIndexes(): Promise<void> {
    const models = [User, LinkHub, Variant, VariantStats, Event, RuleTree];

    for (const model of models) {
        try {
            // First drop all existing indexes (except _id)
            try {
                await model.collection.dropIndexes();
            } catch {
                // Collection may not exist yet, ignore
            }

            // Then create fresh indexes
            await model.createIndexes();
        } catch (error) {
            console.error(`Failed to sync indexes for ${model.modelName}:`, error);
            throw error;
        }
    }

    console.log('✓ All indexes synchronized');
}

/**
 * Verify that expected unique indexes exist
 * Fails immediately if any expected index is missing
 */
async function verifyIndexes(): Promise<void> {
    const errors: string[] = [];

    // Check User indexes
    const userIndexes = await User.collection.indexes();
    if (!userIndexes.some(i => i.key.email && i.unique)) {
        errors.push('User.email unique index missing');
    }
    if (!userIndexes.some(i => i.key.user_id && i.unique)) {
        errors.push('User.user_id unique index missing');
    }

    // Check LinkHub indexes
    const hubIndexes = await LinkHub.collection.indexes();
    if (!hubIndexes.some(i => i.key.hub_id && i.unique)) {
        errors.push('LinkHub.hub_id unique index missing');
    }
    if (!hubIndexes.some(i => i.key.slug && i.unique)) {
        errors.push('LinkHub.slug unique index missing');
    }

    // Check VariantStats indexes
    const statsIndexes = await VariantStats.collection.indexes();
    if (!statsIndexes.some(i => i.key.variant_id && i.unique)) {
        errors.push('VariantStats.variant_id unique index missing');
    }

    if (errors.length > 0) {
        console.error('❌ Index verification failed:');
        errors.forEach(e => console.error(`   - ${e}`));
        throw new Error(`Index verification failed: ${errors.join(', ')}`);
    }

    console.log('✓ All indexes verified');
}

/**
 * Cleanup test database - call only at very end of all tests
 */
export async function cleanupTestDatabase(): Promise<void> {
    // Don't actually close - let Jest handle final cleanup
    // Just clear collections
    await clearCollections();
    console.log('✓ Test database cleaned up');
}

/**
 * Final cleanup - call only once at end of all test suites
 */
export async function finalCleanup(): Promise<void> {
    if (mongoose.connection.readyState !== 0) {
        // Only drop database if using in-memory server (safe to drop)
        // For external databases, we just clear collections to preserve structure
        if (!usingExternalDb) {
            await mongoose.connection.dropDatabase();
        } else {
            await clearCollections();
        }
        await mongoose.connection.close();
    }
    if (mongoServer) {
        await mongoServer.stop();
        mongoServer = null;
    }
    isInitialized = false;
    usingExternalDb = false;
}

/**
 * Clear all collections (preserves indexes)
 */
export async function clearCollections(): Promise<void> {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
        await collections[key].deleteMany({});
    }
}

/**
 * Get connection status
 */
export function isConnected(): boolean {
    return mongoose.connection.readyState === 1;
}
