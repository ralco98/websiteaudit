FROM node:20-alpine AS base

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy package manifests
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/ssrf/package.json ./packages/ssrf/
COPY packages/policy/package.json ./packages/policy/
COPY packages/evidence/package.json ./packages/evidence/
COPY packages/domain/package.json ./packages/domain/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# Copy packages and web application source
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NODE_ENV=production
ENV PORT=3000

# Build packages and Next.js application
RUN pnpm --filter "@convertaudit/*" build
RUN pnpm --filter @convertaudit/web build

EXPOSE 3000

CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web"]
