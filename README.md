# MERN Todo — Dockerized (Node + Express + React + Neon Postgres)

This is the Dockerized version of the `mern-todo-monorepo` project. The
manual/PM2 approach (`ecosystem.config.js`, installing Node directly on an
EC2 box) still works and is untouched — this repo adds a **second,
container-based way** to run and deploy the exact same 4 services:

```
mern-todo-docker/
├── client/                  # React (Vite) → built, then served by Nginx    → container port 80  (host 3000)
├── services/
│   ├── api-gateway/         # proxies requests                              → container port 4000 (host 4000)
│   ├── auth-service/        # register/login, issues JWTs                   → container port 4001 (internal only)
│   └── todo-service/        # CRUD todos, verifies JWTs                     → container port 4002 (internal only)
├── docker-compose.yml               # defines & wires up all 4 containers
├── docker-compose.override.yml      # auto-loaded dev overrides (hot reload via bind mounts)
├── docker-compose.local-postgres.example.yml   # optional: local Postgres instead of Neon
└── ecosystem.config.js      # kept from the manual setup, for reference
```

Database is still **Neon Postgres** (external, managed) — Docker doesn't
change that. Only *how the 4 Node/React processes run* changes: instead of
PM2 processes on bare metal, each one runs inside its own container.

---

## 1. What is Docker, and why use it over the manual approach?

**Docker packages an application together with everything it needs to run**
(Node runtime, exact npm dependency versions, OS libraries, config) into a
single unit called an **image**. A running instance of that image is a
**container** — an isolated process with its own filesystem, network
interface, and process tree, but sharing the host machine's kernel (which is
what makes it much lighter than a full virtual machine).

### Manual approach (what this project used before)

On the EC2 box, you had to, by hand:

1. Install Node.js 20 (and hope it matches what you developed with)
2. Install PM2, `serve`, git
3. `npm install` in the repo root (which installs for all 4 services)
4. Manually create 4 `.env` files
5. Build the client
6. Start 4 processes with `ecosystem.config.js`
7. Hope the server's OS libraries, Node version, and installed globals match
   your laptop closely enough that "it worked on my machine" holds

This works, but has real problems:

| Problem | Why it happens |
|---|---|
| "Works on my machine" bugs | Your laptop's Node/OS/library versions silently drift from the server's over time |
| Hard to run 2 apps with conflicting needs on one box | Both would fight over global Node version, global npm packages, ports |
| New team member setup takes hours | They must install Node, PM2, git, clone, npm install, create 4 env files, remember every step correctly |
| Scaling a single service (e.g. todo-service) is awkward | PM2 can fork the *same* process, but you're still tied to that one server's OS/CPU |
| Rebuilding a fresh server after a crash/migration | You must redo all of section 5.2–5.6 of the manual README from scratch |

### Docker approach

1. Write a `Dockerfile` **once** per service describing exactly how to build
   it (base image, dependencies, source, start command)
2. `docker build` turns that into an image — a self-contained, versioned
   artifact that includes the exact Node version and exact `npm install`
   result baked in
3. `docker run` (or `docker compose up`) starts it as a container — same
   behavior every time, on your laptop, a teammate's laptop, or the server,
   because it's the *same image*
4. New server setup = install Docker + `docker compose up -d`. That's it —
   no Node version to match, no PM2 config to remember, no manual `.env`
   copy-paste sequence beyond the env files themselves

**In short:** the manual approach configures a *server*; Docker packages an
*application*. You stop asking "is this server set up correctly?" and start
asking "does this image run?" — which you can test locally before it ever
touches production.

This isn't "Docker replaces PM2" in spirit — it replaces the whole idea of
manually preparing a machine. You could even run PM2 *inside* a container,
but the point of Docker here is that each service already ships with its
correct runtime, so you don't need a process manager to babysit
version drift.

---

## 2. Docker architecture — how a request flows, and who handles it

Docker isn't just the `docker` command — it's a client/server system:

