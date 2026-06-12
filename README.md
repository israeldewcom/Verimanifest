# VeriManifest Backend v5.1

Production‑hardened waste logistics platform with full compliance automation, driver tracking, offline sync, API keys, and white‑label support.

## Quick Start

```bash
cp .env.example .env
# Fill required variables (at minimum DATABASE_URL, REDIS_URL, JWT_SECRET, JWT_REFRESH_SECRET, AWS_*, SMTP_*, STRIPE_*)
docker-compose up -d
npx prisma migrate deploy
npm run seed
npm run start
