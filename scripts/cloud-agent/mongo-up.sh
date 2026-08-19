#!/usr/bin/env bash
# Bring up a local single-node MongoDB replica set for Kilrun dev.
#
# Prisma's `mongodb` provider (schema.prisma) requires a replica set for
# transactional writes, so a plain standalone mongod is not enough. This
# script is idempotent: it is safe to run on every boot (start) and during
# install. It starts mongod only if it is not already accepting connections,
# then initiates the replica set once.
set -euo pipefail

MONGO_PORT="${MONGO_PORT:-27017}"
MONGO_DBPATH="${MONGO_DBPATH:-/var/lib/mongodb}"
MONGO_LOGPATH="${MONGO_LOGPATH:-/var/log/mongodb/mongod.log}"

log() { echo "[mongo-up] $*"; }

if ! command -v mongod >/dev/null 2>&1; then
  log "ERROR: mongod not installed. Run the install script first." >&2
  exit 1
fi

sudo mkdir -p "$MONGO_DBPATH" "$(dirname "$MONGO_LOGPATH")"
sudo chown -R "$USER":"$USER" "$MONGO_DBPATH" "$(dirname "$MONGO_LOGPATH")"

is_up() { mongosh --quiet --port "$MONGO_PORT" --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1; }

if is_up; then
  log "mongod already accepting connections on port $MONGO_PORT"
else
  log "starting mongod (replSet rs0) on port $MONGO_PORT"
  mongod --replSet rs0 --dbpath "$MONGO_DBPATH" --logpath "$MONGO_LOGPATH" \
    --bind_ip 127.0.0.1 --port "$MONGO_PORT" --fork >/dev/null
  for _ in $(seq 1 30); do is_up && break; sleep 1; done
  is_up || { log "ERROR: mongod did not become ready" >&2; tail -n 40 "$MONGO_LOGPATH" >&2 || true; exit 1; }
fi

# Initiate the replica set exactly once; ignore "already initialized".
mongosh --quiet --port "$MONGO_PORT" --eval '
  try { rs.status(); }
  catch (e) { rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "127.0.0.1:'"$MONGO_PORT"'" }] }); }
' >/dev/null

# Wait until this node is PRIMARY so writes/transactions succeed.
for _ in $(seq 1 30); do
  state="$(mongosh --quiet --port "$MONGO_PORT" --eval 'try { rs.status().myState } catch(e) { -1 }' 2>/dev/null || echo -1)"
  [ "$state" = "1" ] && break
  sleep 1
done
log "replica set rs0 ready (state=${state:-unknown})"
