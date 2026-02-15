
import mongoose from 'mongoose';
import { VariantStats } from '../models/VariantStats';
import { redis } from '../config/database';
import { config } from 'dotenv';
import path from 'path';

// Load env vars
config({ path: path.join(__dirname, '../../.env') });

async function testClickStats() {
    try {
      console.log('Connecting to MongoDB...');
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/advitiya_h');
      
      const hubId = 'test-hub-' + Date.now();
      const variantId = 'test-variant-' + Date.now();
      
      console.log('Testing with', { hubId, variantId });
      
      // Simulate logic from redirect.ts /api/analytics/click
      console.log('Simulating click update...');
      const stats = await VariantStats.findOneAndUpdate(
          { variant_id: variantId, hub_id: hubId },
          {
              $inc: { clicks: 1, recent_clicks_hour: 1 },
              $set: { last_updated: new Date() }
          },
          { upsert: true, new: true }
      );
      
      console.log('Stats after 1st update:', stats);
      
      if (!stats) {
          console.error('FAILURE: Stats is null');
          return;
      }

      if (stats.clicks !== 1) {
          console.error('FAILURE: Stats clicks should be 1, got ' + stats.clicks);
      } else {
           console.log('SUCCESS: Click count 1 verified.');
      }
      
      // Update again
      const stats2 = await VariantStats.findOneAndUpdate(
          { variant_id: variantId, hub_id: hubId },
          {
              $inc: { clicks: 1, recent_clicks_hour: 1 },
              $set: { last_updated: new Date() }
          },
          { upsert: true, new: true }
      );
       console.log('Stats after 2nd update:', stats2);
       
       if (stats2 && stats2.clicks === 2) {
           console.log('SUCCESS: Click count 2 verified.');
       } else {
           console.error('FAILURE: Click count 2 failed.');
       }
       
       // Cleanup
       await VariantStats.deleteOne({ variant_id: variantId, hub_id: hubId });
       console.log('Cleanup done.');

    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await mongoose.disconnect();
        // Redis might invoke an active handle so we force exit if needed, but let's try clean.
        // Importing redis config might initialize it.
        // Usually redis.disconnect() or quit() is needed.
        if (redis) {
             try {
                await redis.quit();
             } catch (e) {
                 // ignore
             }
        }
        process.exit(0);
    }
}

testClickStats();
