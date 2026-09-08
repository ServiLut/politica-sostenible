ARG APP_REVISION=unknown
ARG APP_SOURCE=https://github.com/ServiLut/politica-sostenible
ARG DEPLOYMENT_PROFILE=production

FROM node:22-alpine AS pruner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY . .
RUN pnpm dlx turbo@2.8.2 prune web --docker

FROM node:22-alpine AS builder
WORKDIR /app
ARG APP_REVISION
ARG APP_SOURCE
ARG DEPLOYMENT_PROFILE
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NESTJS_API_URL=http://api:4000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NESTJS_API_URL=$NESTJS_API_URL

COPY deploy/public-build-environment.mjs ./deploy/public-build-environment.mjs
COPY deploy/artifact-metadata.mjs ./deploy/artifact-metadata.mjs
RUN node deploy/artifact-metadata.mjs
RUN node deploy/public-build-environment.mjs
RUN pnpm --filter web build

FROM node:22-alpine AS runner
WORKDIR /app
ARG APP_REVISION
ARG APP_SOURCE
LABEL org.opencontainers.image.revision="${APP_REVISION}" \
      org.opencontainers.image.source="${APP_SOURCE}"
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NESTJS_API_URL=http://api:4000

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./

USER nextjs
EXPOSE 3000
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["node", "apps/web/server.js"]
