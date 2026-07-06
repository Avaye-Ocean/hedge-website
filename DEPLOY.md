# Hedge Website — VPS Deployment (PM2)

## Prerequisites

| Tool | Required | Install |
|------|----------|---------|
| Node.js | **22.x** (LTS) | `nvm install 22 && nvm use 22` |
| npm | ≥10 | Bundled with Node |
| PM2 | Latest | `npm install -g pm2` |

---

## Quick Setup — provision.sh

From a fresh Ubuntu 22.04/24.04 VPS, run once as root:

```bash
# Clone the repo
git clone https://github.com/Avaye-Ocean/hedge-website.git ~/hedge-website
cd ~/hedge-website

# Run provisioner (idempotent — safe to re-run)
sudo bash provision.sh
```

**What provision.sh does:**
- Installs system packages (curl, git, nginx, ufw, etc.)
- Ensures UFW ports (22, 80, 443) — never deletes existing rules
- Creates deploy user with passwordless sudo
- Installs Node.js LTS via nvm (root + deploy user)
- Installs PM2 globally
- Clones repo, installs deps, builds (`node scripts/build.js`)
- Copies `.env.example` → `.env` (never overwrites)
- Configures Nginx reverse proxies (app + webhook on port 80)
- Starts app + webhook via PM2
- Configures logrotate

---

## Manual PM2 Setup

```bash
# Install dependencies
npm install

# Build (minifies CSS/JS)
npm run build

# Start with PM2
npm run pm2:start
```

## PM2 Names

| Environment | App | Webhook |
|---|---|---|
| dev | `dev-hedge-site` | `dev-hedge-site-hook` |
| stage | `stage-hedge-site` | `stage-hedge-site-hook` |
| prod | `prod-hedge-site` | `prod-hedge-site-hook` |

---

## Port Mapping

| Environment | App Port | Webhook Port | Offset |
|---|---|---|---|
| dev | **6130** | **6134** | +0 |
| stage | **6251** | **6255** | +121 |
| production | **6281** | **6285** | +151 |

Set via `DEPLOY_ENV` in `.env` or `provision.sh`.

---

## GitHub Webhook

The webhook listener (`github-hook.js`) watches for pushes and auto-deploys.

### GitHub Setup
1. Go to repo → Settings → Webhooks → Add webhook
2. Payload URL: `https://hook-dev-site.hedgewears.com/webhook`
3. Content type: `application/json`
4. Secret: same as `GITHUB_WEBHOOK_SECRET` in `.env`
5. Events: Just the **push** event

### How it works
1. GitHub sends push event → webhook listener on `WEBHOOK_PORT`
2. Verifies HMAC signature
3. Checks branch matches `DEPLOY_BRANCH`
4. Runs: `git fetch` → `npm install` → `npm run pm2:start` → `pm2 save`

---

## Environment Variables (Deployment)

```bash
# ─── Deployment ─────────────────────────────────────────────────
GITHUB_WEBHOOK_SECRET=     # GitHub webhook HMAC secret
WEBHOOK_PORT=6134          # Webhook listener port
DEPLOY_BRANCH=develop      # Branch to watch for auto-deploy
DEPLOY_ENV=dev             # dev | stage | production (port offset: +0/+121/+151)
```

---

## PM2 Commands

```bash
pm2 status                      # List all processes
pm2 logs dev-hedge-site         # App logs
pm2 logs dev-hedge-site-hook    # Webhook logs
pm2 restart dev-hedge-site      # Restart app
pm2 restart all                 # Restart everything
pm2 save                        # Save process list for resurrection
```

### npm run shortcuts
```bash
npm run pm2:start      # Build + start/restart app + hook + save
npm run pm2:restart    # Alias for pm2:start
```

---

## Nginx Routing

provision.sh creates two Nginx vhosts on port 80 (Cloudflare Flexible SSL):

| Domain | Proxies to |
|---|---|
| `dev-site.hedgewears.com` | `127.0.0.1:6130` (app) |
| `hook-dev-site.hedgewears.com` | `127.0.0.1:6134` (webhook) |

---

## Redeploy After Code Push

```bash
# Full redeploy (rebuild + restart)
sudo bash ~/hedge-website/provision.sh --redeploy

# Or manually:
cd ~/hedge-website
git pull
npm install
npm run build
npm run pm2:start
```

---

## Troubleshooting

```bash
# Check PM2 status
pm2 status

# View webhook logs
pm2 logs dev-hedge-site-hook

# Check webhook health
curl http://localhost:6134/health

# View deployment history
curl http://localhost:6134/deploys

# Check Nginx
nginx -t && systemctl status nginx

# Force re-run provision step
rm /var/tmp/provision-done/step-NN
sudo bash provision.sh
```
