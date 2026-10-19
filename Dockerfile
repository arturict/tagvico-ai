# Build architecture-independent application output once on the native runner.
# Production dependencies are installed separately for each target platform so
# native modules such as better-sqlite3 still match the final architecture.
FROM --platform=$BUILDPLATFORM node:22.13-slim AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make \
    g++ \
    git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# The corepack bundled with Node 22.13 predates npm's 2025 signing-key
# rotation and rejects current pnpm releases, so update it before enabling.
# Corepack then installs the pnpm version pinned in package.json.
RUN npm install -g corepack@0.35.0 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && \
    pnpm docs:build && \
    node -e 'const fs=require("node:fs");const major="v"+require("./package.json").version.split(".")[0];for(const file of ["docs-site/index.html","docs-site/"+major+"/index.html"]){if(!fs.existsSync(file))throw new Error("Missing bundled docs: "+file)}' && \
    rm -rf .next/cache && \
    rm -rf node_modules "$(pnpm store path)"

FROM node:22.13-slim AS production-dependencies

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make \
    g++ \
    git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g corepack@0.35.0 && corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod && \
    rm -rf "$(pnpm store path)"

FROM node:22.13-slim AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends bubblewrap ca-certificates curl poppler-utils && \
    update-ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/dist ./dist
# swagger-jsdoc reads these TypeScript sources when the backend starts.
COPY --from=build /app/server.ts ./server.ts
COPY --from=build /app/schemas.ts ./schemas.ts
COPY --from=build /app/routes ./routes
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/views ./views
COPY --from=build /app/docs-site ./docs-site
COPY --from=build /app/scripts/start-production.js ./scripts/start-production.js
COPY --from=build /app/scripts/copilot-login.js ./scripts/copilot-login.js
COPY --from=build /app/scripts/benchmark-ollama-models.mjs ./scripts/benchmark-ollama-models.mjs
COPY --from=build /app/scripts/ollama-benchmark-harness-lib.mjs ./scripts/ollama-benchmark-harness-lib.mjs
COPY --from=build /app/start-services.sh ./start-services.sh
COPY --from=build /app/LICENSE ./LICENSE
COPY --from=build /app/THIRD_PARTY_NOTICES.md ./THIRD_PARTY_NOTICES.md
COPY --from=build /app/PRIVACY_POLICY.md ./PRIVACY_POLICY.md

# Make startup script executable
RUN chmod +x start-services.sh

# Configure persistent data volume
VOLUME ["/app/data"]

# Configure the Tagvico AI application port.
EXPOSE ${TAGVICO_AI_PORT:-3000}

# Add health check with dynamic port
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
    CMD port="${TAGVICO_AI_PORT:-${ARCHIVISTA_AI_PORT:-3000}}"; curl -f "http://localhost:${port}/health" || exit 1

# Set production environment
ENV NODE_ENV=production \
    TAGVICO_TELEMETRY_ENDPOINT=https://telemetry.tagvico.arturf.ch/v1/heartbeat

# Start the Node.js service
CMD ["./start-services.sh"]
