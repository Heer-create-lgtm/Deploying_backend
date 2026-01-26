"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventProcessor = exports.EventProcessor = void 0;
const EventLogger_1 = require("../services/EventLogger");
const Event_1 = require("../models/Event");
/**
 * Event Processor Worker
 * Continuously consumes events from the event_stream and persists them to MongoDB
 */
class EventProcessor {
    isRunning = false;
    batchSize = 100;
    processingInterval = 1000; // 1 second between batch checks
    /**
     * Start the event processor
     */
    async start() {
        if (this.isRunning) {
            console.log('Event processor is already running');
            return;
        }
        this.isRunning = true;
        console.log('✓ Event processor started');
        while (this.isRunning) {
            await this.processBatch();
            await this.sleep(this.processingInterval);
        }
    }
    /**
     * Stop the event processor
     */
    stop() {
        this.isRunning = false;
        console.log('Event processor stopped');
    }
    /**
     * Process a batch of events
     */
    async processBatch() {
        try {
            // Pop events from the stream
            const events = await EventLogger_1.eventLogger.popEvents(this.batchSize);
            if (events.length === 0) {
                return;
            }
            console.log(`Processing ${events.length} events...`);
            // Convert to MongoDB documents (now includes event_type)
            const documents = events.map((event) => ({
                hub_id: event.hub_id,
                event_type: event.event_type, // CRITICAL: Include event_type
                ip: event.ip,
                country: event.country,
                lat: event.lat,
                lon: event.lon,
                user_agent: event.user_agent,
                device_type: event.device_type,
                timestamp: event.timestamp,
                chosen_variant_id: event.chosen_variant_id,
                processed: false,
            }));
            // Bulk insert to MongoDB
            await Event_1.Event.insertMany(documents, { ordered: false });
            console.log(`✓ Persisted ${events.length} events to database`);
        }
        catch (error) {
            console.error('Error processing events:', error);
        }
    }
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
    /**
     * Get the current queue size
     */
    async getQueueSize() {
        return EventLogger_1.eventLogger.getPendingCount();
    }
}
exports.EventProcessor = EventProcessor;
// Singleton instance
exports.eventProcessor = new EventProcessor();
//# sourceMappingURL=EventProcessor.js.map