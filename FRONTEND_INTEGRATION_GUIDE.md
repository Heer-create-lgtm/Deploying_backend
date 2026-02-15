# Smart Link Hub - Backend Explanation & Frontend Integration Guide

> **Document Purpose**: This guide provides frontend developers with a complete understanding of the Smart Link Hub backend architecture, data models, API contracts, and integration requirements. No backend context is assumed.

---

## Table of Contents

1. [Backend Overview](#section-1-backend-overview)
2. [Data Model Explanation](#section-2-data-model-explanation)
3. [Analytics Model](#section-3-analytics-model)
4. [API Contract Documentation](#section-4-api-contract-documentation)
5. [Frontend Requirements](#section-5-frontend-requirements)
6. [Frontend Integration Rules](#section-6-frontend-integration-rules)
7. [Common Integration Pitfalls](#section-7-common-integration-pitfalls)

---

## Section 1: Backend Overview

### Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | ≥18.0.0 |
| Language | TypeScript | 5.3.x |
| Web Framework | Express.js | 4.18.x |
| Primary Database | MongoDB (Mongoose ODM) | 8.0.x |
| Cache & Event Queue | Redis (ioredis) | 5.3.x |
| Authentication | JWT (jsonwebtoken) | 9.0.x |
| Validation | Zod | 4.3.x |
| User-Agent Parsing | ua-parser-js | 1.0.x |
| Time Handling | Luxon | 3.4.x |
| Geo Calculations | geolib | 3.3.x |

### Database Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        MongoDB                               │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────────────┐│
│  │  Users  │ │ LinkHubs│ │ Variants│ │ RuleTrees           ││
│  └─────────┘ └─────────┘ └─────────┘ └─────────────────────┘│
│  ┌─────────┐ ┌─────────────────────┐                        │
│  │ Events  │ │    VariantStats     │                        │
│  └─────────┘ └─────────────────────┘                        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                         Redis                                │
│  ┌─────────────────────┐ ┌─────────────────────────────────┐│
│  │  Rule Tree Cache    │ │      Event Stream Queue         ││
│  │  (TTL: 10s)         │ │      (async logging)            ││
│  └─────────────────────┘ └─────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Core Backend Responsibilities

| Responsibility | Description |
|----------------|-------------|
| **Link Resolution** | Evaluates decision trees to determine the correct redirect URL based on device, location, and time |
| **User Authentication** | JWT-based auth with user registration, login, and token verification |
| **Hub Management** | CRUD operations for link hubs, variants, and rule trees |
| **Event Tracking** | Logs impressions and clicks asynchronously to Redis, processes them into MongoDB |
| **Analytics Aggregation** | Background worker aggregates events every 5 minutes to compute CTR, scores |
| **Rate Limiting** | Protects endpoints (200 req/min for redirects, 100 req/min for admin) |

### What the Backend Does NOT Handle

- **UI rendering** - Frontend is responsible for all user interface
- **CSS/Styling** - No style assets are served
- **Client-side routing** - Backend provides REST APIs only
- **Real-time push updates** - No WebSocket/SSE support
- **File uploads** - No file storage capabilities
- **Email/Notifications** - No notification services

---

## Section 2: Data Model Explanation

### 2.1 Users

**Purpose**: Stores registered user accounts for authentication and hub ownership.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `user_id` | string | Yes | Unique UUID identifier |
| `email` | string | Yes | Unique, lowercase, indexed |
| `password_hash` | string | Yes | bcrypt hash (not returned in queries) |
| `role` | enum | No | `'user'` (default) or `'admin'` |
| `name` | string | No | Display name |
| `created_at` | Date | Auto | Creation timestamp |
| `updated_at` | Date | Auto | Last modification timestamp |

**Constraints**:
- `user_id` is unique
- `email` is unique and stored lowercase
- `password_hash` is excluded from default query results (`select: false`)

**Frontend Mapping**: User data is returned after login/register. Store the `token` for authenticated requests.

---

### 2.2 LinkHubs (Hubs)

**Purpose**: A hub is a container for a short link (slug) that routes to different URLs based on rules.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hub_id` | string | Yes | Unique identifier for the hub |
| `slug` | string | Yes | URL-friendly short code (e.g., `my-campaign`) |
| `default_url` | string | Yes | Fallback URL when no rules match |
| `theme` | object | Yes | Contains `bg` and `accent` color strings |
| `rule_tree_id` | ObjectId | No | Reference to the active RuleTree |
| `owner_user_id` | string | No | User who owns this hub |
| `created_at` | Date | Auto | Creation timestamp |
| `updated_at` | Date | Auto | Last modification timestamp |

**Theme Schema**:
```json
{
  "bg": "#1a1a2e",
  "accent": "#00ff88"
}
```

**Constraints**:
- Both `hub_id` and `slug` must be unique
- `owner_user_id` determines access permissions

**Frontend Mapping**: When creating a hub, provide `hub_id`, `slug`, `default_url`, and `theme`. The backend assigns ownership automatically based on the authenticated user.

---

### 2.3 Variants

**Purpose**: A variant represents a possible redirect destination within a hub.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `variant_id` | string | Yes | Unique identifier |
| `hub_id` | string | Yes | Parent hub reference |
| `target_url` | string | Yes | Destination URL for this variant |
| `priority` | number | No | Higher = preferred (default: 0) |
| `weight` | number | No | For weighted-random selection (default: 1) |
| `enabled` | boolean | No | Whether variant is active (default: true) |
| `conditions` | object | No | Optional targeting conditions |
| `created_at` | Date | Auto | Creation timestamp |
| `updated_at` | Date | Auto | Last modification timestamp |

**Conditions Schema** (all optional):
```json
{
  "device_types": ["mobile", "desktop"],
  "countries": ["US", "IN", "GB"],
  "time_windows": [
    {
      "branch_id": "weekday_hours",
      "recurring": {
        "days": [1, 2, 3, 4, 5],
        "start_time": "09:00",
        "end_time": "17:00",
        "timezone": "America/New_York"
      }
    }
  ]
}
```

**Constraints**:
- `variant_id` is globally unique
- `weight` must be ≥ 0

**Frontend Mapping**: Variants are created per-hub. The priority and weight affect resolution when multiple variants match.

---

### 2.4 RuleTrees

**Purpose**: A decision tree that evaluates request context to select which variants to consider.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable name |
| `hub_id` | string | Yes | Parent hub reference |
| `root` | object | Yes | Root decision node (recursive structure) |
| `version` | number | No | Auto-incremented on update (default: 1) |
| `created_at` | Date | Auto | Creation timestamp |
| `updated_at` | Date | Auto | Last modification timestamp |

**Decision Node Types**:

| Type | Description | Branches |
|------|-------------|----------|
| `device` | Routes based on device type | `device_branches` map (mobile/desktop/tablet/default) |
| `location` | Routes based on country | `country_branches` map + optional geo fallbacks |
| `time` | Routes based on time windows | `time_windows` array + `time_default_node` |
| `leaf` | Terminal node | `variant_ids` array |

**Example Tree Structure**:
```json
{
  "type": "device",
  "device_branches": {
    "mobile": {
      "type": "leaf",
      "variant_ids": ["variant-mobile-1"]
    },
    "default": {
      "type": "leaf",
      "variant_ids": ["variant-desktop-1"]
    }
  }
}
```

**Evaluation Order**: `device → location → time`

**Frontend Mapping**: Create/update trees via `PUT /api/admin/hubs/:hub_id/tree`. Trees are versioned automatically.

---

### 2.5 Events

**Purpose**: Stores every impression and click for analytics tracking.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `hub_id` | string | Yes | Which hub this event belongs to |
| `event_type` | enum | Yes | `'impression'` or `'click'` |
| `ip` | string | Yes | Client IP address |
| `country` | string | No | Detected country code (default: 'unknown') |
| `lat` | number | No | Latitude (default: 0) |
| `lon` | number | No | Longitude (default: 0) |
| `user_agent` | string | No | Raw user-agent string |
| `device_type` | string | No | Parsed device type (default: 'unknown') |
| `timestamp` | Date | Auto | When event occurred |
| `chosen_variant_id` | string | Yes | Which variant was selected |
| `processed` | boolean | No | Whether stats worker has processed this (default: false) |

**TTL**: Events are automatically deleted after **90 days**.

**Constraints**:
- Events are **immutable** once created
- `processed` flag is internal (not exposed to frontend)

**Frontend Mapping**: Frontend does NOT create events directly. Events are logged automatically by the backend when users access `/:slug`.

---

### 2.6 VariantStats

**Purpose**: Pre-aggregated analytics metrics per variant, updated every 5 minutes.

| Field | Type | Description |
|-------|------|-------------|
| `variant_id` | string | Reference to variant |
| `hub_id` | string | Parent hub |
| `clicks` | number | Total click count |
| `impressions` | number | Total impression count |
| `ctr` | number | Click-through rate (clicks / impressions) |
| `score` | number | Computed ranking score for variant resolution |
| `recent_clicks_hour` | number | Clicks in the last 60 minutes (rolling) |
| `last_updated` | Date | When stats were last computed |

**Constraints**:
- `variant_id` is unique
- All numeric fields default to 0

**Frontend Mapping**: Retrieve stats via `GET /api/admin/hubs/:hub_id/stats`. Never compute these values client-side.

---

## Section 3: Analytics Model

### Impressions vs. Clicks

| Event Type | When Logged | What It Means |
|------------|-------------|---------------|
| `impression` | Variant is resolved (before redirect) | The link was accessed and a variant was selected |
| `click` | Redirect is executed (HTTP 302) | The user followed through to the destination |

> [!IMPORTANT]
> Both events are logged for every successful redirect. This enables meaningful CTR calculation.

### Event Type Values

```typescript
type EventType = 'impression' | 'click';
```

### How Events Are Stored

1. **Immediate**: Events are pushed to a Redis list (`event_stream`) asynchronously (fire-and-forget)
2. **Background Worker**: A worker polls Redis every 5 minutes
3. **Persistence**: Events are persisted to MongoDB and marked `processed: true`
4. **Stats Update**: `VariantStats` are recalculated for affected variants

### Stats Aggregation Process

```
┌─────────────┐     ┌───────────────┐     ┌─────────────────┐
│ User visits │ ──▶ │ Redis Stream  │ ──▶ │  Background     │
│   /:slug    │     │ (event_stream)│     │  Worker (5min)  │
└─────────────┘     └───────────────┘     └────────┬────────┘
                                                   │
                    ┌──────────────────────────────┘
                    ▼
         ┌────────────────────┐     ┌─────────────────┐
         │ MongoDB: Events    │ ──▶ │ VariantStats    │
         │ (mark processed)   │     │ (recalculate)   │
         └────────────────────┘     └─────────────────┘
```

### CTR Calculation

```
CTR = clicks / impressions
```

- If `impressions = 0`, then `CTR = 0`
- CTR is always between 0 and 1
- CTR is calculated **server-side only**

### Why Frontend Must Not Calculate Analytics

| Reason | Explanation |
|--------|-------------|
| **Data Freshness** | Stats are aggregated every 5 minutes; raw events may not reflect current state |
| **Consistency** | Central source of truth prevents discrepancies |
| **Scoring Algorithm** | Backend uses CTR + recency + volume in a specific formula |
| **Event Processing** | Unprocessed events aren't counted yet |

---

## Section 4: API Contract Documentation

### Base URL

```
http://localhost:3000
```

### Authentication

Protected endpoints require a JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens are obtained via `/api/auth/login` or `/api/auth/register`.

---

### 4.1 Authentication Endpoints

#### POST /api/auth/register

**Description**: Create a new user account.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123",
  "name": "John Doe"  // optional
}
```

**Validation**:
- `email`: Required, valid email format
- `password`: Required, minimum 8 characters
- `name`: Optional, 1-100 characters

**Success Response** (201):
```json
{
  "user": {
    "user_id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": "7d"
}
```

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 400 | Validation errors | Invalid email or password too short |
| 409 | `Email already registered` | Duplicate email |
| 500 | `Registration failed` | Server error |

---

#### POST /api/auth/login

**Description**: Authenticate and receive a JWT token.

**Rate Limit**: 5 attempts per 15 minutes per IP.

**Request Body**:
```json
{
  "email": "user@example.com",
  "password": "securepassword123"
}
```

**Success Response** (200):
```json
{
  "user": {
    "user_id": "uuid-string",
    "email": "user@example.com",
    "name": "John Doe",
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_in": "7d"
}
```

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 400 | Validation errors | Invalid input format |
| 401 | `Invalid email or password` | Wrong credentials |
| 429 | Rate limit exceeded | Too many login attempts |
| 500 | `Login failed` | Server error |

---

#### GET /api/auth/me

**Description**: Get the current authenticated user's info.

**Authentication**: Required

**Success Response** (200):
```json
{
  "user_id": "uuid-string",
  "email": "user@example.com",
  "name": "John Doe",
  "role": "user",
  "created_at": "2024-01-15T10:00:00.000Z"
}
```

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 401 | `No token provided` / `Invalid or expired token` | Missing or bad token |
| 404 | `User not found` | User was deleted |

---

#### GET /api/auth/verify

**Description**: Verify if current token is valid.

**Authentication**: Required

**Success Response** (200):
```json
{
  "valid": true,
  "user": {
    "user_id": "uuid-string",
    "email": "user@example.com",
    "role": "user"
  }
}
```

---

### 4.2 Hub Management Endpoints

#### GET /api/admin/hubs

**Description**: List all hubs owned by the current user (admins see all).

**Authentication**: Required

**Success Response** (200):
```json
[
  {
    "hub_id": "hub001",
    "slug": "my-campaign",
    "default_url": "https://example.com",
    "theme": { "bg": "#1a1a2e", "accent": "#00ff88" },
    "owner_user_id": "uuid-string",
    "created_at": "2024-01-15T10:00:00.000Z",
    "updated_at": "2024-01-15T10:00:00.000Z"
  }
]
```

---

#### POST /api/admin/hubs

**Description**: Create a new hub.

**Authentication**: Required

**Request Body**:
```json
{
  "hub_id": "hub001",
  "slug": "my-campaign",
  "default_url": "https://example.com/fallback",
  "theme": {
    "bg": "#1a1a2e",
    "accent": "#00ff88"
  }
}
```

**Validation**:
- All fields are required
- `hub_id` and `slug` must be unique

**Success Response** (201):
```json
{
  "_id": "...",
  "hub_id": "hub001",
  "slug": "my-campaign",
  "default_url": "https://example.com/fallback",
  "theme": { "bg": "#1a1a2e", "accent": "#00ff88" },
  "owner_user_id": "uuid-string",
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 400 | `Missing required fields...` | Incomplete request |
| 409 | `Hub with this ID or slug already exists` | Duplicate |
| 500 | `Failed to create hub` | Server error |

---

#### GET /api/admin/hubs/:hub_id

**Description**: Get a specific hub by ID.

**Authentication**: Required + Ownership

**URL Parameters**: `hub_id` - The hub identifier

**Success Response** (200):
```json
{
  "hub_id": "hub001",
  "slug": "my-campaign",
  "default_url": "https://example.com",
  "theme": { "bg": "#1a1a2e", "accent": "#00ff88" },
  "owner_user_id": "uuid-string",
  "created_at": "...",
  "updated_at": "..."
}
```

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 401 | `No token provided` | Not authenticated |
| 403 | `Access denied: you do not own this hub` | Not owner/admin |
| 404 | `Hub not found` | Invalid hub_id |

---

#### PUT /api/admin/hubs/:hub_id

**Description**: Update a hub's slug, default_url, or theme.

**Authentication**: Required + Ownership

**Request Body** (all optional):
```json
{
  "slug": "new-campaign-slug",
  "default_url": "https://new-url.com",
  "theme": { "bg": "#000", "accent": "#fff" }
}
```

**Success Response** (200): Updated hub object.

---

#### DELETE /api/admin/hubs/:hub_id

**Description**: Delete a hub and all associated data (rule trees, variants, stats).

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "message": "Hub deleted successfully"
}
```

---

### 4.3 Rule Tree Endpoints

#### PUT /api/admin/hubs/:hub_id/tree

**Description**: Create or update the rule tree for a hub. Version is auto-incremented.

**Authentication**: Required + Ownership

**Request Body**:
```json
{
  "name": "Main Decision Tree",
  "root": {
    "type": "device",
    "device_branches": {
      "mobile": {
        "type": "leaf",
        "variant_ids": ["variant-mobile-1"]
      },
      "default": {
        "type": "leaf",
        "variant_ids": ["variant-desktop-1"]
      }
    }
  }
}
```

**Success Response** (200):
```json
{
  "message": "Rule tree updated",
  "version": 2,
  "ruleTree": { ... }
}
```

---

#### GET /api/admin/hubs/:hub_id/tree

**Description**: Get the current rule tree with cache info.

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "ruleTree": {
    "name": "Main Decision Tree",
    "hub_id": "hub001",
    "root": { ... },
    "version": 2,
    "created_at": "...",
    "updated_at": "..."
  },
  "cache": {
    "cached": true,
    "ttl_seconds": 8
  }
}
```

---

#### POST /api/admin/hubs/:hub_id/tree/invalidate

**Description**: Manually invalidate the cache for this hub's rule tree.

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "message": "Cache invalidated"
}
```

---

### 4.4 Variant Endpoints

#### POST /api/admin/hubs/:hub_id/variants

**Description**: Create a new variant for a hub.

**Authentication**: Required + Ownership

**Request Body**:
```json
{
  "variant_id": "variant-001",
  "target_url": "https://landing-page.com",
  "priority": 10,
  "weight": 1,
  "enabled": true,
  "conditions": {
    "device_types": ["mobile"],
    "countries": ["US", "CA"]
  }
}
```

**Required Fields**: `variant_id`, `target_url`

**Success Response** (201): Created variant object.

**Error Responses**:
| Status | Error | Cause |
|--------|-------|-------|
| 404 | `Hub not found` | Invalid hub_id |
| 409 | `Variant with this ID already exists` | Duplicate variant_id |

---

#### GET /api/admin/hubs/:hub_id/variants

**Description**: List all variants for a hub, sorted by priority (descending).

**Authentication**: Required + Ownership

**Success Response** (200):
```json
[
  {
    "variant_id": "variant-001",
    "hub_id": "hub001",
    "target_url": "https://landing-page.com",
    "priority": 10,
    "weight": 1,
    "enabled": true,
    "conditions": { ... },
    "created_at": "...",
    "updated_at": "..."
  }
]
```

---

#### PUT /api/admin/hubs/:hub_id/variants/:variant_id

**Description**: Update a variant.

**Authentication**: Required + Ownership

**Request Body** (all optional):
```json
{
  "target_url": "https://new-url.com",
  "priority": 20,
  "weight": 2,
  "enabled": false,
  "conditions": { }
}
```

**Success Response** (200): Updated variant object.

---

#### DELETE /api/admin/hubs/:hub_id/variants/:variant_id

**Description**: Delete a variant and its stats.

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "message": "Variant deleted successfully"
}
```

---

### 4.5 Analytics Endpoints

#### GET /api/admin/hubs/:hub_id/stats

**Description**: Get aggregated analytics for all variants in a hub.

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "aggregated": {
    "total_clicks": 1500,
    "total_impressions": 5000,
    "average_ctr": 0.30,
    "variant_count": 3
  },
  "variants": [
    {
      "variant_id": "variant-001",
      "hub_id": "hub001",
      "clicks": 800,
      "impressions": 2000,
      "ctr": 0.40,
      "score": 1.25,
      "recent_clicks_hour": 15,
      "last_updated": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

#### POST /api/admin/hubs/:hub_id/stats/aggregate

**Description**: Force immediate stats aggregation (normally runs every 5 minutes).

**Authentication**: Required + Ownership

**Success Response** (200):
```json
{
  "message": "Aggregation completed",
  "stats": [ ... ]
}
```

---

### 4.6 Public Redirect Endpoints

#### GET /:slug

**Description**: Resolve the best variant and redirect (HTTP 302).

**Authentication**: None (public)

**Rate Limit**: 200 requests/minute per IP

**Query Parameters** (optional):
| Parameter | Type | Description |
|-----------|------|-------------|
| `lat` | number | User latitude for geo-targeting |
| `lon` | number | User longitude for geo-targeting |
| `country` | string | Override country detection |

**Headers Used**:
- `User-Agent`: For device detection
- `CF-IPCountry` / `X-Country`: For country detection (from proxies)
- `X-Forwarded-For`: For client IP

**Success Response**: HTTP 302 redirect to resolved URL.

**Error Responses**:
| Status | Response | Cause |
|--------|----------|-------|
| 404 | `{ "error": "Hub not found" }` | Invalid slug |
| 500 | `{ "error": "Internal server error" }` | Server error |

---

#### GET /:slug/debug

**Description**: Debug endpoint showing resolution details **without** redirecting or logging events.

**Authentication**: None (public)

**Success Response** (200):
```json
{
  "hub": {
    "hub_id": "hub001",
    "slug": "my-campaign",
    "default_url": "https://example.com",
    "theme": { "bg": "#1a1a2e", "accent": "#00ff88" }
  },
  "context": {
    "userAgent": "Mozilla/5.0...",
    "country": "US",
    "lat": 0,
    "lon": 0,
    "timestamp": "2024-01-15T10:00:00.000Z",
    "device": {
      "type": "mobile",
      "browser": "Chrome",
      "os": "Android"
    }
  },
  "cache": {
    "cached": true,
    "ttl_seconds": 7
  },
  "resolution": {
    "tree_found": true,
    "leaf_variant_ids": ["variant-mobile-1", "variant-mobile-2"],
    "resolved_variant": {
      "variant_id": "variant-mobile-1",
      "target_url": "https://mobile-landing.com",
      "priority": 10,
      "weight": 1
    },
    "final_url": "https://mobile-landing.com"
  }
}
```

---

### 4.7 Health & Metrics Endpoints

#### GET /health

**Description**: Basic health check.

**Success Response** (200):
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "uptime": 3600.5
}
```

---

#### GET /metrics

**Description**: Prometheus-format metrics for monitoring.

**Content-Type**: `text/plain`

---

## Section 5: Frontend Requirements

### Required Environment Variables

The frontend should configure:

```env
# Backend API URL
VITE_API_BASE_URL=http://localhost:3000

# OR for production
VITE_API_BASE_URL=https://api.yourdomain.com
```

### Required Headers

#### For Authenticated Requests

```javascript
const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`
};
```

#### For Public Requests

```javascript
const headers = {
  'Content-Type': 'application/json'
};
```

### Token Handling

```javascript
// After login/register
const { token, expires_in, user } = await response.json();

// Store securely (httpOnly cookie preferred, or secure localStorage)
localStorage.setItem('auth_token', token);
localStorage.setItem('user', JSON.stringify(user));

// Use in subsequent requests
const token = localStorage.getItem('auth_token');
```

### Expected Response Handling

```javascript
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('auth_token');
  
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Request failed');
  }
  
  return response.json();
}
```

### Error Handling Expectations

| Status Code | Meaning | Frontend Action |
|-------------|---------|-----------------|
| 400 | Validation error | Display field-specific errors |
| 401 | Unauthorized | Clear token, redirect to login |
| 403 | Forbidden | Display "Access denied" message |
| 404 | Not found | Display "Not found" or redirect |
| 409 | Conflict | Display "Already exists" message |
| 429 | Rate limited | Show retry message with countdown |
| 500 | Server error | Show generic error, allow retry |

### CORS Considerations

The backend enables CORS for all origins by default (`app.use(cors())`). In production:
- Only allow your frontend origin
- Credentials are not enabled by default
- Preflight requests are handled automatically

---

## Section 6: Frontend Integration Rules

### ✅ DO

| Rule | Explanation |
|------|-------------|
| **Treat backend as source of truth** | All data (hubs, variants, stats) comes from API responses |
| **Use provided API endpoints** | Don't access MongoDB or Redis directly |
| **Handle all HTTP status codes** | Every request can fail; plan for it |
| **Store token securely** | Use httpOnly cookies or secure storage |
| **Validate forms client-side first** | But rely on backend for final validation |
| **Retry on 5xx errors** | With exponential backoff |
| **Clear auth state on 401** | Token expired or invalid |

### ❌ DO NOT

| Anti-Pattern | Why It's Wrong |
|--------------|----------------|
| **Assume database structure** | Schema may change; use API responses only |
| **Derive analytics locally** | CTR/scores are computed server-side with specific algorithms |
| **Hardcode demo/mock data** | Always fetch from real endpoints |
| **Calculate CTR yourself** | Use `stats.ctr` from API response |
| **Send events manually** | Events are logged automatically on `GET /:slug` |
| **Cache tokens indefinitely** | Respect `expires_in` from login response |
| **Trust client-side auth state** | Always verify with `/api/auth/verify` on reload |

---

## Section 7: Common Integration Pitfalls

### ❌ Pitfall 1: Incorrect Payload Shape

**Wrong**:
```json
{
  "hubId": "hub001",
  "targetUrl": "..."
}
```

**Correct**:
```json
{
  "hub_id": "hub001",
  "target_url": "..."
}
```

> [!CAUTION]
> Field names use **snake_case**, not camelCase.

---

### ❌ Pitfall 2: Assuming Synchronous Writes

Events are logged asynchronously. Stats update every 5 minutes.

**Wrong**: Expecting stats to update immediately after a redirect.

**Correct**: Wait for the aggregation cycle or call `POST /stats/aggregate`.

---

### ❌ Pitfall 3: Double-Tracking Analytics

The backend logs both `impression` and `click` events automatically on `GET /:slug`.

**Wrong**: Calling a separate tracking endpoint from frontend.

**Correct**: Just redirect users to `/:slug` - events are logged server-side.

---

### ❌ Pitfall 4: Misinterpreting event_type

| Value | Meaning |
|-------|---------|
| `impression` | Variant was resolved (link accessed) |
| `click` | Redirect was executed (user followed through) |

**Wrong**: Treating impressions and clicks as the same thing.

**Correct**: Use both for meaningful CTR calculation.

---

### ❌ Pitfall 5: Not Handling Pagination

Currently, the API returns all items without pagination. However:

**Wrong**: Assuming this will always be true.

**Correct**: Design UI to handle future pagination parameters:
```
?page=1&limit=50
```

---

### ❌ Pitfall 6: Ignoring Cache Behavior

Rule trees are cached for 10 seconds in Redis.

**Wrong**: Expecting immediate effect after updating a tree.

**Correct**: Wait up to 10 seconds or call `/tree/invalidate`.

---

### ❌ Pitfall 7: Missing Bearer Prefix

**Wrong**:
```
Authorization: eyJhbGciOiJIUzI1NiIs...
```

**Correct**:
```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

### ❌ Pitfall 8: Not Checking Ownership

Non-admin users can only access hubs they own.

**Wrong**: Assuming all hubs are accessible after login.

**Correct**: Handle 403 errors gracefully for non-owned resources.

---

### ❌ Pitfall 9: Hardcoding hub_id

**Wrong**:
```javascript
const HUB_ID = 'hub001';  // Never change
```

**Correct**: Always use the `hub_id` from API responses.

---

### ❌ Pitfall 10: Ignoring Rate Limits

| Endpoint | Limit |
|----------|-------|
| Redirects | 200/min per IP |
| Admin API | 100/min per IP |
| Login | 5/15min per IP |

**Wrong**: No rate limit handling.

**Correct**:
```javascript
if (response.status === 429) {
  const retryAfter = response.headers.get('Retry-After') || 60;
  showMessage(`Too many requests. Try again in ${retryAfter}s`);
}
```

---

## Quick Reference Card

### API Base Paths

| Prefix | Authentication | Purpose |
|--------|---------------|---------|
| `/api/auth` | None / Required | User authentication |
| `/api/admin` | Required + Ownership | Hub/variant/stats management |
| `/:slug` | None | Public redirects |
| `/health`, `/metrics` | None | Monitoring |

### HTTP Status Codes Summary

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 302 | Redirect |
| 400 | Validation error |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 500 | Server error |

### Authentication Flow

```
[Register/Login] → [Receive Token] → [Store Token] → [Include in Headers] → [Access Protected Routes]
```

---

> **Document Version**: 1.0.0  
> **Last Updated**: 2024-01-24  
> **Backend Version**: 1.0.0
