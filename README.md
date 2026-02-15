# Smart Link Hub

A dynamic link routing system with decision trees, variant resolution, Redis caching, and real-time analytics.

## Features

- **Decision Tree Engine** - Route users based on device type, location (country, polygon, radius), and time (timezone-aware windows)
- **Variant Resolution** - Score-based ranking with priority tie-breaking and weighted random selection
- **Redis Caching** - 10-second TTL with automatic cache invalidation on admin edits
- **Async Event Logging** - Non-blocking event capture to Redis stream
- **Background Workers** - Event persistence and 5-minute stats aggregation

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│  Decision   │────▶│   Variant   │
│   Context   │     │    Tree     │     │  Resolver   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    │
                    ┌──────▼──────┐      ┌──────▼──────┐
                    │    Redis    │      │   MongoDB   │
                    │   Cache     │      │   Stats     │
                    └─────────────┘      └─────────────┘
                                                │
                    ┌─────────────┐      ┌──────▼──────┐
                    │   Event     │◀─────│  Background │
                    │   Stream    │      │   Worker    │
                    └─────────────┘      └─────────────┘
```

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB
- Redis

### Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env with your MongoDB and Redis connection details
```

### Seed Data

```bash
# Seed hub_001 with sample data
npm run seed
```

### Run the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build && npm start
```

### Run Background Workers

```bash
# In a separate terminal
npm run worker
```

## API Endpoints

### Redirect Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:slug` | Resolve and redirect to best URL |
| GET | `/:slug/debug` | Debug resolution without redirecting |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/hubs` | Create a new hub |
| GET | `/api/admin/hubs/:hub_id` | Get hub details |
| PUT | `/api/admin/hubs/:hub_id` | Update hub |
| DELETE | `/api/admin/hubs/:hub_id` | Delete hub |
| PUT | `/api/admin/hubs/:hub_id/tree` | Update rule tree |
| GET | `/api/admin/hubs/:hub_id/tree` | Get rule tree |
| POST | `/api/admin/hubs/:hub_id/tree/invalidate` | Invalidate cache |
| POST | `/api/admin/hubs/:hub_id/variants` | Create variant |
| GET | `/api/admin/hubs/:hub_id/variants` | List variants |
| PUT | `/api/admin/hubs/:hub_id/variants/:variant_id` | Update variant |
| DELETE | `/api/admin/hubs/:hub_id/variants/:variant_id` | Delete variant |
| GET | `/api/admin/hubs/:hub_id/stats` | Get analytics |
| POST | `/api/admin/hubs/:hub_id/stats/aggregate` | Force stats aggregation |

## Decision Tree Structure

The decision tree evaluates in strict order: **device → location → time**

```typescript
// Example tree structure
{
  type: 'device',
  device_branches: {
    mobile: {
      type: 'location',
      country_branches: {
        US: {
          type: 'time',
          time_windows: [{
            branch_id: 'business_hours',
            recurring: {
              days: [1, 2, 3, 4, 5],  // Mon-Fri
              start_time: '09:00',
              end_time: '17:00',
              timezone: 'America/New_York'
            },
            next_node: {
              type: 'leaf',
              variant_ids: ['variant_1', 'variant_2']
            }
          }],
          time_default_node: { type: 'leaf', variant_ids: ['variant_3'] }
        }
      },
      location_default_node: { type: 'leaf', variant_ids: ['variant_4'] }
    },
    desktop: { ... }
  }
}
```

## Variant Resolution

When multiple variants are available, resolution follows:

1. **Score-based ranking** - Precomputed from CTR, clicks, impressions
2. **Priority tie-breaking** - Higher priority wins
3. **Weighted random** - For final ties, proportional to weight

### Score Formula

```
score = (ctr × 0.5) + (log₁₀(clicks + 1) × 0.3) + (log₁₀(impressions + 1) × 0.2)
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `MONGODB_URI` | `mongodb://localhost:27017/smart-link-hub` | MongoDB connection string |
| `REDIS_HOST` | `localhost` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password (optional) |
| `PORT` | `3000` | Server port |
| `RULE_TREE_TTL_SECONDS` | `10` | Redis cache TTL |
| `STATS_AGGREGATION_INTERVAL_MS` | `300000` | Stats update interval (5 min) |

## Project Structure

```
src/
├── config/
│   └── database.ts      # MongoDB and Redis connections
├── models/
│   ├── LinkHub.ts       # Hub configuration
│   ├── RuleTree.ts      # Decision tree structure
│   ├── Variant.ts       # URL variants with conditions
│   ├── VariantStats.ts  # Analytics data
│   └── Event.ts         # Request events
├── services/
│   ├── DecisionTreeEngine.ts  # Tree traversal logic
│   ├── VariantResolver.ts     # Variant selection logic
│   ├── CacheService.ts        # Redis caching
│   └── EventLogger.ts         # Async event logging
├── workers/
│   ├── EventProcessor.ts      # Event persistence
│   └── StatsAggregator.ts     # Stats calculation
├── routes/
│   ├── redirect.ts      # Redirect endpoints
│   └── admin.ts         # Admin CRUD endpoints
├── seed/
│   └── seedHub001.ts    # Initial data seeder
└── index.ts             # Express server entry
```

## License

MIT
