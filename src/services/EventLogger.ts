import { redis } from '../config/database';
import { EventType } from '../models/Event';

const EVENT_STREAM_KEY = 'event_stream';

/**
 * Event context for logging
 */
export interface IEventContext {
    hub_id: string;
    event_type: EventType;
    ip: string;
    country: string;
    lat: number;
    lon: number;
    user_agent: string;
    device_type: string;
    timestamp: Date;
    chosen_variant_id: string;
}

/**
 * Event Logger Service
 * Async, non-blocking event logging to Redis stream
 */
export class EventLogger {

    /**
     * Log an impression event (variant resolved, before redirect)
     */
    logImpression(event: Omit<IEventContext, 'event_type'>): void {
        this.logEvent({ ...event, event_type: 'impression' });
    }

    /**
     * Log a click event (redirect executed)
     */
    logClick(event: Omit<IEventContext, 'event_type'>): void {
        this.logEvent({ ...event, event_type: 'click' });
    }

    /**
     * Log a hub view event (profile page loaded)
     */
    logHubView(event: Omit<IEventContext, 'event_type' | 'chosen_variant_id' | 'lat' | 'lon'>): void {
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
    logEvent(event: IEventContext): void {
        // Fire and forget - don't await
        this.pushEvent(event).catch((error) => {
            console.error('Failed to log event:', error);
        });
    }

    /**
     * Push event to Redis list
     */
    private async pushEvent(event: IEventContext): Promise<void> {
        const eventData = JSON.stringify({
            ...event,
            timestamp: event.timestamp.toISOString(),
        });

        await redis.lpush(EVENT_STREAM_KEY, eventData);
    }

    /**
     * Get the number of pending events in the stream
     */
    async getPendingCount(): Promise<number> {
        return redis.llen(EVENT_STREAM_KEY);
    }

    /**
     * Pop an event from the stream (for worker consumption)
     * Uses BRPOP for blocking wait
     */
    async popEvent(timeoutSeconds: number = 0): Promise<IEventContext | null> {
        const result = await redis.brpop(EVENT_STREAM_KEY, timeoutSeconds);

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
    async popEvents(count: number): Promise<IEventContext[]> {
        const events: IEventContext[] = [];

        for (let i = 0; i < count; i++) {
            const eventData = await redis.rpop(EVENT_STREAM_KEY);

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
    async clearStream(): Promise<void> {
        await redis.del(EVENT_STREAM_KEY);
    }
}

// Singleton instance
export const eventLogger = new EventLogger();
