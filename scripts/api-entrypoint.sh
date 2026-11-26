#!/bin/sh
set -e
cd /app
echo "Running migrations..."
pnpm --filter @lomi/database exec prisma migrate deploy
echo "Seeding fixtures..."
node apps/api/dist/seed.js
echo "Starting API..."
exec "$@"