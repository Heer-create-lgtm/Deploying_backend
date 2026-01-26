/**
 * Event Processor Worker
 * Continuously consumes events from the event_stream and persists them to MongoDB
 */
export declare class EventProcessor {
    private isRunning;
    private batchSize;
    private processingInterval;
    /**
     * Start the event processor
     */
    start(): Promise<void>;
    /**
     * Stop the event processor
     */
    stop(): void;
    /**
     * Process a batch of events
     */
    private processBatch;
    /**
     * Sleep helper
     */
    private sleep;
    /**
     * Get the current queue size
     */
    getQueueSize(): Promise<number>;
}
export declare const eventProcessor: EventProcessor;
//# sourceMappingURL=EventProcessor.d.ts.map