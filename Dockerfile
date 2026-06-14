FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files and install ALL dependencies (including dev)
COPY package*.json ./
RUN npm install

# Copy source and Prisma schema
COPY . .
COPY prisma ./prisma

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app

# Copy built artifacts and production node_modules only
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma

# Remove dev dependencies (optional, since we only copied node_modules from builder which includes dev deps)
# Better: prune dev dependencies now
RUN npm prune --production

# Generate Prisma Client again (ensures binary compatibility)
RUN npx prisma generate

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
