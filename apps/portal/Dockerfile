FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/security/package.json packages/security/package.json
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @mwanamke/portal

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/.next/static ./apps/portal/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/portal/public ./apps/portal/public
USER nextjs
EXPOSE 3000
CMD ["node", "apps/portal/server.js"]
