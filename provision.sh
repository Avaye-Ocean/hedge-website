#!/usr/bin/env bash
# ============================================================
# provision.sh — Hedge Site Ubuntu 22.04/24.04 Bootstrap
# ============================================================
#
# Run once as root:  sudo bash provision.sh
# Idempotent — safe to re-run (completed steps auto-skipped).
#
# WHAT IT DOES (12 steps):
#   1.  System update + core packages
#   2.  SSH — NO changes
#   3.  UFW — ensures required ports exist (NEVER deletes or modifies existing rules)
#   4.  Creates deploy user + passwordless sudo
#   5.  Node.js LTS via nvm (root + deploy user)
#   6.  PM2 globally (root + deploy user)
#   7.  Git credentials for deploy user
#   8.  Clone hedge-website + npm install + build
#   9.  .env.example → .env (never overwrites existing)
#   10. Nginx reverse proxies (app + webhook on :80)
#   11. Start apps via PM2 (dev-hedge-site + dev-hedge-site-hook)
#   12. logrotate for PM2 logs
# ============================================================
if [ -z "$BASH_VERSION" ]; then
  echo "ERROR: This script requires bash. Run:  sudo bash provision.sh" >&2
  exit 1
fi
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[FAIL]${NC}  $*" >&2; exit 1; }
skip()  { echo -e "${YELLOW}[SKIP]${NC}  $*"; }

MARKER_DIR="/var/tmp/provision-done"
mkdir -p "$MARKER_DIR"
done_step() { touch "${MARKER_DIR}/step-${1}"; }
is_done()   { [[ -f "${MARKER_DIR}/step-${1}" ]]; }

[[ $EUID -eq 0 ]] || die "Run as root:  sudo bash provision.sh"

# ============================================================
# CONFIG
# ============================================================

DEPLOY_USER="${SUDO_USER:-administrator}"
DEPLOY_HOME=$(sudo -u "$DEPLOY_USER" bash -c 'echo $HOME')

APP_REPO="https://github.com/Avaye-Ocean/hedge-website.git"
APP_DIR="$(sudo -u "$DEPLOY_USER" bash -c 'echo $HOME')/hedge-website"
GIT_USERNAME="Avaye-Ocean"
GIT_EMAIL="kezyolanipekun@gmail.com"
GIT_TOKEN=""

APP_DOMAIN="dev-site.hedgewears.com"
WEBHOOK_DOMAIN="hook-dev-site.hedgewears.com"

SSH_PORT=22

DEPLOY_BRANCH="develop"

DEPLOY_ENV="${DEPLOY_ENV:-dev}"
PORT_OFFSET=0; PM2_ENV_PREFIX="dev"
[[ "$DEPLOY_ENV" == "prod" || "$DEPLOY_ENV" == "main" || "$DEPLOY_ENV" == "production" ]] && { PORT_OFFSET=151; PM2_ENV_PREFIX="prod"; }
[[ "$DEPLOY_ENV" == "stage" || "$DEPLOY_ENV" == "staging" ]] && { PORT_OFFSET=121; PM2_ENV_PREFIX="stage"; }

APP_PORT=$(( 6130 + PORT_OFFSET))
WEBHOOK_PORT=$(( 6134 + PORT_OFFSET))

# ── Resolve public IP ────────────────────────────────────────
info "Resolving server public IP …"
SERVER_IP=$(curl -fsSL --max-time 5 https://api.ipify.org 2>/dev/null \
            || curl -fsSL --max-time 5 https://ifconfig.me 2>/dev/null \
            || hostname -I | awk '{print $1}')
[[ -z "$SERVER_IP" ]] && SERVER_IP="_"

[[ -z "$APP_DOMAIN"     ]] && APP_DOMAIN="$SERVER_IP"
[[ -z "$WEBHOOK_DOMAIN" ]] && WEBHOOK_DOMAIN="$SERVER_IP"

