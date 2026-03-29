# NixPanel License Server

Standalone Express server that validates NixPanel Pro license keys. Deployed at `license.nixpanel.io`.

## Setup

```bash
cd license-server
cp .env.example .env
# Edit .env - set a strong ADMIN_API_KEY
npm install
npm start
```

## Creating Licenses

```bash
curl -X POST https://license.nixpanel.io/admin/licenses \
  -H "X-Admin-Key: your_admin_key" \
  -H "Content-Type: application/json" \
  -d '{"email": "customer@example.com", "plan": "pro"}'
```

Plans: `pro` (1 server), `team` (5 servers), `agency` (999 servers)

Optional fields: `expires_at` (ISO date), `max_servers` (override), `notes`

## Admin API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/licenses | List all licenses |
| POST | /admin/licenses | Create a new license |
| DELETE | /admin/licenses/:key | Revoke a license |
| GET | /admin/licenses/:key/servers | List servers for a license |
| GET | /admin/events | Recent license events |
| POST | /admin/seed | Seed test data (dev only) |

All admin endpoints require `X-Admin-Key: <key>` header.

## Validation API

| Method | Path | Description |
|--------|------|-------------|
| POST | /validate | Validate a license key |
| POST | /activate | Activate a license on a server |
| POST | /deactivate | Deactivate a license from a server |
| GET | /health | Health check |

## Deployment

Designed to run on a lightweight VPS. Use nginx as a reverse proxy with SSL (Let's Encrypt). Runs on port 4000 by default.

```nginx
server {
    server_name license.nixpanel.io;
    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Offline Mode

NixPanel clients gracefully handle license server unreachability by activating in optimistic offline mode. Keys are stored locally and validated when connectivity is restored.
