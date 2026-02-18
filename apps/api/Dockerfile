# 1. Base y Prune
FROM node:22-alpine AS base
WORKDIR /app
RUN npm install turbo --global
COPY . .
RUN turbo prune --scope=api --docker

# 2. Instalar y Construir
FROM node:22-alpine AS build
WORKDIR /app

# Instalar dependencias necesarias para Prisma en Alpine
RUN apk add --no-cache openssl libc6-compat

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copiamos solo lo necesario para instalar dependencias
COPY --from=base /app/out/json/ .
COPY --from=base /app/out/pnpm-lock.yaml ./pnpm-lock.yaml

# INSTALAMOS CON --ignore-scripts
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copiamos el código fuente completo
COPY --from=base /app/out/full/ .

# Generar Prisma Client
# Usamos pnpm exec en el contexto del paquete api para localizar correctamente el binario
RUN pnpm --filter=api exec prisma generate

# Construir la API
RUN pnpm run build --filter=api

# 3. Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

# Instalamos OpenSSL
RUN apk add --no-cache openssl

# Copiamos dependencias y build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

WORKDIR /app/apps/api

EXPOSE 4000

CMD ["node", "dist/main.js"]
