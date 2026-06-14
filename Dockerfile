FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
# Install all dependencies (including dev) for the build
RUN npm install
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine
WORKDIR /app
# Copy only production dependencies and built artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
# Remove dev dependencies (optional, but already done by npm install --production in builder? Simpler: use npm ci --only=production on the final stage)
RUN npm prune --production
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
