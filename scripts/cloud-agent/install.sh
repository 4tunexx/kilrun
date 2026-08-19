#!/usr/bin/env bash
# Idempotent Cloud Agent install for Kilrun: prepares the local MongoDB dev
# database, writes dev .env files if missing, installs dependencies for both
# the Next.js hub and the Colyseus game server, generates the Prisma client,
# pushes the schema, and seeds the progression catalogs.
#
# Safe to run repeatedly and on a cached/snapshotted filesystem.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

log() { echo "[install] $*"; }

# --- 1. MongoDB (system dependency) -----------------------------------------
if ! command -v mongod >/dev/null 2>&1; then
  log "installing MongoDB Community 8.0"
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor --yes
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -y
  sudo apt-get install -y mongodb-org
else
  log "MongoDB already installed ($(mongod --version | head -1))"
fi

# --- 2. Dev .env files (dev-only placeholders, never real secrets) ----------
if [ ! -f .env ]; then
  log "writing dev .env"
  cat > .env <<'EOF'
DATABASE_URL="mongodb://127.0.0.1:27017/kilrun?replicaSet=rs0&directConnection=true"
AUTH_SECRET="dev-auth-secret-not-for-production-change-me"
NEXTAUTH_URL=http://localhost:3000
STEAM_API_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SECRET=
RESEND_API_KEY=
RESEND_FROM_EMAIL="Kilrun <onboarding@resend.dev>"
NEXT_PUBLIC_SITE_URL=http://localhost:3000
BLOB_READ_WRITE_TOKEN=
NEXT_PUBLIC_GAME_SERVER_URL=ws://localhost:2567
GAME_JOIN_TOKEN_SECRET=dev-shared-secret
GAME_SERVER_ADMIN_SECRET=dev-shared-secret
WEB_APP_URL=http://localhost:3000
GEMINI_API_KEY=
ADMIN_STEAM_IDS=76561198001993310
SITE_SECRETS_ENCRYPTION_KEY="ZGV2LW9ubHktc2l0ZS1zZWNyZXRzLWtleS0zMmJ5dGVzIQ=="
EOF
else
  log ".env already present, leaving it untouched"
fi

if [ ! -f server/.env ]; then
  log "writing dev server/.env"
  cat > server/.env <<'EOF'
PORT=2567
CLIENT_ORIGIN=http://localhost:3000
WEB_APP_URL=http://localhost:3000
GAME_SERVER_ADMIN_SECRET=dev-shared-secret
GAME_JOIN_TOKEN_SECRET=dev-shared-secret
AUTH_SECRET=dev-auth-secret-not-for-production-change-me
EOF
else
  log "server/.env already present, leaving it untouched"
fi

# --- 3. MongoDB up (needed for db push + seed below) ------------------------
bash scripts/cloud-agent/mongo-up.sh

# --- 4. Dependencies --------------------------------------------------------
log "installing hub dependencies (npm ci)"
npm ci                       # root postinstall runs `prisma generate`

log "installing game-server dependencies (npm ci)"
npm --prefix server ci

# --- 5. Prisma client + schema + seed --------------------------------------
log "syncing Prisma schema to MongoDB (db push)"
npm run db:push

log "seeding progression catalogs"
npm run db:seed

log "done"
