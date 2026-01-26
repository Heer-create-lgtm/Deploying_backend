"use strict";
/**
 * Analytics Seed Script
 * Generates sample analytics events for testing
 *
 * Usage: npx ts-node src/scripts/seedAnalytics.ts <hubId> [count]
 * Example: npx ts-node src/scripts/seedAnalytics.ts my-hub-id 500
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const mongoose_1 = __importDefault(require("mongoose"));
const AnalyticsEvent_1 = require("../models/AnalyticsEvent");
const uuid_1 = require("uuid");
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/linkhub';
// Sample data for realistic events
const USER_AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Linux; Android 13; SM-G998B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
];
const DEVICE_TYPES = [AnalyticsEvent_1.DeviceType.MOBILE, AnalyticsEvent_1.DeviceType.DESKTOP, AnalyticsEvent_1.DeviceType.TABLET];
const LOCATIONS = ['US', 'UK', 'IN', 'DE', 'FR', 'CA', 'AU', 'JP', 'BR', 'local'];
const REFERRERS = ['https://twitter.com', 'https://instagram.com', 'https://facebook.com', 'https://google.com', null, null];
function randomChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function randomDate(daysBack) {
    const now = Date.now();
    const past = now - (daysBack * 24 * 60 * 60 * 1000);
    return new Date(past + Math.random() * (now - past));
}
async function seedAnalytics(hubId, count) {
    console.log(`\n🚀 Seeding ${count} analytics events for hub: ${hubId}\n`);
    await mongoose_1.default.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');
    const events = [];
    const variantIds = [`variant-${hubId}-1`, `variant-${hubId}-2`, `variant-${hubId}-3`];
    for (let i = 0; i < count; i++) {
        const sessionId = (0, uuid_1.v4)();
        const timestamp = randomDate(7); // Events from last 7 days
        const deviceType = randomChoice(DEVICE_TYPES);
        const userAgent = randomChoice(USER_AGENTS);
        const location = randomChoice(LOCATIONS);
        const referrer = randomChoice(REFERRERS);
        // Each session: 1 impression, 0-1 click
        events.push({
            event_id: (0, uuid_1.v4)(),
            event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION,
            hub_id: hubId,
            link_id: null,
            variant_id: null,
            timestamp,
            session_id: sessionId,
            user_agent: userAgent,
            device_type: deviceType,
            coarse_location: location,
            referrer,
            metadata: {}
        });
        // ~60% of impressions result in a click
        if (Math.random() < 0.6) {
            const variantId = randomChoice(variantIds);
            events.push({
                event_id: (0, uuid_1.v4)(),
                event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK,
                hub_id: hubId,
                link_id: variantId,
                variant_id: variantId,
                timestamp: new Date(timestamp.getTime() + Math.random() * 30000), // Click within 30s
                session_id: sessionId,
                user_agent: userAgent,
                device_type: deviceType,
                coarse_location: location,
                referrer,
                metadata: {}
            });
        }
    }
    console.log(`📊 Generated ${events.length} events (${count} impressions)`);
    // Bulk insert
    const result = await AnalyticsEvent_1.AnalyticsEvent.insertMany(events, { ordered: false });
    console.log(`✅ Inserted ${result.length} events into database`);
    // Show summary
    const impressions = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.HUB_IMPRESSION });
    const clicks = await AnalyticsEvent_1.AnalyticsEvent.countDocuments({ hub_id: hubId, event_type: AnalyticsEvent_1.AnalyticsEventType.LINK_CLICK });
    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0';
    console.log(`\n📈 Analytics Summary for ${hubId}:`);
    console.log(`   Total Impressions: ${impressions}`);
    console.log(`   Total Clicks: ${clicks}`);
    console.log(`   CTR: ${ctr}%`);
    console.log(`\n✨ Done! Refresh your Analysis Page to see the data.\n`);
    await mongoose_1.default.disconnect();
}
// CLI interface
const hubId = process.argv[2];
const count = parseInt(process.argv[3]) || 100;
if (!hubId) {
    console.error('❌ Usage: npx ts-node src/scripts/seedAnalytics.ts <hubId> [count]');
    console.error('   Example: npx ts-node src/scripts/seedAnalytics.ts my-hub-id 500');
    process.exit(1);
}
seedAnalytics(hubId, count).catch(console.error);
//# sourceMappingURL=seedAnalytics.js.map