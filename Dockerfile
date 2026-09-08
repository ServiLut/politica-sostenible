ARG APP_REVISION=unknown
ARG APP_SOURCE=https://github.com/ServiLut/politica-sostenible
ARG DEPLOYMENT_PROFILE=production

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS pruner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2+sha512.41872f037ad22f7348e3b1debbaf7e867cfd448f2726d9cf74c08f19507c31d2c8e7a11525b983febc2df640b5438dee6023ebb1f84ed43cc2d654d2bc326264 --activate
COPY . .
RUN TURBO_TELEMETRY_DISABLED=1 pnpm dlx --allow-build= turbo@2.9.14 prune api web --docker

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
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1
ENV NESTJS_API_URL=http://127.0.0.1:4000
COPY deploy/public-build-environment.mjs ./deploy/public-build-environment.mjs
COPY deploy/artifact-metadata.mjs ./deploy/artifact-metadata.mjs
RUN node deploy/artifact-metadata.mjs
RUN node deploy/public-build-environment.mjs
RUN pnpm --filter api generate && pnpm --filter api build && pnpm --filter web build

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
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NESTJS_API_URL=http://127.0.0.1:4000
ENV API_PROCESS_UID=1001 API_PROCESS_GID=1001 WEB_PROCESS_UID=1002 WEB_PROCESS_GID=1002 SUPERVISOR_SHUTDOWN_GRACE_MS=30000
RUN apk add --no-cache openssl \
    && addgroup --system --gid 1001 politica-api \
    && adduser --system --uid 1001 --ingroup politica-api politica-api \
    && addgroup --system --gid 1002 politica-web \
    && adduser --system --uid 1002 --ingroup politica-web politica-web
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
# pnpm --ignore-scripts deliberately omits Prisma's schema-engine download in
# prod-deps. The combined image migrates at boot, so copy the exact engine that
# the builder already executed successfully instead of enabling every package
# postinstall in the runtime dependency stage.
COPY --from=builder /app/node_modules/.pnpm/@prisma+engines@7.9.1/node_modules/@prisma/engines/schema-engine-linux-musl-openssl-3.0.x /app/node_modules/.pnpm/@prisma+engines@7.9.1/node_modules/@prisma/engines/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder /app/apps/api/prisma/baseline.schema.prisma ./apps/api/prisma/baseline.schema.prisma
COPY --from=builder /app/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY --from=builder /app/apps/api/prisma/migrations ./apps/api/prisma/migrations
COPY --from=builder /app/apps/api/prisma/generated ./apps/api/prisma/generated
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/.next/standalone ./
COPY deploy/start.mjs ./deploy/start.mjs
COPY deploy/migrate.mjs ./deploy/migrate.mjs
COPY deploy/runtime-environment.mjs ./deploy/runtime-environment.mjs
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["node", "deploy/start.mjs"]
