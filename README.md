# websiteaudit

ConvertAudit AI — Website UX, speed, clarity, and conversion auditing platform.

## Architecture

- **`apps/web`**: Next.js 15 web application (Tailwind CSS, real-time audit UI, interactive score rings, export modal).
- **`apps/api`**: Fastify API gateway & Playwright browser worker engine for live site probing and audits.
- **`packages/contracts`**: Shared TypeScript data contracts and Report.v1 specifications.
- **`packages/domain`**: Auditing heuristics, scoring algorithms, and detector registry.
- **`packages/evidence`**: Normalized DOM evidence, selector extraction, and confidence scoring.
- **`packages/policy`**: Rate limiting, quotas, and audit policies.
- **`packages/ssrf`**: SSRF guardrails and IP range validation.

## Local Development

```bash
# Install dependencies
pnpm install

# Run backend API
pnpm dev:api

# Run frontend web app
pnpm dev:web
```

## Production Builds

```bash
# Build frontend web app
pnpm build:web

# Build backend API
pnpm build:api
```

## Deployment

- **Frontend**: Configured for **Vercel** (`vercel.json`). Set `NEXT_PUBLIC_API_URL` to your backend URL.
- **Backend**: Configured for **Railway** (`railway.json` and `apps/api/Dockerfile`).
