# Personal Data Vault – Privacy-First API Hub

A full-stack personal data aggregation platform where users can connect their accounts (Spotify, Strava, Google Calendar), sync their data securely, and view insights in a unified dashboard. Built with privacy-first principles: encrypted tokens, one-click export, and full delete capabilities.

![Data Vault](https://img.shields.io/badge/Privacy-First-green) ![React](https://img.shields.io/badge/React-19.0-blue) ![FastAPI](https://img.shields.io/badge/FastAPI-0.110-teal) ![MongoDB](https://img.shields.io/badge/MongoDB-4.5-green)


https://github.com/user-attachments/assets/b1f04878-2901-44e5-9a89-c2d316474179


## Features

### Core Functionality
- **JWT Authentication**: Secure user signup and login with bcrypt password hashing
- **OAuth2 Provider Connections**: Spotify, Strava, Google Calendar
- **Background Data Sync**: Idempotent, cursor-based sync with deduplication
- **Unified Data Schema**: Flexible JSONB-style records in MongoDB
- **AI-Powered Insights**: Optional AI-generated data analysis
- **Privacy-First Exports**: ZIP files with JSON + CSV per dataset
- **Full Data Control**: One-click provider disconnect or account deletion
- **Audit Logging**: Complete transparency of all operations

## Quick Start

### Prerequisites
- Python 3.11+, Node.js 18+, MongoDB
- OAuth credentials from providers

### Installation

```bash
# Backend
cd /app/backend
pip install -r requirements.txt

# Configure OAuth credentials in .env
# Add SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, etc.

# Frontend
cd /app/frontend
yarn install

# Start services
sudo supervisorctl restart all
```

### OAuth Provider Setup

**Spotify**: [Dashboard](https://developer.spotify.com/dashboard)  
**Strava**: [API Settings](https://www.strava.com/settings/api)  
**Google Calendar**: [Cloud Console](https://console.cloud.google.com/)

Add redirect URI: `https://unified-vault.preview.emergentagent.com/oauth/callback/{provider}`

## API Endpoints

- `POST /api/auth/signup` - Create account
- `POST /api/auth/login` - Login
- `GET /api/oauth/{provider}/authorize` - OAuth flow
- `POST /api/sync/{provider}` - Sync data
- `GET /api/records` - Get records
- `GET /api/insights/summary?use_ai=true` - AI insights
- `POST /api/export` - Generate export
- `DELETE /api/account` - Delete account

## Database Schema

**records** (Unified Schema):
```json
{
  "dataset": "tracks|workouts|events",
  "provider": "spotify|strava|google_calendar",
  "body": {
    // Flexible data per provider
  }
}
```

## Security

- Encrypted OAuth tokens (Fernet/AES-256)
- JWT sessions (30-day expiration)
- Per-user data scoping
- No tokens in logs
- Audit trail for all actions

## Testing

```bash
# Test auth
curl -X POST ${BACKEND_URL}/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","name":"Test"}'

# Test sync
curl -X POST ${BACKEND_URL}/api/sync/spotify \
  -H "Authorization: Bearer TOKEN"
```

## Adding New Connectors

1. Add OAuth config to `.env`
2. Add authorization endpoint
3. Create sync function
4. Update frontend provider list

See README for detailed steps.

## Export Format

- JSON + CSV files per dataset
- Schema metadata included
- Zipped and stored in GridFS
- 24-hour signed download links

## Tech Stack

- **Backend**: FastAPI, Motor (async MongoDB), Fernet encryption
- **Frontend**: React 19, React Router, Tailwind CSS, Lucide icons
- **Database**: MongoDB with flexible documents
- **AI**: OpenAI GPT-4o-mini integration
- **Storage**: GridFS for export files
- **Auth**: JWT + OAuth2 + encrypted token storage
