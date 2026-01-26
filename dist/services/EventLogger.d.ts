import { EventType } from '../models/Event';
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
export declare class EventLogger {
    /**
     * Log an impression event (variant resolved, before redirect)
     */
    logImpression(event: Omit<IEventContext, 'event_type'>): void;
    /**
     * Log a click event (redirect executed)
     */
    logClick(event: Omit<IEventContext, 'event_type'>): void;
    /**
     * Log a hub view event (profile page loaded)
     */
    logHubView(event: Omit<IEventContext, 'event_type' | 'chosen_variant_id' | 'lat' | 'lon'>): void;
    /**
     * Log an event asynchronously (non-blocking)
     * Pushes to Redis list for background worker consumption
     */
    logEvent(event: IEventContext): void;
    /**
     * Push event to Redis list
     */
    private pushEvent;
    /**
     * Get the number of pending events in the stream
     */
    getPendingCount(): Promise<number>;
    /**
     * Pop an event from the stream (for worker consumption)
     * Uses BRPOP for blocking wait
     */
    popEvent(timeoutSeconds?: number): Promise<IEventContext | null>;
    /**
     * Pop multiple events from the stream (batch processing)
     */
    popEvents(count: number): Promise<IEventContext[]>;
    /**
     * Clear all events from the stream (for testing)
     */
    clearStream(): Promise<void>;
}
export declare const eventLogger: EventLogger;
//# sourceMappingURL=EventLogger.d.ts.map