"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventLogger = exports.EventLogger = void 0;
const database_1 = require("../config/database");
const EVENT_STREAM_KEY = 'event_stream';
/**
 * Event Logger Service
 * Async, non-blocking event logging to Redis stream
 */
class EventLogger {
    /**
     * Log an impression event (variant resolved, before redirect)
     */
    logImpression(event) {
        this.logEvent({ ...event, event_type: 'impression' });
    }
    /**
     * Log a click event (redirect executed)
     */
    logClick(event) {
        this.logEvent({ ...event, event_type: 'click' });
    }
    /**
     * Log a hub view event (profile page loaded)
     */
    logHubView(event) {
        this.logEvent({
            ...event,
            event_type: 'hub_view',
            chosen_variant_id: '',
            lat: 0,
            lon: 0,
        });
    }
    /**
     * Log an event asynchronously (non-blocking)
     * Pushes to Redis list for background worker consumption
     */
    logEvent(event) {
        // Fire and forget - don't await
        this.pushEvent(event).catch((error) => {
            console.error('Failed to log event:', error);
        });
    }
    /**
     * Push event to Redis list
     */
    async pushEvent(event) {
        const eventData = JSON.stringify({
            ...event,
            timestamp: event.timestamp.toISOString(),
        });
        await database_1.redis.lpush(EVENT_STREAM_KEY, eventData);
    }
    /**
     * Get the number of pending events in the stream
     */
    async getPendingCount() {
        return database_1.redis.llen(EVENT_STREAM_KEY);
    }
    /**
     * Pop an event from the stream (for worker consumption)
     * Uses BRPOP for blocking wait
     */
    async popEvent(timeoutSeconds = 0) {
        const result = await database_1.redis.brpop(EVENT_STREAM_KEY, timeoutSeconds);
        if (!result) {
            return null;
        }
        const [, eventData] = result;
        const parsed = JSON.parse(eventData);
        return {
            ...parsed,
            timestamp: new Date(parsed.timestamp),
        };
    }
    /**
     * Pop multiple events from the stream (batch processing)
     */
    async popEvents(count) {
        const events = [];
        for (let i = 0; i < count; i++) {
            const eventData = await database_1.redis.rpop(EVENT_STREAM_KEY);
            if (!eventData) {
                break;
            }
            const parsed = JSON.parse(eventData);
            events.push({
                ...parsed,
                timestamp: new Date(parsed.timestamp),
            });
        }
        return events;
    }
    /**
     * Clear all events from the stream (for testing)
     */
    async clearStream() {
        await database_1.redis.del(EVENT_STREAM_KEY);
    }
}
exports.EventLogger = EventLogger;
// Singleton instance
exports.eventLogger = new EventLogger();
//# sourceMappingURL=EventLogger.js.map