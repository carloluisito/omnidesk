# ClaudeDesk Docker Deployment

This directory contains everything you need to deploy ClaudeDesk using Docker and Docker Compose.

## Quick Start

### Prerequisites

- Docker Engine 20.10 or higher
- Docker Compose 2.0 or higher
- At least 1GB of available RAM
- At least 5GB of available disk space

### Installation

1. **Copy the environment file**

   ```bash
   cd deploy
   cp .env.example .env
   ```

2. **Configure your environment** (optional)

   Edit `.env` to customize settings:
   - `CLAUDEDESK_PORT` - Change the port (default: 8787)
   - `ALLOW_REMOTE` - Enable remote access (default: false)

3. **Start the services**

   ```bash
   docker compose up -d
   ```

4. **Access ClaudeDesk**

   Open your browser to: http://localhost:8787

5. **View logs**

   ```bash
   docker compose logs -f claudedesk
   ```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLAUDEDESK_PORT` | No | 8787 | Port for web interface |
| `ALLOW_REMOTE` | No | false | Allow remote network access (0.0.0.0) |
| `GITHUB_CLIENT_ID` | No | - | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | - | GitHub OAuth client secret |
| `GITLAB_CLIENT_ID` | No | - | GitLab OAuth client ID |
| `GITLAB_CLIENT_SECRET` | No | - | GitLab OAuth client secret |
| `ANTHROPIC_API_KEY` | No | - | Anthropic API key for Claude |

> **Note:** The `docker-compose.yml` includes PostgreSQL and Redis services for future features, but they are not currently used by ClaudeDesk. You can safely ignore the `POSTGRES_PASSWORD` variable or remove those services from the compose file.

### Custom Configuration

For local development or custom deployments, create a `docker-compose.override.yml` file:

```bash
cp docker-compose.override.yml.example docker-compose.override.yml
```

Edit `docker-compose.override.yml` to customize:
- Build from local source instead of pulling from registry
- Mount local directories for development
- Expose additional ports
- Override environment variables

### Minimal Deployment (ClaudeDesk Only)

If you don't need the database services, create a `docker-compose.override.yml`:

```yaml
services:
  postgres:
    profiles: ["disabled"]
  redis:
    profiles: ["disabled"]
  claudedesk:
    depends_on: []
```

Then run:
```bash
docker compose up -d claudedesk
```

## Common Commands

### Start Services

```bash
# Start all services in background
docker compose up -d

# Start with build (if using local Dockerfile)
docker compose up -d --build

# Start and view logs
docker compose up
```

### Stop Services

```bash
# Stop all services
docker compose down

# Stop and remove volumes (CAUTION: deletes all data)
docker compose down -v
```

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f claudedesk
```

### Restart Services

```bash
# Restart all services
docker compose restart

# Restart specific service
docker compose restart claudedesk
```

### Check Status

```bash
# View running services
docker compose ps

# View resource usage
docker stats
```

### Update to Latest Version

```bash
# Pull latest image
docker compose pull

# Restart with new image
docker compose up -d
```

## Data Persistence

ClaudeDesk data is stored in Docker volumes:

| Volume | Purpose | Used |
|--------|---------|------|
| `claudedesk-data` | Application config, sessions, artifacts | Yes |
| `claudedesk-repos` | Git repositories | Yes |
| `postgres-data` | PostgreSQL database | Future |
| `redis-data` | Redis cache | Future |

### Backup

**Backup ClaudeDesk data:**

```bash
# Create backup directory
mkdir -p backups/$(date +%Y%m%d)

# Backup application data
docker run --rm \
  -v claudedesk-data:/data \
  -v $(pwd)/backups/$(date +%Y%m%d):/backup \
  alpine tar czf /backup/claudedesk-data.tar.gz -C /data .

# Backup repositories
docker run --rm \
  -v claudedesk-repos:/data \
  -v $(pwd)/backups/$(date +%Y%m%d):/backup \
  alpine tar czf /backup/claudedesk-repos.tar.gz -C /data .
```

### Restore

```bash
# Stop services first
docker compose down

# Restore application data
docker run --rm \
  -v claudedesk-data:/data \
  -v $(pwd)/backups/20260128:/backup \
  alpine tar xzf /backup/claudedesk-data.tar.gz -C /data

# Restart services
docker compose up -d
```

## Building Docker Image Locally

### Build from Dockerfile

```bash
# From repository root (not deploy directory)
cd ..
docker build -t claudedesk:local .

# Test the local image
docker run -p 8787:8787 claudedesk:local
```

### Build with docker compose

Create `docker-compose.override.yml`:

```yaml
services:
  claudedesk:
    build:
      context: ..
      dockerfile: Dockerfile
    image: claudedesk:local
```

Then run:

```bash
docker compose up -d --build
```

## Networking

### Local Access Only (Default)

By default, ClaudeDesk is only accessible from localhost:

```bash
ALLOW_REMOTE=false
```

Access at: http://localhost:8787

### Remote Access (Use with Caution)

To allow access from other machines on your network:

```bash
ALLOW_REMOTE=true
```

**Security Warning:** This exposes ClaudeDesk to your entire network. Only use in trusted environments. Consider using the built-in tunnel feature for secure remote access instead.

### Custom Domain with Reverse Proxy

For production deployments with SSL, use a reverse proxy like Nginx or Traefik:

**Example Nginx configuration:**

```nginx
server {
    listen 80;
    server_name claudedesk.example.com;

    location / {
        proxy_pass http://localhost:8787;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket support
    location /ws {
        proxy_pass http://localhost:8787/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
    }
}
```

## Health Checks

### Check ClaudeDesk Health

```bash
curl http://localhost:8787/api/health
```

Expected response:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "3.0.0",
    "uptime": 12345,
    "timestamp": "2026-01-28T12:00:00.000Z"
  }
}
```

### Check Service Status

```bash
docker compose ps
```

Healthy services show `(healthy)` status.

## Troubleshooting

### Services Won't Start

**Check logs:**
```bash
docker compose logs
```

**Common issues:**
- Port 8787 already in use: Change `CLAUDEDESK_PORT` in `.env`
- Insufficient memory: Ensure Docker has at least 1GB RAM allocated
- Permission errors: Ensure Docker has proper permissions

### Can't Access Web Interface

**Verify service is running:**
```bash
docker compose ps
curl http://localhost:8787/api/health
```

**Check firewall:**
- Ensure port 8787 is not blocked
- If using remote access, check network firewall rules

### Out of Disk Space

**Check volume sizes:**
```bash
docker system df -v
```

**Clean up unused resources:**
```bash
# Remove unused containers and images
docker system prune

# Remove unused volumes (CAUTION: may delete data)
docker volume prune
```

### Reset Everything

**Complete reset (CAUTION: deletes all data):**

```bash
# Stop and remove everything
docker compose down -v

# Remove images
docker compose rm -f

# Start fresh
docker compose up -d
```

## Production Recommendations

For production deployments:

1. **Enable SSL** - Use a reverse proxy with Let's Encrypt
2. **Regular backups** - Automate daily backups of the data volume
3. **Monitor resources** - Set up monitoring for CPU, memory, disk
4. **Update regularly** - Keep Docker images up to date
5. **Restrict access** - Use firewall rules and network policies
6. **Use secrets management** - Consider Docker secrets for OAuth credentials
