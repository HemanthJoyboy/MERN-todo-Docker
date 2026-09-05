# ---- client Dockerfile (multi-stage build) ----
# Stage 1 "builder": has Node + all devDependencies, only used to produce
# static HTML/JS/CSS files. This stage is thrown away after the build.
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Vite bakes VITE_* variables into the JS bundle AT BUILD TIME, not at
# container start time. So the gateway's public URL must be passed in
# as a build argument when the image is built (see README / compose file).
ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build   # outputs static files into /app/dist

# ---- Stage 2 "runner": a fresh, tiny nginx image. None of the Node.js
# tooling, source code or node_modules from Stage 1 end up in here - only
# the compiled dist/ folder. This is why multi-stage builds keep images small.
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -q -O- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
