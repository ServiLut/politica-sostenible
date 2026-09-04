FROM node:22-alpine AS pruner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY . .
RUN pnpm dlx turbo@2.8.2 prune api --docker

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
RUN pnpm --filter api generate
RUN pnpm --filter api build

# One-shot image used before the API starts. It retains the Prisma CLI and
# migration history. The long-running API does not expose a linked Prisma CLI,
# although pnpm's virtual store can retain unlinked artifacts; the root security
# override therefore applies to both images.
FROM builder AS migrator
WORKDIR /app
COPY --chown=node:node deploy/migrate.mjs ./deploy/migrate.mjs
COPY --chown=node:node deploy/migrate-entrypoint.mjs ./deploy/migrate-entrypoint.mjs
COPY --chown=node:node deploy/runtime-environment.mjs ./deploy/runtime-environment.mjs
USER node
CMD ["node", "deploy/migrate-entrypoint.mjs"]

FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --config.auto-install-peers=false

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma/generated ./apps/api/prisma/generated

WORKDIR /app/apps/api
USER nestjs
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/health/live || exit 1
CMD ["node", "dist/main.js"]