info "Deploy user        : ${DEPLOY_USER}"
info "App directory      : ${APP_DIR}"
info "${PM2_ENV_PREFIX}-hedge-site : ${APP_DOMAIN}:${APP_PORT} (env: ${DEPLOY_ENV})"
info "webhook            : ${WEBHOOK_DOMAIN}:${WEBHOOK_PORT}"
if is_done "01"; then
  warn "Re-running provision — skipping completed steps (markers in ${MARKER_DIR}/)."
  warn "To force a full re-run:  rm -rf ${MARKER_DIR}"
fi
echo ""

# ============================================================
# STEP 1 — System update & core packages
# ============================================================
STEP=01
if is_done "$STEP"; then
  skip "STEP ${STEP}: System packages already installed."
else
  info "STEP ${STEP}: Updating system packages …"
  apt-get update -y -q
  apt-get upgrade -y -q
  apt-get install -y -q \
    curl wget git build-essential ca-certificates \
    gnupg lsb-release ufw software-properties-common \
    unzip jq htop net-tools logrotate
  ok "System packages updated."
  done_step "$STEP"
fi

# STEP 2 — SSH
STEP=02
skip "STEP ${STEP}: SSH hardening skipped (too risky on shared VMs — do it manually if needed)"

# ============================================================
# STEP 3 — UFW — ensure required ports exist (NEVER delete/modify existing rules)
# ============================================================
STEP=03
if is_done "$STEP"; then
  UFW_VERIFIED=true
  for p in 22 "${SSH_PORT}" 80 443; do
    if ! ufw status | grep -q "$p"; then
      UFW_VERIFIED=false
      warn "Port ${p} not open in UFW — will ensure it is added."
      rm -f "${MARKER_DIR}/step-${STEP}"
      break
    fi
  done
  if $UFW_VERIFIED; then
    skip "STEP ${STEP}: Required UFW ports already present."
  fi
fi

if ! is_done "$STEP"; then
  info "STEP ${STEP}: Ensuring required UFW ports are open …"

  # ── ONLY add required ports — NEVER modify defaults or delete existing rules ──
  ufw allow proto tcp to any port 22  comment "SSH (default)" 2>/dev/null || true
  [[ "${SSH_PORT}" != "22" ]] && ufw allow proto tcp to any port "${SSH_PORT}" comment "SSH (custom)" 2>/dev/null || true
  ufw allow proto tcp to any port 80  comment "HTTP (nginx)"  2>/dev/null || true
  ufw allow proto tcp to any port 443 comment "HTTPS (nginx)" 2>/dev/null || true

  ok "Required UFW ports ensured (no existing rules removed or defaults changed)."
  ufw status
  done_step "$STEP"
fi

# ============================================================
# STEP 4 — Passwordless sudo for deploy user
# ============================================================
STEP=04
if is_done "$STEP"; then
  skip "STEP ${STEP}: Passwordless sudo already configured for ${DEPLOY_USER}."
else
  info "STEP ${STEP}: Passwordless sudo for ${DEPLOY_USER} …"
  if ! id -u "$DEPLOY_USER" &>/dev/null; then
    useradd -m -s /bin/bash "$DEPLOY_USER"
    warn "Created new user ${DEPLOY_USER} (no password — SSH key access only)."
  fi
  SUDOERS_FILE="/etc/sudoers.d/99-${DEPLOY_USER}-nopasswd"
  echo "${DEPLOY_USER} ALL=(ALL) NOPASSWD:ALL" > "$SUDOERS_FILE"
  chmod 0440 "$SUDOERS_FILE"
  visudo -cf "$SUDOERS_FILE" || die "sudoers syntax error — aborting."
  ok "Passwordless sudo enabled for ${DEPLOY_USER}."
  done_step "$STEP"
fi

# ============================================================
# STEP 5 — Node.js LTS via nvm
# ============================================================
STEP=05
if is_done "$STEP"; then
  skip "STEP ${STEP}: Node.js already installed."
