# Build native dependencies and TypeScript outside the runtime image.
FROM node:22.13-slim AS build

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    make \
    g++ \
    git && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && \
    npm run docs:build && \
    node -e 'const fs=require("node:fs");const major="v"+require("./package.json").version.split(".")[0];for(const file of ["docs-site/index.html","docs-site/"+major+"/index.html"]){if(!fs.existsSync(file))throw new Error("Missing bundled docs: "+file)}' && \
    npm prune --omit=dev && \
    npm cache clean --force

FROM node:22.13-slim AS runtime

WORKDIR /app

RUN apt-get update && \
    apt-get install -y --no-install-recommends bubblewrap ca-certificates curl poppler-utils && \
    update-ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app /app

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
ENV NODE_ENV=production

# Start the Node.js service
CMD ["./start-services.sh"]
