#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

docker compose down -v
docker compose up -d

echo "Esperando a MySQL y a que termine docker-entrypoint-initdb.d..."
for _ in $(seq 1 120); do
  if docker compose exec -T mysql mysql -h 127.0.0.1 -P 3306 -unuba_user -pnuba_pass nuba \
    -e "SHOW TABLES LIKE 'tenants';" 2>/dev/null | grep -q tenants; then
    echo "Base lista (tabla tenants encontrada)."
    exit 0
  fi
  sleep 1
done

echo "Timeout esperando MySQL o el init." >&2
exit 1