else
  info "STEP ${STEP}: Installing Node.js LTS via nvm …"
  set +u
  export NVM_DIR="/root/.nvm"
  if [[ -f "$NVM_DIR/nvm.sh" ]]; then
    info "nvm already installed for root — re-using."
  else
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash -
  fi
  source "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
  nvm alias default lts/*
  NODE_BIN_DIR="$(dirname "$(nvm which current)")"
  ln -sf "${NODE_BIN_DIR}/node" /usr/local/bin/node
  ln -sf "${NODE_BIN_DIR}/npm"  /usr/local/bin/npm
  ln -sf "${NODE_BIN_DIR}/npx"  /usr/local/bin/npx
  ln -sf "${NODE_BIN_DIR}/pm2"  /usr/local/bin/pm2

  sudo -u "$DEPLOY_USER" bash <<'USERSCRIPT'
    export NVM_DIR="$HOME/.nvm"
    if [[ -f "$NVM_DIR/nvm.sh" ]]; then
      echo "nvm already installed for deploy user — re-using."
    else
      curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash -
    fi
    set +u
    source "$NVM_DIR/nvm.sh"
    nvm install --lts
    nvm use --lts
    nvm alias default lts/*
    set -u
USERSCRIPT

  DEPLOY_NODE_VERSION=$(sudo -u "$DEPLOY_USER" bash -c '
    export NVM_DIR="$HOME/.nvm"
    set +u; source "$NVM_DIR/nvm.sh" 2>/dev/null; set -u
    nvm which current
  ')
  DEPLOY_BIN_DIR="$(dirname "$DEPLOY_NODE_VERSION")"
  ln -sf "${DEPLOY_BIN_DIR}/node" /usr/local/bin/node
  ln -sf "${DEPLOY_BIN_DIR}/npm"  /usr/local/bin/npm
  ln -sf "${DEPLOY_BIN_DIR}/npx"  /usr/local/bin/npx
  ln -sf "${DEPLOY_BIN_DIR}/pm2"  /usr/local/bin/pm2
  set -u
  ok "Node.js $(node -v) / npm $(npm -v) installed."
  done_step "$STEP"
fi

# ============================================================
# STEP 6 — PM2
# ============================================================
STEP=06
if is_done "$STEP"; then
  skip "STEP ${STEP}: PM2 already installed."
else
  info "STEP ${STEP}: Installing PM2 …"
  npm install -g pm2
  pm2 --version
  sudo -u "$DEPLOY_USER" bash -c '
    export NVM_DIR="$HOME/.nvm"
    set +u; source "$NVM_DIR/nvm.sh"
    npm install -g pm2
  '
  env PATH="$PATH:/usr/local/bin" \
    pm2 startup systemd -u "$DEPLOY_USER" --hp "${DEPLOY_HOME}" || \
    warn "PM2 startup registration may need a manual run — see deployment.md"
  ok "PM2 $(pm2 --version) installed."
  done_step "$STEP"
fi

# ============================================================
# STEP 7 — Git credentials for deploy user
# ============================================================
STEP=07
if is_done "$STEP"; then
  skip "STEP ${STEP}: Git credentials already configured."
else
  info "STEP ${STEP}: Configuring Git credentials for ${DEPLOY_USER} …"
  if [[ -z "$GIT_TOKEN" ]]; then
    echo ""
    warn "GIT_TOKEN not set in script."
    read -rsp "  Paste your GitHub Personal Access Token (hidden input): " GIT_TOKEN
    echo ""
  fi
  sudo -u "$DEPLOY_USER" git config --global user.name  "$GIT_USERNAME"
  sudo -u "$DEPLOY_USER" git config --global user.email "$GIT_EMAIL"
  sudo -u "$DEPLOY_USER" git config --global credential.helper store
  sudo -u "$DEPLOY_USER" git config --global pull.rebase false
  CRED_FILE="${DEPLOY_HOME}/.git-credentials"
  echo "https://${GIT_USERNAME}:${GIT_TOKEN}@github.com" > "$CRED_FILE"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "$CRED_FILE"
  chmod 600 "$CRED_FILE"
  ok "Git credentials stored."
  done_step "$STEP"
fi

# ============================================================
# STEP 8 — Clone and build hedge-website
# ============================================================
STEP=08
if is_done "$STEP" && [[ "${1:-}" != "--redeploy" ]]; then
  skip "STEP ${STEP}: App already cloned and built. Use --redeploy to force rebuild."
else
  info "STEP ${STEP}: Cloning and building hedge-website …"
  if [[ -d "$APP_DIR/.git" ]]; then
    info "Repo already cloned at ${APP_DIR} — pulling latest …"
    sudo -u "$DEPLOY_USER" git -C "$APP_DIR" pull
  else
    sudo -u "$DEPLOY_USER" git clone "$APP_REPO" "$APP_DIR"
  fi
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" fetch origin "${DEPLOY_BRANCH}"
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" checkout "${DEPLOY_BRANCH}"
  sudo -u "$DEPLOY_USER" git -C "$APP_DIR" reset --hard "origin/${DEPLOY_BRANCH}"
  sudo -u "$DEPLOY_USER" bash -c "
    export NVM_DIR=\"\$HOME/.nvm\"
    set +u; source \"\$NVM_DIR/nvm.sh\" 2>/dev/null; set -u
    cd \"${APP_DIR}\"
    npm install --include=dev --no-audit --no-fund --prefer-offline 2>/dev/null || npm install --include=dev --no-audit --no-fund
    npm run build
  "
  ok "App built at ${APP_DIR}."
  done_step "$STEP"
fi

# ============================================================
# STEP 9 — Set up .env
# ============================================================
STEP=09
info "STEP ${STEP}: Setting up .env …"
if [[ -f "${APP_DIR}/.env" ]]; then
  warn ".env already exists — skipping."
else
  cp "${APP_DIR}/.env.example" "${APP_DIR}/.env"
  chown "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/.env"
  chmod 600 "${APP_DIR}/.env"
  warn "Copied .env.example → .env. EDIT with your real keys before starting."
fi
mkdir -p "${APP_DIR}/backups"
chown -R "${DEPLOY_USER}:${DEPLOY_USER}" "${APP_DIR}/backups"
ok ".env and backups/ ready."

# ============================================================
# STEP 10 — Nginx reverse proxies
# ============================================================
STEP=10
if is_done "$STEP"; then
  NGINX_VERIFIED=true
  for cfg in "dev-hedge-site:${APP_DOMAIN}" "dev-hedge-site-hook:${WEBHOOK_DOMAIN}"; do
    cfg_name="${cfg%%:*}"
    cfg_domain="${cfg##*:}"
    if [[ ! -f "/etc/nginx/sites-available/${cfg_name}" ]] || \
       ! grep -q "server_name ${cfg_domain}" "/etc/nginx/sites-available/${cfg_name}" 2>/dev/null; then
      NGINX_VERIFIED=false
      warn "Nginx config '${cfg_name}' with domain '${cfg_domain}' not found — will reconfigure."
      rm -f "${MARKER_DIR}/step-${STEP}"
      break
    fi
  done
  if $NGINX_VERIFIED; then
    skip "STEP ${STEP}: Nginx already configured and verified."
  fi
fi

if ! is_done "$STEP"; then
  info "STEP ${STEP}: Installing and configuring Nginx …"
  apt-get install -y -q nginx
  rm -f /etc/nginx/sites-enabled/default

  cat > /etc/nginx/sites-available/dev-hedge-site <<NGINX_APP
server {
    listen 80;
    server_name ${APP_DOMAIN};
    client_max_body_size 100M;
    location / {
        proxy_pass         http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
NGINX_APP

  cat > /etc/nginx/sites-available/dev-hedge-site-hook <<NGINX_HOOK
server {
    listen 80;
    server_name ${WEBHOOK_DOMAIN};
    client_max_body_size 10M;
    location / {
        proxy_pass         http://127.0.0.1:${WEBHOOK_PORT};
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }
}
NGINX_HOOK

  ln -sf /etc/nginx/sites-available/dev-hedge-site      /etc/nginx/sites-enabled/
  ln -sf /etc/nginx/sites-available/dev-hedge-site-hook  /etc/nginx/sites-enabled/
  nginx -t && systemctl reload nginx && systemctl enable nginx
  ok "Nginx configured — app and webhook vhosts."
  done_step "$STEP"
fi

# ============================================================
# STEP 11 — PM2: start the apps
# ============================================================
STEP=11
if is_done "$STEP" && [[ "${1:-}" != "--redeploy" ]]; then
  PM2_VERIFIED=true
  for app_name in "${PM2_ENV_PREFIX}-hedge-site" "${PM2_ENV_PREFIX}-hedge-site-hook"; do
    if ! sudo -u "$DEPLOY_USER" bash -c "
      export NVM_DIR=\"\$HOME/.nvm\"
      set +u; source \"\$NVM_DIR/nvm.sh\" 2>/dev/null; set -u
      pm2 jlist 2>/dev/null || echo '[]'
    " | jq -e --arg name "$app_name" '.[] | select(.name == $name and .pm2_env.status == "online")' >/dev/null 2>&1; then
      PM2_VERIFIED=false
      warn "PM2 process '${app_name}' not running — will restart apps."
      rm -f "${MARKER_DIR}/step-${STEP}"
      break
    fi
  done
  if $PM2_VERIFIED; then
    skip "STEP ${STEP}: Apps already started via PM2 (verified: ${PM2_ENV_PREFIX}-hedge-site + ${PM2_ENV_PREFIX}-hedge-site-hook online)."
  fi
fi

if ! is_done "$STEP" || [[ "${1:-}" == "--redeploy" ]]; then
  info "STEP ${STEP}: Starting apps with PM2 …"
  sudo -u "$DEPLOY_USER" bash -c "
    cd \"${APP_DIR}\"
    export NVM_DIR=\"\$HOME/.nvm\"
    set +u; source \"\$NVM_DIR/nvm.sh\"; set -u
    npm run build
    PM2_APP_NAME="${PM2_ENV_PREFIX}-hedge-site" PM2_HOOK_NAME="${PM2_ENV_PREFIX}-hedge-site-hook" npm run pm2:start
  "
  ok "Apps started via PM2 (${PM2_ENV_PREFIX}-hedge-site + ${PM2_ENV_PREFIX}-hedge-site-hook)."
  done_step "$STEP"
fi

# ============================================================
# STEP 12 — logrotate for PM2 logs
# ============================================================
STEP=12
if is_done "$STEP"; then
  skip "STEP ${STEP}: logrotate already configured."
else
  info "STEP ${STEP}: Configuring logrotate …"
  cat > /etc/logrotate.d/dev-hedge-site <<LOGROTATE
${DEPLOY_HOME}/.pm2/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    notifempty
    copytruncate
}
LOGROTATE
  ok "logrotate configured."
  done_step "$STEP"
fi

# ============================================================
echo ""
echo -e "${GREEN}${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}║           PROVISIONING COMPLETE ✓                    ║${NC}"
echo -e "${GREEN}${BOLD}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

if [[ -f "${APP_DIR}/.env" ]]; then
  NODE_ENV=$(grep -E '^NODE_ENV=' "${APP_DIR}/.env" 2>/dev/null | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
  NODE_ENV="${NODE_ENV:-development}"
  if [[ "$NODE_ENV" == "development" || "$NODE_ENV" == "stage" || "$NODE_ENV" == "test" ]]; then
    echo -e "${YELLOW}${BOLD}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${YELLOW}${BOLD}║  ⚠️  BETA — UNSTABLE DEPLOY — CONTINUOUS BUILD                  ║${NC}"
    echo -e "${YELLOW}${BOLD}║  This is a pre-release version. Expect breaking changes.        ║${NC}"
    echo -e "${YELLOW}${BOLD}║  Do not use for production workloads.                          ║${NC}"
    echo -e "${YELLOW}${BOLD}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "  NODE_ENV=${NODE_ENV} — running in beta/unstable mode."
    echo ""
  fi
fi

echo -e "  Hedge Site         : ${CYAN}http://${APP_DOMAIN}${NC}"
echo -e "  Webhook            : ${CYAN}http://${WEBHOOK_DOMAIN}${NC}"
echo ""
echo -e "  ${YELLOW}Required ports:${NC} 22 (SSH), ${SSH_PORT} (SSH custom), 80 (HTTP), 443 (HTTPS)"
echo ""
echo -e "  ${YELLOW}REQUIRED NEXT STEPS:${NC}"
echo -e "  1. Edit .env with real API keys:"
echo -e "       ${CYAN}nano ${APP_DIR}/.env${NC}"
echo -e "  2. Restart the app:"
echo -e "       ${CYAN}sudo -u ${DEPLOY_USER} pm2 restart all${NC}"
echo ""

if [[ "$APP_DOMAIN" != "$SERVER_IP" ]]; then
echo -e "  ${YELLOW}DNS + Cloudflare setup:${NC}"
echo -e "  3. In Cloudflare DNS, add A records (orange cloud ON):"
echo -e "       ${APP_DOMAIN}     →  ${SERVER_IP}   (proxy ON)"
echo -e "       ${WEBHOOK_DOMAIN} →  ${SERVER_IP}   (proxy ON)"
echo -e "  4. Set Cloudflare SSL/TLS mode → ${CYAN}Flexible${NC}"
echo -e "  5. No ports needed in URLs — just:"
echo -e "       ${CYAN}https://${APP_DOMAIN}${NC}"
echo -e "       ${CYAN}https://${WEBHOOK_DOMAIN}/webhook${NC} (GitHub webhook URL)"
echo -e "  ${YELLOW}Alternative — Let's Encrypt (no Cloudflare):${NC}"
echo -e "       ${CYAN}sudo apt install -y certbot python3-certbot-nginx${NC}"
echo -e "       ${CYAN}sudo certbot --nginx -d ${APP_DOMAIN} -d ${WEBHOOK_DOMAIN}${NC}"
fi
echo ""

echo -e "  ${YELLOW}TROUBLESHOOTING:${NC}"
echo -e "  • To force re-run a step:  ${CYAN}rm ${MARKER_DIR}/step-NN${NC}"
echo -e "  • To re-run everything:    ${CYAN}rm -rf ${MARKER_DIR}${NC}"
echo -e "  • To redeploy latest code: ${CYAN}sudo bash ${APP_DIR}/provision.sh --redeploy${NC}"
echo -e "  • Check PM2 status:        ${CYAN}sudo -u ${DEPLOY_USER} pm2 status${NC}"
echo ""

if [[ "${1:-}" == "--redeploy" ]]; then
  info "Running redeploy …"
  sudo -u "$DEPLOY_USER" bash -c "
    export NVM_DIR=\"\$HOME/.nvm\"
    set +u; source \"\$NVM_DIR/nvm.sh\" 2>/dev/null; set -u
    cd \"${APP_DIR}\"
    git fetch origin ${DEPLOY_BRANCH}
    git checkout ${DEPLOY_BRANCH}
    git reset --hard origin/${DEPLOY_BRANCH}
    npm install --include=dev --no-audit --no-fund
    npm run build
    PM2_APP_NAME="${PM2_ENV_PREFIX}-hedge-site" PM2_HOOK_NAME="${PM2_ENV_PREFIX}-hedge-site-hook" npm run pm2:start
  "
  ok "Redeploy complete."
fi
