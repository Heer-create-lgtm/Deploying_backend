"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.statsAggregator = exports.eventProcessor = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const database_1 = require("../config/database");
const EventProcessor_1 = require("./EventProcessor");
Object.defineProperty(exports, "eventProcessor", { enumerable: true, get: function () { return EventProcessor_1.eventProcessor; } });
const StatsAggregator_1 = require("./StatsAggregator");
Object.defineProperty(exports, "statsAggregator", { enumerable: true, get: function () { return StatsAggregator_1.statsAggregator; } });
/**
 * Worker Entry Point
 * Starts both the event processor and stats aggregator
 */
async function main() {
    console.log('Starting workers...');
    // Connect to databases
    await (0, database_1.connectMongoDB)();
    // Start workers
    StatsAggregator_1.statsAggregator.start();
    // Start event processor (runs in a loop)
    EventProcessor_1.eventProcessor.start();
    // Graceful shutdown
    const shutdown = async () => {
        console.log('\nShutting down workers...');
        EventProcessor_1.eventProcessor.stop();
        StatsAggregator_1.statsAggregator.stop();
        await (0, database_1.closeConnections)();
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
main().catch((error) => {
    console.error('Worker failed to start:', error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map