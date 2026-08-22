#!/bin/sh
set -e

echo "Syncing database schema..."
npx prisma db push --accept-data-loss

echo "Seeding database..."
node dist/database/seed.js || echo "Seed step failed or already applied, continuing..."

echo "Starting application..."
exec node dist/index.js
