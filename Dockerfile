FROM node:22-alpine AS pruner
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY . .
RUN pnpm dlx turbo@2.8.2 prune api web --docker

FROM node:22-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ARG NEXT_PUBLIC_APP_URL=https://politica-sostenible.abogadosencolombiasas.com
ARG NEXT_PUBLIC_SUPABASE_URL=https://supabase.servilutioncrm.cloud
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpYXQiOjE3Njk0NDk5NDEsImV4cCI6MTg5MzQ1NjAwMCwicm9sZSI6ImFub24iLCJpc3MiOiJzdXBhYmFzZSJ9.2uoYyj9HFydkWiY0DFeyygosnltHj2T5DqdN1zrxcJM
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NESTJS_API_URL=http://127.0.0.1:4000
RUN pnpm --filter api generate && pnpm --filter api build && pnpm --filter web build

FROM node:22-alpine AS prod-deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --prod --frozen-lockfile --ignore-scripts --config.auto-install-peers=false

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NESTJS_API_URL=http://127.0.0.1:4000
RUN apk add --no-cache openssl && addgroup --system --gid 1001 politica && adduser --system --uid 1001 politica
COPY --from=prod-deps --chown=politica:politica /app/node_modules ./node_modules
COPY --from=prod-deps --chown=politica:politica /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=politica:politica /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=politica:politica /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=politica:politica /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts
COPY --from=builder --chown=politica:politica /app/apps/api/prisma/schema.prisma ./apps/api/prisma/schema.prisma
COPY --from=builder --chown=politica:politica /app/apps/api/prisma/migrations ./apps/api/prisma/migrations
COPY --from=builder --chown=politica:politica /app/apps/api/prisma/generated ./apps/api/prisma/generated
COPY --from=builder --chown=politica:politica /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=politica:politica /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=politica:politica /app/apps/web/.next/standalone ./
COPY --chown=politica:politica deploy/start.mjs ./deploy/start.mjs
COPY --chown=politica:politica deploy/migrate.mjs ./deploy/migrate.mjs
COPY --chown=politica:politica deploy/runtime-environment.mjs ./deploy/runtime-environment.mjs
USER politica
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health/ready || exit 1
CMD ["node", "deploy/start.mjs"]
