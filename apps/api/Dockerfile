ARG APP_REVISION=unknown
ARG APP_SOURCE=https://github.com/ServiLut/politica-sostenible
ARG DEPLOYMENT_PROFILE=production

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS pruner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2+sha512.41872f037ad22f7348e3b1debbaf7e867cfd448f2726d9cf74c08f19507c31d2c8e7a11525b983febc2df640b5438dee6023ebb1f84ed43cc2d654d2bc326264 --activate
COPY . .
RUN TURBO_TELEMETRY_DISABLED=1 pnpm dlx --allow-build= turbo@2.9.14 prune api --docker

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder
WORKDIR /app
ARG APP_REVISION
ARG APP_SOURCE
ARG DEPLOYMENT_PROFILE
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.2+sha512.41872f037ad22f7348e3b1debbaf7e867cfd448f2726d9cf74c08f19507c31d2c8e7a11525b983febc2df640b5438dee6023ebb1f84ed43cc2d654d2bc326264 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY deploy/artifact-metadata.mjs ./deploy/artifact-metadata.mjs
RUN node deploy/artifact-metadata.mjs
RUN pnpm --filter api generate
RUN pnpm --filter api build

# One-shot image used before the API starts. It retains the Prisma CLI and
# migration history. The long-running API does not expose a linked Prisma CLI,
# although pnpm's virtual store can retain unlinked artifacts; the root security
# override therefore applies to both images.
FROM builder AS migrator
WORKDIR /app
ARG APP_REVISION
ARG APP_SOURCE
LABEL org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.source="${APP_SOURCE}"
COPY --chown=node:node deploy/migrate.mjs ./deploy/migrate.mjs
COPY --chown=node:node deploy/migrate-entrypoint.mjs ./deploy/migrate-entrypoint.mjs
COPY --chown=node:node deploy/runtime-environment.mjs ./deploy/runtime-environment.mjs
USER node
CMD ["node", "deploy/migrate-entrypoint.mjs"]

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2+sha512.41872f037ad22f7348e3b1debbaf7e867cfd448f2726d9cf74c08f19507c31d2c8e7a11525b983febc2df640b5438dee6023ebb1f84ed43cc2d654d2bc326264 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --config.auto-install-peers=false

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS runner
WORKDIR /app
ARG APP_REVISION
ARG APP_SOURCE
LABEL org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.source="${APP_SOURCE}"
ENV NODE_ENV=production
ENV APP_REVISION=${APP_REVISION}
ENV PORT=4000

RUN apk add --no-cache openssl \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=prod-deps --chown=nestjs:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/prisma/generated ./apps/api/prisma/generated
COPY --chown=nestjs:nodejs deploy/api-entrypoint.mjs ./deploy/api-entrypoint.mjs
COPY --chown=nestjs:nodejs deploy/catalog-worker-entrypoint.mjs ./deploy/catalog-worker-entrypoint.mjs
COPY --chown=nestjs:nodejs deploy/catalog-worker-healthcheck.mjs ./deploy/catalog-worker-healthcheck.mjs
COPY --chown=nestjs:nodejs deploy/runtime-environment.mjs ./deploy/runtime-environment.mjs

WORKDIR /app/apps/api
USER nestjs
EXPOSE 4000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:4000/health/ready || exit 1
CMD ["node", "../../deploy/api-entrypoint.mjs"]
