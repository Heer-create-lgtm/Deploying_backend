# Smart Link Hub - Backend Deployment

## Prerequisites
- Node.js 18+
- MongoDB (Atlas or self-hosted)
- Redis (optional, uses in-memory fallback)

## Environment Variables

Create a `.env` file with:

```env
# Server
PORT=3001
NODE_ENV=production

# MongoDB
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/smart-link-hub

# Redis (optional)
REDIS_URL=redis://localhost:6379

# JWT Secret (generate a strong random string)
JWT_SECRET=your-super-secret-jwt-key-here

# CORS (frontend URL)
CORS_ORIGIN=https://your-frontend-url.com
```

## Deployment Steps

### For Railway/Render/Fly.io
1. Push this folder to a Git repository
2. Connect to your platform
3. Set all environment variables
4. Deploy

### Manual Deployment
```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Start production server
npm start
```

## Health Check
After deployment, verify:
```
GET /health
```

Should return: `{"status":"ok"}`
