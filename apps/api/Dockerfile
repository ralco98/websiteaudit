FROM mcr.microsoft.com/playwright:v1.50.0-noble AS base

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest

# Copy root workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy package manifests for layer caching
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/ssrf/package.json ./packages/ssrf/
COPY packages/policy/package.json ./packages/policy/
COPY packages/evidence/package.json ./packages/evidence/
COPY packages/domain/package.json ./packages/domain/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

# Install dependencies across monorepo
RUN pnpm install

# Copy source code
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# Build internal packages and API
RUN pnpm --filter @convertaudit/api... build

# Install Chromium browser binary for Playwright
RUN pnpm --filter @convertaudit/api exec playwright install chromium

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
