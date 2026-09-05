# ---- auth-service Dockerfile ----
# Small, production-only image. No build step needed (plain Node/Express).

FROM node:20-alpine

# Create app directory inside the container
WORKDIR /app

# Copy only the dependency manifests first.
# Docker caches each instruction as a "layer" - as long as package.json
# doesn't change, this layer (and the npm install below) is reused on
# rebuilds, so code-only changes rebuild in seconds instead of minutes.
COPY package*.json ./

RUN npm install --omit=dev

# Now copy the actual source code
COPY src ./src
COPY sql ./sql

# Run as a non-root user (security best practice - never run as root in prod)
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

# Document which port this container listens on (informational only,
# does NOT actually publish the port - that happens with -p / compose)
EXPOSE 4001

# Basic container-level healthcheck, hits the /health route the app exposes
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:4001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