```
┌──────────────────────────────── Host machine (your laptop or EC2) ────────────────────────────────┐
│                                                                                                     │
│   docker CLI  ──REST API (over a Unix socket)──▶  dockerd (Docker daemon)                          │
│  (docker run,                                       - builds images (reads your Dockerfile)        │
│   docker compose,                                   - manages containers (start/stop/restart)       │
│   docker ps, ...)                                   - manages networks & volumes                    │
│                                                       - talks to containerd + runc underneath        │
│                                                              │                                       │
│                                                              ▼                                       │
│                                          containerd  (manages container lifecycle)                   │
│                                                              │                                       │
│                                                              ▼                                       │
│                                          runc  (actually creates the isolated process:                │
│                                                 Linux namespaces + cgroups)                            │
│                                                              │                                       │
│         ┌──────────────┬───────────────┬────────────────────┼────────────┐                          │
│         ▼              ▼               ▼                    ▼            ▼                          │
│   [client         [api-gateway]   [auth-service]      [todo-service]                                 │
│    container]       :4000           :4001                 :4002                                     │
│    nginx :80                                                                                          │
│         │                │               │                    │                                     │
│         └──── todo-net (Docker's internal virtual bridge network + built-in DNS) ────────────────────┘
│                                                                                                        │
└──────────────── host ports published: 3000→client:80, 4000→api-gateway:4000 ─────────────────────────┘
                                          │
                                          ▼
                                    Neon Postgres (external, over the internet, not a container)
```

**Who handles what:**
- **Docker CLI** — the `docker` / `docker compose` commands you type. It's just a client; it doesn't run containers itself.
- **Docker daemon (`dockerd`)** — the long-running background service that actually does the work: builds images layer by layer, creates/starts/stops containers, creates networks and volumes.
- **containerd + runc** — lower-level components `dockerd` delegates to for actually creating the isolated Linux process (using kernel namespaces for isolation and cgroups for resource limits). You never call these directly.
- **Docker network (`todo-net`)** — a private virtual network Compose creates. Containers on it can resolve each other **by service name** (e.g. `api-gateway` can reach `http://auth-service:4001`) via Docker's built-in embedded DNS server.

### Request flow for "user clicks Login"

1. Browser (on your machine) sends `POST http://<server-ip>:3000` request → hits the **host's** network stack on port 3000
2. Docker's port-publishing rule (`3000:80` in compose) forwards that to the **client container's** nginx on port 80, which returns the already-built React app (nginx here is just a static file server — no proxying)
3. The React app's JS (running in the *browser*, not in any container) calls `fetch('http://<server-ip>:4000/api/auth/login')`
4. That hits the **host** on port 4000 → Docker's `4000:4000` mapping forwards it into the **api-gateway container**
5. Inside `api-gateway`, `http-proxy-middleware` forwards the request to `http://auth-service:4001/login` — this hop **never leaves the Docker network**; it's resolved by Docker's internal DNS to auth-service's container IP on `todo-net`
6. `auth-service` container queries **Neon Postgres** over the internet (outbound traffic — no special Docker config needed, containers can reach the internet by default), verifies the password, signs a JWT
7. Response flows back: auth-service → api-gateway → host port 4000 → browser

The key architectural shift from the manual setup: `localhost:4001` (same
machine, same OS process space) becomes `auth-service:4001` (a different
container, reached by **service name** over the Docker network) — because
each service is now its own isolated container with its own `localhost`.

---

## 3. Steps to create a Dockerfile

Using `services/auth-service/Dockerfile` in this repo as the running example:

1. **Pick a base image** — start from an image that already has what you need. We use `node:20-alpine` (`alpine` = a minimal Linux distro, keeps the image small).
   ```dockerfile
   FROM node:20-alpine
   ```
2. **Set a working directory** — everywhere from this line down, `COPY`/`RUN` operate relative to this path inside the container.
   ```dockerfile
   WORKDIR /app
   ```
