#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../../.."

# Every resource belongs to this invocation. Fixed loopback ports deliberately
# fail when occupied; never stop a different project's stack to obtain a port.
fixture_id="pathway-realtime-${GITHUB_RUN_ID:-local}-$$"
fixture_label="pathway.realtime-fixture=$fixture_id"
fixture_directory="$(mktemp -d)"
fixture_network="$fixture_id-network"
fixture_database="$fixture_id-db"
fixture_realtime="$fixture_id-realtime"
fixture_gateway="$fixture_id-gateway"
cleanup() {
  fixture_exit=$?
  if [ "$fixture_exit" -ne 0 ]; then
    docker logs --tail 40 "$fixture_realtime" 2>/dev/null || true
  fi
  for container in "$fixture_gateway" "$fixture_realtime" "$fixture_database"; do
    if [ "$(docker inspect --format '{{ index .Config.Labels "pathway.realtime-fixture" }}' "$container" 2>/dev/null || true)" = "$fixture_id" ]; then
      docker rm -f "$container" >/dev/null
    fi
  done
  docker network rm "$fixture_network" >/dev/null 2>&1 || true
  rm -rf "$fixture_directory"
}
trap cleanup EXIT

docker network create --label "$fixture_label" "$fixture_network" >/dev/null
docker run -d --name "$fixture_database" --label "$fixture_label" \
  --network "$fixture_network" --network-alias db -p 127.0.0.1:15449:5432 \
  -e POSTGRES_PASSWORD=events-test-only -e POSTGRES_DB=postgres \
  -e JWT_SECRET=pathway-events-local-jwt-secret-at-least-32-characters \
  public.ecr.aws/supabase/postgres:17.6.1.165 \
  -c listen_addresses='*' -c wal_level=logical -c max_replication_slots=10 -c max_wal_senders=10 >/dev/null
for attempt in $(seq 1 60); do
  if docker exec "$fixture_database" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec -i "$fixture_database" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 <<'SQL'
ALTER ROLE supabase_admin PASSWORD 'events-test-only';
CREATE DATABASE pathway_realtime_notifications_test OWNER postgres;
SQL
docker exec "$fixture_database" psql -U supabase_admin -d pathway_realtime_notifications_test \
  -v ON_ERROR_STOP=1 -c 'CREATE SCHEMA _realtime AUTHORIZATION supabase_admin;'
docker run -d --name "$fixture_realtime" --label "$fixture_label" \
  --hostname realtime-dev.supabase-realtime --network "$fixture_network" \
  -p 127.0.0.1:15450:4000 -e PORT=4000 -e DB_HOST=db -e DB_PORT=5432 \
  -e DB_USER=supabase_admin -e DB_PASSWORD=events-test-only \
  -e DB_NAME=pathway_realtime_notifications_test -e 'DB_AFTER_CONNECT_QUERY=SET search_path TO _realtime' \
  -e DB_ENC_KEY=supabaserealtime \
  -e API_JWT_SECRET=pathway-events-local-jwt-secret-at-least-32-characters \
  -e METRICS_JWT_SECRET=pathway-events-local-jwt-secret-at-least-32-characters \
  -e SECRET_KEY_BASE=pathway-events-local-secret-key-base-000000000000000000000000000000 \
  -e 'ERL_AFLAGS=+S 2:2 -proto_dist inet_tcp' -e DNS_NODES= -e RLIMIT_NOFILE=10000 \
  -e APP_NAME=realtime -e SEED_SELF_HOST=true -e RUN_JANITOR=true \
  -e DISABLE_HEALTHCHECK_LOGGING=true public.ecr.aws/supabase/realtime:v2.129.3 >/dev/null
for attempt in $(seq 1 90); do
  if [ "$(docker exec "$fixture_database" psql -U supabase_admin -d pathway_realtime_notifications_test -Atc "SELECT to_regclass('realtime.messages') IS NOT NULL" 2>/dev/null)" = t ]; then break; fi
  sleep 1
done
test "$(docker exec "$fixture_database" psql -U supabase_admin -d pathway_realtime_notifications_test -Atc "SELECT to_regclass('realtime.messages') IS NOT NULL")" = t

cat > "$fixture_directory/nginx.conf" <<NGINX
events {}
http {
  server {
    listen 80;
    location /realtime/v1/ {
      proxy_pass http://$fixture_realtime:4000/socket/;
      proxy_http_version 1.1;
      proxy_set_header Host realtime-dev.supabase-realtime;
      proxy_set_header Upgrade \$http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_read_timeout 120s;
    }
  }
}
NGINX
docker run -d --name "$fixture_gateway" --label "$fixture_label" \
  --network "$fixture_network" -p 127.0.0.1:15451:80 \
  -v "$fixture_directory/nginx.conf:/etc/nginx/nginx.conf:ro" nginx:1.30.6-alpine-slim >/dev/null
export REALTIME_PROVIDER_GATEWAY_CONTAINER="$fixture_gateway"
export REALTIME_PROVIDER_FIXTURE_ID="$fixture_id"
export REALTIME_PROVIDER_DATABASE_URL=postgresql://supabase_admin:events-test-only@127.0.0.1:15449/pathway_realtime_notifications_test
DATABASE_URL="$REALTIME_PROVIDER_DATABASE_URL?schema=app" DIRECT_URL="$REALTIME_PROVIDER_DATABASE_URL?schema=app" \
  pnpm --filter @pathway/db prisma:migrate:deploy
pnpm --filter @pathway/db prisma:generate
websocket_flags=()
if [ "$(node -p 'typeof WebSocket')" = undefined ]; then websocket_flags+=(--experimental-websocket); fi
pnpm --filter @pathway/api exec node "${websocket_flags[@]}" --import tsx --test scripts/realtime-provider/delivery.test.ts
# Exercise HTTP permission guards and current-recipient/legal-access checks on
# the same migrated disposable database. Never reset or select an ambient DB.
E2E_USE_GLOBAL_SETUP=false E2E_ALLOW_RESET=false \
  TEST_DATABASE_URL="$REALTIME_PROVIDER_DATABASE_URL?schema=app" \
  E2E_DATABASE_URL="$REALTIME_PROVIDER_DATABASE_URL?schema=app" \
  TEST_AUTH_TOKEN_SECRET=isolated-realtime-provider-http-only \
  pnpm --filter @pathway/api run test:integration --runTestsByPath src/messaging/tests/family-messaging-security.e2e.spec.ts
