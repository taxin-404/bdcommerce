#!/usr/bin/env bash
# One-shot Cloudflare deployment for BDCommerce.
#
# Provisions (if not already set up), then deploys, entirely against Cloudflare:
#   1. D1 database          -> apps/api/wrangler.toml
#   2. R2 bucket            -> for media
#   3. KV namespace         -> apps/api/wrangler.toml
#   4. JWT_SECRET           -> worker secret (generated, stored in CF only)
#   5. Migrations           -> applied to the remote D1 database
#   6. Worker               -> deployed
#
# Idempotent: safe to re-run. Usage:
#   npm run setup        # first time
#   npm run deploy:all   # re-deploy after code changes
set -euo pipefail

log() { printf '\033[1;36m■\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/apps/api"

CONFIG="wrangler.toml"
DB_NAME="bdcommerce"
KV_NAME="bdcommerce-kv"
BUCKET_NAME="bdcommerce-media"

# --- 0. auth ----------------------------------------------------------------
if ! npx wrangler whoami >/dev/null 2>&1; then
  die "Not logged into Cloudflare. Run \`npx wrangler login\` first."
fi

# --- 1. D1 database ---------------------------------------------------------
current_db_id="$(sed -n 's/^database_id = "\(.*\)"/\1/p' "$CONFIG" | head -1)"
if [[ -z "$current_db_id" || "$current_db_id" == "00000000-0000-0000-0000-000000000000" ]]; then
  log "Setting up D1 database '$DB_NAME'..."
  db_id=""
  if out="$(npx wrangler d1 create "$DB_NAME" 2>&1)"; then
    db_id="$(printf '%s\n' "$out" | sed -n 's/.*database_id = "\([0-9a-f-]*\)".*/\1/p' | head -1)"
  fi
  if [[ -z "$db_id" ]]; then
    db_id="$(npx wrangler d1 list --json 2>/dev/null | node -e '
      let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
        const name=process.argv[1]; let rows=[];
        try { rows=JSON.parse(d); } catch { process.exit(1); }
        const hit=rows.find(r=>r.name===name || r.database_name===name);
        if (hit) console.log(hit.uuid || hit.database_id || "");
      })' "$DB_NAME")"
  fi
  [[ -n "$db_id" ]] || die "Could not determine the D1 database_id."
  sed -i "s/^database_id = \".*\"/database_id = \"$db_id\"/" "$CONFIG"
  log "D1 database_id = $db_id"
else
  log "D1 database already configured ($current_db_id)"
fi

# --- 2. R2 bucket -----------------------------------------------------------
log "Ensuring R2 bucket '$BUCKET_NAME'..."
npx wrangler r2 bucket create "$BUCKET_NAME" >/dev/null 2>&1 && log "R2 bucket created" || log "R2 bucket already exists"

# --- 3. KV namespace --------------------------------------------------------
current_kv_id="$(sed -n 's/^id = "\(.*\)"/\1/p' "$CONFIG" | head -1)"
if [[ -z "$current_kv_id" || "$current_kv_id" == "00000000000000000000000000000000" ]]; then
  log "Setting up KV namespace '$KV_NAME'..."
  kv_id=""
  if out="$(npx wrangler kv namespace create "$KV_NAME" 2>&1)"; then
    kv_id="$(printf '%s\n' "$out" | sed -n 's/.*id = "\([0-9a-f]*\)".*/\1/p' | head -1)"
  fi
  if [[ -z "$kv_id" ]]; then
    kv_id="$(npx wrangler kv namespace list --json 2>/dev/null | node -e '
      let d=""; process.stdin.on("data",c=>d+=c).on("end",()=>{
        const title=process.argv[1]; let rows=[];
        try { rows=JSON.parse(d); } catch { process.exit(1); }
        const hit=rows.find(r=>r.title===title || r.name===title);
        if (hit) console.log(hit.id || "");
      })' "$KV_NAME")"
  fi
  [[ -n "$kv_id" ]] || die "Could not determine the KV namespace id."
  awk -v id="$kv_id" '
    BEGIN { in_kv=0 }
    /^\[\[kv_namespaces\]\]/ { in_kv=1 }
    /^\[[^\[]/ && !/^\[\[kv_namespaces\]\]/ { in_kv=0 }
    in_kv && /^id = / { print "id = \"" id "\""; next }
    { print }
  ' "$CONFIG" > "$CONFIG.tmp" && mv "$CONFIG.tmp" "$CONFIG"
  log "KV namespace id set"
else
  log "KV namespace already configured"
fi

# --- 4. JWT secret ----------------------------------------------------------
if ! npx wrangler secret list --json 2>/dev/null | grep -q '"JWT_SECRET"'; then
  log "Setting JWT_SECRET..."
  secret="$(node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))')"
  printf '%s' "$secret" | npx wrangler secret put JWT_SECRET >/dev/null
  log "JWT_SECRET generated and stored in Cloudflare"
else
  log "JWT_SECRET already set"
fi

# --- 5. Migrations ----------------------------------------------------------
log "Applying migrations to remote D1..."
npm run db:apply:remote

# --- 6. Deploy --------------------------------------------------------------
log "Deploying worker..."
npm run deploy

log "Done. Health check: curl https://bdcommerce-api.<account>.workers.dev/health"
