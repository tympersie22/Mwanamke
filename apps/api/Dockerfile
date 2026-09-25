FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/security/package.json packages/security/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run prisma:generate -w @mwanamke/api
RUN npm run build -w @mwanamke/api

FROM build AS migration
ENV NODE_ENV=production
CMD ["npm", "run", "prisma:migrate", "-w", "@mwanamke/api"]

FROM node:22-alpine AS runtime-dependencies
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY apps/portal/package.json apps/portal/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/security/package.json packages/security/package.json
# The API runtime must not ship Expo, web build tools or test dependencies.
RUN npm ci --omit=dev --workspace=@mwanamke/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=4100
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 api
COPY --from=build --chown=api:nodejs /app/apps/api/dist ./dist
COPY --from=runtime-dependencies --chown=api:nodejs /app/node_modules ./node_modules
# zod is kept in the API workspace because the monorepo also resolves another version.
COPY --from=runtime-dependencies --chown=api:nodejs /app/apps/api/node_modules ./node_modules
# npm workspaces hoist Prisma and its generated client to the repository root.
COPY --from=build --chown=api:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build --chown=api:nodejs /app/node_modules/.prisma ./node_modules/.prisma
USER api
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:4100/health >/dev/null || exit 1
CMD ["node", "dist/server.js"]