3. **Copy dependency manifests first, install, then copy source code** — this ordering is deliberate for **layer caching**: Docker caches each instruction. If `package.json` hasn't changed, Docker reuses the cached `npm install` layer instead of re-running it, so rebuilding after a small code change takes seconds, not minutes.
   ```dockerfile
   COPY package*.json ./
   RUN npm install --omit=dev
   COPY src ./src
   ```
4. **Drop root privileges** (security best practice — a container running as root has more power than it needs).
   ```dockerfile
   RUN addgroup -S appgroup && adduser -S appuser -G appgroup
   USER appuser
   ```
5. **Document the port** the app listens on (this is informational metadata only — it doesn't publish anything by itself; you still need `-p` or a compose `ports:` entry).
   ```dockerfile
   EXPOSE 4001
   ```
6. **Define the startup command** — what runs when a container starts from this image.
   ```dockerfile
   CMD ["node", "src/index.js"]
   ```

For the **client**, the Dockerfile is a **multi-stage build** because Vite
needs Node.js to *build* the app, but the *running* app is just static
HTML/JS/CSS that only needs a web server:

- **Stage 1 (`builder`)**: `node:20-alpine`, installs devDependencies, runs `npm run build`, produces `/app/dist`
- **Stage 2 (final image)**: fresh `nginx:1.27-alpine`, copies only `dist/` from Stage 1 via `COPY --from=builder`

Everything from Stage 1 (Node, node_modules, source files) is discarded —
only the compiled static files make it into the final image, which is why
multi-stage builds produce much smaller production images than "just
install everything in one stage" would.

### Also worth knowing: `.dockerignore`
Every service here has a `.dockerignore` (same idea as `.gitignore`) that
excludes `node_modules`, `.env`, and `.git` from what gets sent to the
Docker daemon during `docker build`. Without it, your **real secrets**
(`.env` with your Neon password) could get baked into an image layer.

---

## 4. Steps to run a Dockerfile

### Build the image
```bash
cd services/auth-service
docker build -t auth-service:1.0 .
```
- `-t auth-service:1.0` — tags (names) the image so you can refer to it later. Format is `name:tag`.
- `.` — the **build context**: the folder Docker sends to the daemon and where it looks for the Dockerfile.

### Run a container from it
```bash
docker run -d \
  --name auth-service \
  --env-file .env \
  -p 4001:4001 \
  auth-service:1.0
```
- `-d` — detached, runs in the background
- `--name` — a friendly name instead of a random one Docker would otherwise generate
- `--env-file .env` — injects your `DATABASE_URL` / `JWT_SECRET` as environment variables inside the container (this is how config gets in — nothing is hardcoded into the image)
- `-p 4001:4001` — publish container port 4001 to host port 4001 (`host:container`)

### Everyday commands
```bash
docker ps                     # list running containers
docker ps -a                  # include stopped ones
docker logs -f auth-service   # tail logs (equivalent of pm2 logs)
docker exec -it auth-service sh   # get a shell inside the running container
docker stop auth-service
docker rm auth-service        # remove a stopped container
docker rmi auth-service:1.0   # remove the image
```

Doing this one container at a time for all 4 services works, but you'd have
to manually create a network and pass `--network` to every command so they
can reach each other. **That's exactly what `docker compose` automates** —
see Section 5.

---

## 5. Deploying the application using Docker containers

### 5.1 One-time server setup
On a fresh Ubuntu server (EC2 or otherwise) — this replaces *all* of the old
"install Node, PM2, git, npm install" steps:
```bash
# Install Docker Engine + Compose plugin
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # avoid needing sudo for every docker command
newgrp docker                   # re-evaluate group membership in this shell
docker --version
docker compose version
```

Security group / firewall — same rule as the manual setup, Docker doesn't
change the networking story at the host level:
- Open **22** (SSH) — your IP only
- Open **3000** (frontend) — public
- Open **4000** (api-gateway) — public
- **Do NOT open 4001/4002** — they're not even published to the host in `docker-compose.yml`, so this is enforced by the compose file itself, not just the firewall

### 5.2 Get the code onto the server
```bash
git clone <your-repo-url> mern-todo-docker
cd mern-todo-docker
```

### 5.3 Configure environment files
Same `.env` files as the manual setup, one per service — Docker doesn't
change what goes in them, only that they're passed via `env_file:` in
compose instead of being read directly off disk by a PM2 process.
```bash
cp services/auth-service/.env.example services/auth-service/.env
cp services/todo-service/.env.example services/todo-service/.env
cp services/api-gateway/.env.example services/api-gateway/.env
cp .env.example .env   # sets VITE_API_BASE_URL for the client's build

nano services/auth-service/.env   # paste Neon DATABASE_URL + a strong JWT_SECRET
nano services/todo-service/.env   # SAME DATABASE_URL/JWT_SECRET as auth-service
nano .env                         # VITE_API_BASE_URL=http://<server-public-ip>:4000
```

### 5.4 Build and start everything
```bash
docker compose -f docker-compose.yml up -d --build
```
- `-f docker-compose.yml` — explicitly use only the production file (skip the dev-only `docker-compose.override.yml`, which Compose would otherwise auto-load)
- `--build` — build fresh images from the Dockerfiles instead of using anything cached from before
- `-d` — detached, keeps running after you disconnect

Compose reads `docker-compose.yml`, and for each service: builds its image
(if not already built), creates `todo-net` if it doesn't exist, starts each
container attached to that network, and applies the `ports:` mappings.

### 5.5 Verify
```bash
docker compose ps                       # see all 4 containers and their status/health
docker compose logs -f                  # tail logs from all services
docker compose logs -f auth-service     # logs from just one

curl http://localhost:4000/health       # api-gateway, from the host
docker compose exec api-gateway wget -qO- http://auth-service:4001/health   # prove internal DNS works
```
Then visit `http://<server-public-ip>:3000` in a browser.

### 5.6 Redeploying after a code change
```bash
git pull
docker compose up -d --build   # only rebuilds images whose Dockerfile/context actually changed
```
This is the single biggest operational win over the manual approach — one
command instead of re-running `npm install`, rebuilding the client, and
`pm2 restart`ing the right processes in the right order.

### 5.7 Common lifecycle commands
```bash
docker compose stop                 # stop containers, keep them (and the network) around
docker compose start                # start them again
docker compose restart auth-service # restart just one
docker compose down                 # stop AND remove containers + the network (images/volumes untouched)
docker compose down -v              # also remove any named volumes (careful — see Section 7)
```

### 5.8 (Optional, recommended) Docker also survives reboots
```bash
# Compose already sets restart: unless-stopped on every service, so as long
# as the Docker daemon itself starts on boot (it does, by default, once
# installed via get.docker.com/apt), all 4 containers come back up
# automatically after a server reboot - no pm2 save / pm2 startup needed.
sudo systemctl enable docker
```

---

## 6. How a request flows *inside* the containers

Zooming into just the container layer (compare with the full diagram in
Section 2):

```
Browser
  │  GET http://<server-ip>:3000/
  ▼
[client container]  nginx:80 → returns index.html + JS bundle (static files only, no backend logic here)
  │
  │  (from here on, calls are made by JS running in the BROWSER, not the client container)
  │  fetch('http://<server-ip>:4000/api/todos', { headers: { Authorization: 'Bearer <jwt>' } })
  ▼
Host port 4000  ──Docker port mapping──▶  [api-gateway container] :4000
  │
  │  http-proxy-middleware rewrites path, forwards over todo-net using the
  │  service name as hostname (Docker's embedded DNS resolves it to the
  │  todo-service container's internal IP, e.g. 172.19.0.4)
  ▼
[todo-service container] :4002
  │  requireAuth middleware verifies the JWT using JWT_SECRET (an env var
  │  injected via env_file - identical value in both auth-service and
  │  todo-service containers, exactly like the manual setup required)
  │  queries Neon Postgres over the internet (outbound - containers can
  │  reach the internet by default; only INBOUND traffic is restricted
  │  by which ports are published)
  ▼
Neon Postgres (external managed DB - not a container in this stack)
  │
  ▼ rows flow back: todo-service → api-gateway → host:4000 → browser
```

Two things that are *different* from running the same code with PM2 on one
server, but *identical in effect*:
- **`localhost` no longer works between services** — each container has its
  own network namespace with its own `localhost`. `auth-service` calling
  `localhost:4002` would hit *itself*, not todo-service. That's why
  `docker-compose.yml` sets `AUTH_SERVICE_URL=http://auth-service:4001` —
  container **names/service names act as hostnames** on the shared network.
- **Only published ports are reachable from outside** — 4001/4002 have no
  `ports:` entry at all, so there is no route from the host (or the
  internet) into those containers, full stop. It's not just a firewall
  rule you could forget — the mapping simply doesn't exist.

---

## 7. Docker volumes and networks

### Networks
A Docker network is a private virtual network that containers attach to.
This repo defines one:
```yaml
networks:
  todo-net:
    driver: bridge
```
- **`bridge`** is the default driver for a single-host setup like this one — it creates an isolated virtual switch that containers plug into.
- Containers on the same network reach each other **by service name** via Docker's built-in DNS (see Sections 2 and 6) — no hardcoded IPs, and the IPs can change across restarts without breaking anything.
- Containers **not** on the same network can't reach each other at all by default — this is what makes "don't expose 4001/4002 publicly" enforceable at the Docker level, not just a firewall convention.
- You can inspect it: `docker network inspect mern-todo_todo-net`

### Volumes
A volume is how a container persists or shares data **beyond its own
lifecycle** — a container's own filesystem is deleted the moment the
container is removed, so anything the app writes that needs to survive
`docker compose down` or a redeploy must live in a volume instead.

This app's actual data (`users`, `todos`) lives in **Neon Postgres**, which
is external and managed — Docker doesn't need to persist anything for it,
which is why the default `docker-compose.yml` in this repo declares **no
volumes**. But two volume patterns are demonstrated for when you need them:

**1. Bind mount, for local development** (`docker-compose.override.yml`, auto-loaded by `docker compose up`):
```yaml
volumes:
  - ./services/auth-service/src:/app/src   # your local folder, live-mounted into the container
  - /app/node_modules                       # anonymous volume, "protects" node_modules
```
A bind mount maps a folder on your **host machine** directly into the
container, so edits you make locally appear instantly inside the running
container (used here with `node --watch` for hot reload). The second line
is a common trick: without it, mounting your local `src` folder over `/app`
would also cover up the `node_modules` that got installed *during the image
build*, which usually don't exist (or don't match the container's OS) on
your host.

**2. Named volume, for real persistent data** (`docker-compose.local-postgres.example.yml` — optional, only if you swap Neon for local Postgres):
```yaml
volumes:
  - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
```
A named volume is storage **managed by Docker itself** (you don't choose
the host path). It survives `docker compose down`, container removal, and
image rebuilds — only `docker compose down -v` or `docker volume rm
pgdata` deletes it. This is the standard pattern any time you run a
database *inside* a container: without it, restarting the Postgres
container would wipe every row.

```bash
docker volume ls                 # list all volumes on this machine
docker volume inspect pgdata     # see where Docker actually stores it on disk
```

---

## Suggested repo name

`mern-todo-docker` (used above) — short, matches the existing
`mern-todo-monorepo` naming, and immediately tells you what's different
about this copy.

Other reasonable options if you want something more course/portfolio-flavored:
- `learning-docker-mern-todo` — reads as a learning project first, todo app second
- `deploying-mern-with-docker` — leans into the deployment angle
- `mern-todo-containerized`
