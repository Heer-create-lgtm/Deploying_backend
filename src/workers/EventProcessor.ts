import { eventLogger, IEventContext } from '../services/EventLogger';
import { Event } from '../models/Event';

/**
 * Event Processor Worker
 * Continuously consumes events from the event_stream and persists them to MongoDB
 */
export class EventProcessor {
    private isRunning = false;
    private batchSize = 100;
    private processingInterval = 1000; // 1 second between batch checks

    /**
     * Start the event processor
     */
    async start(): Promise<void> {
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
    stop(): void {
        this.isRunning = false;
        console.log('Event processor stopped');
    }

    /**
     * Process a batch of events
     */
    private async processBatch(): Promise<void> {
        try {
            // Pop events from the stream
            const events = await eventLogger.popEvents(this.batchSize);

            if (events.length === 0) {
                return;
            }

            console.log(`Processing ${events.length} events...`);

            // Convert to MongoDB documents (now includes event_type)
            const documents = events.map((event: IEventContext) => ({
                hub_id: event.hub_id,
                event_type: event.event_type,  // CRITICAL: Include event_type
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
            await Event.insertMany(documents, { ordered: false });

            console.log(`✓ Persisted ${events.length} events to database`);
        } catch (error) {
            console.error('Error processing events:', error);
        }
    }

    /**
     * Sleep helper
     */
    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Get the current queue size
     */
    async getQueueSize(): Promise<number> {
        return eventLogger.getPendingCount();
    }
}

// Singleton instance
export const eventProcessor = new EventProcessor();
