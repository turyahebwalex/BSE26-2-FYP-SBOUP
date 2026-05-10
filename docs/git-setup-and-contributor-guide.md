# SBOUP — Full Setup & Contributor Guide

A complete guide for contributors to clone, set up, run, and contribute to the **Skill-Based Opportunities and Upskilling Platform (SBOUP)**.

---

## TL;DR — One Command

After cloning the repo, this is everything you need to bring up the entire stack (web, mobile, backend, AI services, database):

```bash
bash scripts/setup.sh && bash scripts/dev.sh
```

`scripts/setup.sh` creates any missing `.env` files, installs Node deps, and seeds the database with the shared demo accounts (run once after cloning, idempotent). `scripts/dev.sh` then prompts for mobile mode (Wi-Fi QR / USB / skip), auto-detects your LAN IP for CV PDF URLs, brings up the Docker stack, and launches Expo on the host so the QR code is reachable from your phone.

**Working on a slow or throttled network?** Add `--pull` to fetch pre-built images for the heavy AI services from GHCR instead of building them locally:

```bash
bash scripts/dev.sh --pull
```

See [section 7](#7-pre-built-images-on-ghcr) for what's published and why.

Demo logins (same on every collaborator's machine):

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@skillbridge.ug` | `Admin@12345` |
| Employer | `employer@demo.ug` | `Employer@12345` |
| Skilled Worker | `worker@demo.ug` | `Worker@12345` |

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Getting the Code](#2-getting-the-code)
3. [Project Structure](#3-project-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [Environment Configuration](#5-environment-configuration)
6. [Running with Docker (Recommended)](#6-running-with-docker-recommended)
7. [Pre-Built Images on GHCR (for slow networks / weak laptops)](#7-pre-built-images-on-ghcr)
8. [How Docker Guarantees Correct Versions for All Contributors & CI/CD](#8-how-docker-guarantees-correct-versions-for-all-contributors--cicd)
9. [Running the Mobile App (Expo Go on Physical Device)](#9-running-the-mobile-app-expo-go-on-physical-device)
10. [Running Without Docker (Manual Setup)](#10-running-without-docker-manual-setup)
11. [Verifying Everything Works](#11-verifying-everything-works)
12. [Contributing — Git Workflow](#12-contributing--git-workflow)
13. [Common Issues & Troubleshooting](#13-common-issues--troubleshooting)
14. [Ports Summary](#14-ports-summary)

---

## 1. Prerequisites

Install the following on your machine before starting:

| Tool | Version | Install |
|------|---------|---------|
| **Git** | 2.30+ | `sudo apt install git` (Ubuntu) / [git-scm.com](https://git-scm.com) |
| **Docker & Docker Compose** | Latest | [docs.docker.com/get-docker](https://docs.docker.com/get-docker/) |

> **That's it for Docker users.** Docker handles Node.js, Python, MongoDB, Redis, and all dependencies inside containers. You do **not** need to install them on your host machine.

### Only needed if running WITHOUT Docker (manual setup)

| Tool | Version | Install |
|------|---------|---------|
| **Node.js** | 18+ | [nodejs.org](https://nodejs.org) or `nvm install 18` |
| **npm** | 9+ | Comes with Node.js |
| **MongoDB** | 7+ | [mongodb.com/docs/manual/installation](https://www.mongodb.com/docs/manual/installation/) |
| **Redis** | 7+ | `sudo apt install redis-server` |
| **Python** | 3.9+ | `sudo apt install python3 python3-pip python3-venv` |

### Mobile app testing (optional)

- **Android**: Physical device with [Expo Go](https://expo.dev/expo-go) installed (recommended), or [Android Studio](https://developer.android.com/studio) emulator
- **iOS** *(macOS only)*: Physical iPhone with Expo Go, or Xcode iOS simulator
- Your phone and computer must be on the **same WiFi network**

---

## 2. Getting the Code

### Option A: Direct Clone (team collaborators)

```bash
git clone https://github.com/turyahebwalex/BSE26-2-FYP-SBOUP.git
cd BSE26-2-FYP-SBOUP
```

### Option B: Fork & Clone (external contributors)

1. Go to [github.com/turyahebwalex/BSE26-2-FYP-SBOUP](https://github.com/turyahebwalex/BSE26-2-FYP-SBOUP) and click **Fork**
2. Clone your fork:
   ```bash
   git clone https://github.com/<YOUR-USERNAME>/BSE26-2-FYP-SBOUP.git
   cd BSE26-2-FYP-SBOUP
   ```
3. Add the upstream remote (to stay in sync):
   ```bash
   git remote add upstream https://github.com/turyahebwalex/BSE26-2-FYP-SBOUP.git
   ```

---

## 3. Project Structure

```
BSE26-2-FYP-SBOUP/
├── server/                     # Backend API (Node.js 18 + Express)
│   ├── src/
│   │   ├── server.js           # Entry point
│   │   ├── controllers/        # Route handlers
│   │   ├── models/             # Mongoose schemas
│   │   ├── routes/             # API route definitions
│   │   ├── middleware/         # Auth, validation, etc.
│   │   ├── services/           # Business logic
│   │   └── utils/              # Helpers, seeder
│   ├── Dockerfile
│   └── package.json
│
├── client/                     # Web Frontend (React + Tailwind CSS)
│   ├── src/
│   │   ├── pages/              # Admin & Employer pages
│   │   ├── components/         # Reusable UI components
│   │   ├── context/            # Auth context (React Context API)
│   │   └── services/           # API service (axios)
│   ├── Dockerfile
│   └── package.json
│
├── mobile/                     # Mobile App (React Native + Expo SDK 54)
│   ├── App.js                  # Entry point
│   ├── src/
│   │   ├── screens/            # All app screens
│   │   ├── components/         # Reusable components
│   │   ├── navigation/         # React Navigation stacks/tabs
│   │   ├── context/            # Auth context
│   │   └── services/           # API service (axios)
│   ├── Dockerfile
│   ├── .dockerignore           # Excludes node_modules from Docker build
│   └── package.json
│
├── ai-services/                # AI Microservices (Python 3.11 + Flask)
│   ├── matching-engine/        # Port 5001 — Skill matching
│   ├── fraud-detection/        # Port 5002 — Fraud detection
│   ├── cv-generation/          # Port 5003 — CV generation
│   ├── learning-engine/        # Port 5004 — Learning paths
│   └── chatbot-service/        # Port 5005 — AI Chatbot
│
├── docs/                       # Documentation
├── docker-compose.yml          # Docker orchestration (all services)
├── .env.example                # Environment template
└── .gitignore
```

---

## 4. Architecture Overview

SBOUP is a multi-layer platform with **10 containerized services**:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      PRESENTATION LAYER                            │
│  ┌──────────────────────┐    ┌──────────────────────────────────┐  │
│  │  Web Client (React)  │    │  Mobile App (Expo/React Native)  │  │
│  │  Port 3000           │    │  Port 8081 (Expo Dev Server)     │  │
│  └──────────┬───────────┘    └──────────────┬───────────────────┘  │
│             │                               │                      │
├─────────────┼───────────────────────────────┼──────────────────────┤
│             ▼         APPLICATION LAYER     ▼                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │              Backend API (Node.js + Express)                │   │
│  │              Port 5000                                      │   │
│  └──────┬──────────┬──────────┬──────────┬──────────┬──────────┘   │
│         │          │          │          │          │               │
├─────────┼──────────┼──────────┼──────────┼──────────┼──────────────┤
│         ▼          ▼          ▼          ▼          ▼               │
│  ┌──────────┐┌──────────┐┌──────────┐┌──────────┐┌──────────┐     │
│  │ Matching ││  Fraud   ││    CV    ││ Learning ││ Chatbot  │     │
│  │ Engine   ││Detection ││  Gen    ││ Engine   ││ Service  │     │
│  │  :5001   ││  :5002   ││  :5003  ││  :5004   ││  :5005   │     │
│  └──────────┘└──────────┘└──────────┘└──────────┘└──────────┘     │
│                       INTELLIGENCE LAYER                           │
├────────────────────────────────────────────────────────────────────┤
│                         DATA LAYER                                 │
│  ┌──────────────────────┐    ┌──────────────────────┐              │
│  │  MongoDB 7           │    │  Redis 7             │              │
│  │  Port 27017          │    │  Port 6379           │              │
│  └──────────────────────┘    └──────────────────────┘              │
└────────────────────────────────────────────────────────────────────┘
```

**Technology stack per layer:**

| Layer | Technology | Runtime |
|-------|-----------|---------|
| **Data** | MongoDB 7, Redis 7 | Official Docker images |
| **Application** | Node.js 18, Express | `node:18-alpine` container |
| **Intelligence** | Python 3.11, Flask | `python:3.11-slim` containers |
| **Presentation (Web)** | React, Tailwind CSS | `node:18-alpine` container |
| **Presentation (Mobile)** | React Native, Expo SDK 54 | `node:20-alpine` container |

---

## 5. Environment Configuration

### Quick start (recommended for everyone)

After your first clone or any fresh `git pull` where you don't yet have local `.env` files, run the bootstrap script **once** from the project root:

```bash
bash scripts/setup.sh
```

This does three things in order:

1. Copies every `.env.example` to a matching `.env` where one doesn't exist (root, `client/`, `mobile/`, `ai-services/*`).
2. Runs `npm install` for `server`, `client`, `mobile`.
3. Runs `npm run seed` inside `server/` so the **shared demo users** below are created in your local Mongo.

> If Node isn't installed on your host (i.e. you're a pure Docker user), the script only creates the `.env` files and exits cleanly. For seeding, run:
> `docker compose up -d mongodb redis server && docker compose exec server npm run seed`

### Shared demo credentials

Every collaborator's `sboup_dev` database is seeded with **the same three accounts** so you can log in on both web and mobile without registering anything:

| Role | Email | Password |
|------|-------|----------|
| **Admin** | `admin@skillbridge.ug` | `Admin@12345` |
| **Employer** | `employer@demo.ug` | `Employer@12345` |
| **Skilled Worker** | `worker@demo.ug` | `Worker@12345` |

The seeder is idempotent — re-running it will not duplicate or reset these users. Source: [`server/src/utils/seeder.js`](../server/src/utils/seeder.js).

### For Docker users (recommended)

Most environment variables are **already set inside `docker-compose.yml`**, so Docker users only need a `.env` file for secrets and optional API keys:

```bash
cp .env.example .env
```

The committed `.env.example` already contains a safe dev `JWT_SECRET`, so the server boots immediately. Replace it before any non-dev deployment.

**Optional** (only if working on specific features):

| Variable | When needed |
|----------|-------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth login |
| `SENDGRID_API_KEY` | Email notifications |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | File uploads to S3 |
| `YOUTUBE_API_KEY` | Learning engine YouTube integration |

> The `.env` file is gitignored and will never be committed. Each contributor creates their own.

### For manual (non-Docker) users

See the full `.env.example` file for all available variables. You will need to configure MongoDB URI, Redis host, and all service URLs manually.

---

## 6. Running with Docker (Recommended)

### Start everything in one command

From the project root, after a fresh clone:

```bash
bash scripts/setup.sh && bash scripts/dev.sh
```

That's the full setup:

1. **`bash scripts/setup.sh`** — bootstraps the workspace (creates any missing `.env` files, installs Node deps for `server`/`client`/`mobile`, and seeds Mongo with the shared demo accounts). Idempotent — re-running is safe; only needed after a fresh clone or after dependencies change.
2. **`bash scripts/dev.sh`** — interactive launcher. Prompts for **mobile mode** (Wi-Fi / USB / skip), auto-detects your LAN IP and exports `CV_PUBLIC_BASE_URL` so generated CV PDFs render on the phone, brings up the Docker stack detached, and starts Expo on the host. `Ctrl+C` tears the stack down cleanly via the script's exit trap.

On subsequent runs you usually only need `bash scripts/dev.sh` — no rebuild, no setup script.

### `dev.sh` flags

| Flag | When to use |
|------|------|
| *(none)* | Day-to-day. Uses cached images. Fast. |
| `--pull` | Fetch the latest pre-built images for `cv-generation` and `learning-engine` from GHCR before starting. **Strongly recommended on slow / throttled networks** — see [section 7](#7-pre-built-images-on-ghcr). |
| `--build` | Force a local rebuild. Use after editing a `Dockerfile` or `requirements.txt` you own. |

Equivalent env vars: `BUILD=1` and `PULL=1`.

### Start specific services only (without dev.sh)

If you want backend-only without the mobile picker:

```bash
# Backend + database only
docker compose up -d mongodb redis server

# Backend + web client
docker compose up -d mongodb redis server client

# Everything except mobile (which is started via Expo on the host)
docker compose up -d --scale mobile=0
```

Pass `--build` to any of these if you've edited a Dockerfile.

### Stop services

```bash
# Stop all services (preserves data)
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v
```

If you started via `dev.sh`, just press `Ctrl+C` in that terminal — the script's exit trap runs `docker compose down` for you.

### Rebuild after dependency changes

If you've edited a `package.json`, `requirements.txt`, or `Dockerfile`:

```bash
# For everything in the stack
bash scripts/dev.sh --build

# For one service only
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

If the change is to `cv-generation` or `learning-engine` and you push it to `main`, GitHub Actions will rebuild and push a fresh image to GHCR automatically — your teammates pull rather than rebuilding.

---

## 7. Pre-Built Images on GHCR

The two heaviest AI services in this repo — `cv-generation` and `learning-engine` — pull large dependencies (PyTorch CPU wheel + multi-GB HuggingFace model weights). On throttled networks (campus / MikroTik / hotel / mobile-tethered) those builds can take **45 minutes to several hours** and frequently time out mid-stream.

To skip that pain, the repo ships a GitHub Actions workflow ([.github/workflows/build-images.yml](../.github/workflows/build-images.yml)) that builds these two services on GitHub's runners (fast, reliable network) and pushes the resulting images to **GitHub Container Registry (GHCR)**. Collaborators pull the finished images instead of building.

### Published images

| Service | Image | Visibility |
|---------|-------|------------|
| `cv-generation` | `ghcr.io/turyahebwalex/sboup-cv:latest` | Public |
| `learning-engine` | `ghcr.io/turyahebwalex/sboup-learning:latest` | Public |

Public visibility means **no `docker login` is required to pull** — anyone on a clean Docker install can fetch them.

### Why only these two

Each AI service is owned by a specific teammate:

| Service | Owner | Published from this repo? |
|---------|-------|---------------------------|
| `cv-generation`, `learning-engine` | Alex | ✅ Yes |
| `matching-engine`, `chatbot-service` | Allan | No (Allan publishes from his own workflow) |
| `fraud-detection` | Rebecca / Vanessa | No |

The shared shell (`server`, `client`, `mobile`) builds quickly enough on any laptop that pre-publishing isn't worth the CI time. They build locally from source.

### Pulling pre-built images

```bash
bash scripts/dev.sh --pull
```

`dev.sh` runs `docker compose pull --ignore-pull-failures` first — successful pulls overwrite the local cache, failed ones (e.g. you're offline) silently fall back to whatever's already cached. Then the stack starts.

To pull manually (without dev.sh):

```bash
docker compose pull cv-generation learning-engine
docker compose up -d
```

### How re-builds reach you

When Alex pushes a change under `ai-services/cv-generation/` or `ai-services/learning-engine/` to `main`, the workflow rebuilds and pushes new `:latest` images. The next time you run `bash scripts/dev.sh --pull`, you receive them. No notification — just always pull when you `git pull`.

To check what version of the cv image you have locally:

```bash
docker image inspect ghcr.io/turyahebwalex/sboup-cv:latest --format '{{.Created}} {{index .RepoDigests 0}}'
```

### Image-tag strategy in `docker-compose.yml`

Services Alex publishes have **both** `image:` and `build:` fields:

```yaml
cv-generation:
  image: ghcr.io/turyahebwalex/sboup-cv:latest    # ← pulled when --pull
  build:
    context: ./ai-services/cv-generation          # ← built when --build
```

This lets the same compose file drive both flows: `--pull` fetches the registry image, `--build` rebuilds from source and tags the local image with the same name. A vanilla `docker compose up` reuses whichever copy is already cached.

Services Alex doesn't publish (server, client, mobile, matching, fraud, chatbot) have only `build:` — Compose builds them locally and never tries to pull from GHCR.

---

## 8. How Docker Guarantees Correct Versions for All Contributors & CI/CD

> **This is the key advantage of our Docker setup.** Every collaborator and CI/CD pipeline gets identical, reproducible environments automatically — no "works on my machine" issues.

### How it works

When any contributor runs `docker compose up --build`, Docker follows the exact same steps on every machine:

**Step 1 — Base images are pinned in each Dockerfile:**

| Service | Dockerfile `FROM` | Guarantees |
|---------|-------------------|------------|
| Server | `node:18-alpine` | Node.js 18 LTS |
| Client | `node:18-alpine` | Node.js 18 LTS |
| Mobile | `node:20-alpine` | Node.js 20 LTS (required by Expo SDK 54) |
| AI Services | `python:3.11-slim` | Python 3.11 |
| MongoDB | `mongo:7` (image) | MongoDB 7 |
| Redis | `redis:7-alpine` (image) | Redis 7 |

**Step 2 — Dependencies are installed from lock files inside the container:**

Each Dockerfile copies `package.json` (or `requirements.txt`) **first**, then runs `npm install` (or `pip install`). This means:

```dockerfile
# Example: server/Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./          # ← copies package.json (and package-lock.json if present)
RUN npm install                # ← installs exact versions defined in the manifest
COPY . .                       # ← then copies source code
```

- `package.json` specifies version ranges (e.g., `"expo": "~54.0.0"`)
- `requirements.txt` pins exact Python package versions
- These files are **committed to Git**, so every contributor gets the same dependency specifications

**Step 3 — `.dockerignore` prevents local contamination:**

The `mobile/.dockerignore` file ensures that a contributor's local `node_modules/` folder is **never** copied into the container:

```
node_modules
npm-debug.log
.expo
```

Without this, `COPY . .` would overwrite the container's freshly installed (correct) packages with whatever version the contributor has locally — potentially causing version mismatches.

> All three Node services (`server/`, `client/`, `mobile/`) ship with their own `.dockerignore`, so this protection is in place for every build.

**Step 4 — `docker-compose.yml` sets all runtime configuration:**

Environment variables like database URIs, service URLs, and ports are defined in `docker-compose.yml` — not in local `.env` files. This means every contributor's containers connect to the same internal Docker services:

```yaml
environment:
  - MONGODB_URI=mongodb://mongodb:27017/sboup_dev   # Docker internal DNS
  - REDIS_HOST=redis                                 # Docker service name
  - MATCHING_SERVICE_URL=http://matching-engine:5001 # Docker service name
```

### Summary: Why collaborators never need manual steps

| Concern | How Docker handles it |
|---------|-----------------------|
| **Node.js version** | Pinned in `FROM node:18-alpine` / `FROM node:20-alpine` |
| **Python version** | Pinned in `FROM python:3.11-slim` |
| **npm packages** | Installed from `package.json` inside the container at build time |
| **Python packages** | Installed from `requirements.txt` inside the container at build time |
| **MongoDB / Redis** | Official Docker images, version-pinned (`mongo:7`, `redis:7-alpine`) |
| **Environment variables** | Defined in `docker-compose.yml` with sensible defaults |
| **Local files leaking in** | `.dockerignore` blocks `node_modules/`, `__pycache__/`, etc. |
| **"Works on my machine"** | Eliminated — containers are identical on every OS |

### `.dockerignore` coverage

Each Node service has its own `.dockerignore` so that `COPY . .` in a Dockerfile never drags in the contributor's host `node_modules` (or other local junk) on top of the container's freshly installed packages:

| File | Excludes |
|------|----------|
| [`server/.dockerignore`](../server/.dockerignore) | `node_modules`, `logs`, `uploads`, `.env*`, `.git`, `npm-debug.log` |
| [`client/.dockerignore`](../client/.dockerignore) | `node_modules`, `build`, `.env*`, `.git`, `npm-debug.log` |
| [`mobile/.dockerignore`](../mobile/.dockerignore) | `node_modules`, `npm-debug.log`, `.expo` |

If you add a new Node service in the future, copy this pattern.

### For CI/CD pipelines

A CI/CD pipeline (GitHub Actions, GitLab CI, etc.) simply needs to:

```yaml
# Example: GitHub Actions
steps:
  - uses: actions/checkout@v4
  - name: Build and run all services
    run: docker compose up --build -d
  - name: Run tests
    run: docker compose exec server npm test
```

No `nvm use`, no `pip install`, no version matrix — Docker provides the complete environment.

---

## 9. Running the Mobile App (Expo Go on Physical Device)

`scripts/dev.sh` handles all of this — it brings up the Docker stack and starts Expo on the host (not inside Docker) so the QR code is reachable from your phone over your real LAN. The in-Docker `mobile` service still exists for collaborators who don't want Node locally, but it's excluded by default in `dev.sh`.

### Prerequisites

- **Expo Go** installed on your phone from [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) or [App Store](https://apps.apple.com/app/expo-go/id982107779)
- For Wi-Fi mode: phone and laptop on the **same Wi-Fi network**
- For USB mode: `adb` installed (`sudo apt install adb` on Ubuntu) and phone in **Developer Options → USB debugging** mode

### Three modes

When you run `bash scripts/dev.sh` it asks:

```
How would you like to run the mobile app?
  1) Wi-Fi  — scan QR in Expo Go (phone + laptop on the same Wi-Fi)
  2) USB    — phone plugged in with USB debugging on (faster reload)
  3) Skip   — only run backend + web client
```

| Mode | When to pick it |
|------|-----------------|
| **1. Wi-Fi** | Default. Both devices on the same Wi-Fi, the network allows device-to-device traffic. Prints a QR you scan in Expo Go. |
| **2. USB** | Restrictive Wi-Fi (campus / hotel / corporate with client isolation), or you want faster live reloads. `adb reverse` tunnels Metro and the API over the USB cable. Press **`a`** in the Expo menu to launch the app. |
| **3. Skip** | You're only working on the web client or backend — no mobile build. |

### How the backend URL resolves

You normally don't set anything. [`mobile/src/services/api.js`](../mobile/src/services/api.js) auto-detects the backend host from Metro's address. Collaborators on the same Wi-Fi as their phone just run `bash scripts/dev.sh` and log in.

The override variable is only for special cases:

| Variable | Purpose |
|----------|---------|
| `EXPO_PUBLIC_API_URL` | Forces a specific API URL — needed when the laptop and phone are **not** on the same network (e.g. you're tunnelling the backend over the internet for a remote teammate). Leave empty otherwise. |

Example for a remote collaborator using a public backend tunnel:

```bash
EXPO_PUBLIC_API_URL=https://my-backend.loca.lt/api bash scripts/dev.sh
```

### How CV PDF URLs resolve

The `cv-generation` service embeds `PUBLIC_BASE_URL` into every PDF URL it returns. If left at the default `localhost`, the mobile client opens the URL in Google Drive's PDF viewer and Drive can't fetch `http://localhost` from the phone — the user sees "Cannot display PDF".

`scripts/dev.sh` resolves your laptop's LAN IP via `ip route get` and exports `CV_PUBLIC_BASE_URL=http://<lan-ip>:5003` automatically before bringing up the stack. Skipped on USB mode (where `adb reverse` already remaps localhost on the phone). To override manually:

```bash
export CV_PUBLIC_BASE_URL=http://<your-lan-ip-or-tunnel>:5003
docker compose up -d cv-generation
```

### Why `network_mode: host`?

Several services (`server`, `cv-generation`, `mobile`) use `network_mode: host` because (a) Expo in LAN mode must advertise the host's real IP so the phone can connect, and (b) Docker's default bridge subnet is sometimes blocked outright on restrictive Wi-Fi (campus / corporate). Host networking sidesteps both issues.

---

## 10. Running Without Docker (Manual Setup)

> **Note:** Docker is the recommended approach. Manual setup requires installing and managing all dependencies yourself.

### 10.1 Start MongoDB

```bash
# If installed locally
sudo systemctl start mongod

# Or run via Docker (just MongoDB)
docker run -d -p 27017:27017 --name sboup-mongo mongo:7
```

### 10.2 Start Redis

```bash
# If installed locally
sudo systemctl start redis-server

# Or run via Docker (just Redis)
docker run -d -p 6379:6379 --name sboup-redis redis:7-alpine
```

### 10.3 Start the Backend Server

```bash
cd server
npm install
cp ../.env .env       # copy environment config
npm run dev           # starts with auto-reload
```

The API will be at **http://localhost:5000**.

To seed the database with initial data:
```bash
npm run seed
```

### 10.4 Start the Web Client

In a **new terminal**:

```bash
cd client
npm install
npm start
```

The web app will open at **http://localhost:3000**.

### 10.5 Start AI Services (optional)

Each AI service runs independently. In a **new terminal** for each:

```bash
# Example: matching engine
cd ai-services/matching-engine
python3 -m venv venv
source venv/bin/activate        # Linux/macOS
# venv\Scripts\activate          # Windows
pip install -r requirements.txt
python run.py
```

Repeat for: `fraud-detection`, `cv-generation`, `learning-engine`, `chatbot-service`.

### 10.6 Start the Mobile App (without Docker)

```bash
cd mobile
npm install
npx expo start
```

- Press **`a`** to open on Android emulator
- Press **`i`** to open on iOS simulator (macOS only)
- Scan the **QR code** with Expo Go on your phone

---

## 11. Verifying Everything Works

### Backend health check

```bash
curl http://localhost:5000/api/health
# Expected: {"status":"ok"} or similar
```

### Web client

Open http://localhost:3000 in your browser — you should see the login page.

### Register a test user

Use the web client, mobile app, or the API directly:

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test1234!","role":"worker"}'
```

### Test login

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234!"}'
```

### Verify Docker containers are running

```bash
docker compose ps
```

Expected output shows all services with status `Up`:

```
NAME              STATUS
sboup-mongodb     Up
sboup-redis       Up
sboup-server      Up
sboup-client      Up
sboup-matching    Up
sboup-fraud       Up
sboup-cv          Up
sboup-learning    Up
sboup-chatbot     Up
sboup-mobile      Up
```

---

## 12. Contributing — Git Workflow

### 12.1 Create a Feature Branch

Always work on a branch — never commit directly to `main`:

```bash
git checkout main
git pull origin main          # get latest changes
git checkout -b feature/your-feature-name
```

**Branch naming conventions:**

| Prefix | Use for | Example |
|--------|---------|---------|
| `feature/` | New functionality | `feature/add-user-search` |
| `fix/` | Bug fixes | `fix/login-validation` |
| `refactor/` | Code improvements | `refactor/auth-middleware` |
| `docs/` | Documentation only | `docs/update-readme` |

### 12.2 Make Your Changes

Edit code, then stage and commit:

```bash
git add <specific-files>      # stage specific files (preferred)
git commit -m "Add: description of what you did"
```

**Commit message prefixes:**
- `Add:` — new feature
- `Fix:` — bug fix
- `Update:` — enhancement to existing feature
- `Refactor:` — code restructuring
- `Docs:` — documentation only

### 12.3 After Changing Dependencies

If you modify `package.json`, `requirements.txt`, or a `Dockerfile`, **always rebuild the affected container** to verify it works before committing:

```bash
# Rebuild the whole stack
bash scripts/dev.sh --build

# Or just one service
docker compose build --no-cache <service-name>
docker compose up -d <service-name>
```

This ensures your teammates and CI/CD will also be able to build successfully.

**For `cv-generation` and `learning-engine` only:** after your change is merged to `main`, the GitHub Actions workflow ([.github/workflows/build-images.yml](../.github/workflows/build-images.yml)) rebuilds and pushes a new `:latest` image to GHCR within 2–4 minutes (cached) or 10–15 minutes (cold cache). Teammates pick it up via `bash scripts/dev.sh --pull` on their next run.

### 12.4 Keep Your Branch Up to Date

Before pushing, sync with the latest main:

```bash
# For direct collaborators
git fetch origin
git rebase origin/main

# For fork contributors
git fetch upstream
git rebase upstream/main
```

If there are conflicts, resolve them, then:
```bash
git add .
git rebase --continue
```

### 12.5 Push Your Branch

```bash
git push -u origin feature/your-feature-name
```

### 12.6 Open a Pull Request

1. Go to the repository on GitHub
2. Click **"Compare & pull request"** (or **New Pull Request**)
3. Set base branch to `main`
4. Write a clear title and description of your changes
5. Submit the PR

### 12.7 After Your PR is Merged

```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name    # delete the local branch
```

---

## 13. Common Issues & Troubleshooting

### Docker: `pip install` times out building cv-generation or learning-engine

The torch wheel and HuggingFace model weights are multi-hundred-MB downloads that throttled networks (campus / MikroTik / hotel Wi-Fi) cannot sustain. Skip the build entirely and pull the pre-built image instead:

```bash
bash scripts/dev.sh --pull
```

This fetches `ghcr.io/turyahebwalex/sboup-{cv,learning}:latest` (built on GitHub's runners) and uses them in place of a local build. See [section 7](#7-pre-built-images-on-ghcr).

If you absolutely need to build locally (e.g. you're modifying the Dockerfile), retry the build — pip downloads survive across retries thanks to the BuildKit cache mount and the shell-level retry loop in `ai-services/cv-generation/Dockerfile`. Total retry attempts: 5.

### Generated CV PDF says "Cannot display PDF" on the phone

The PDF URL embeds whatever host the cv-generation service thinks it's reachable at. Default is `localhost`, which Drive's PDF viewer can't fetch from the phone. `dev.sh` auto-detects your LAN IP and exports `CV_PUBLIC_BASE_URL`. If detection failed (you'd see a warning at startup), set it manually:

```bash
export CV_PUBLIC_BASE_URL=http://<your-laptop-LAN-IP>:5003
docker compose up -d cv-generation        # recreates with new env var
```

Find your LAN IP with `ip route get 1.1.1.1` (Linux) or `ipconfig getifaddr en0` (macOS).

### Docker: `npm install` hangs or fails with DNS errors

If using **snap Docker**, builds may fail to resolve DNS. The `network: host` directive in `docker-compose.yml` build sections handles this, but if it persists:

```bash
# Check Docker DNS
docker run --rm alpine nslookup registry.npmjs.org

# If it fails, restart Docker
sudo systemctl restart docker       # or: sudo snap restart docker
```

### Docker: Container exits immediately

Check the logs:
```bash
docker compose logs <service-name>
```

### Docker: `react-scripts: not found` in client container

The volume mount `./client:/app` may shadow the container's `node_modules`. Ensure the anonymous volume is present in `docker-compose.yml`:

```yaml
volumes:
  - ./client:/app
  - /app/node_modules    # ← preserves container's node_modules
```

Then rebuild: `docker compose build --no-cache client`

### Mobile: QR code not scannable / phone can't connect

1. Ensure your phone and computer are on the **same WiFi network**
2. Check that `network_mode: host` is set for the mobile service
3. If the QR code URL shows `127.0.0.1`, the container isn't using host networking correctly

### Mobile: `Uncaught Error: java.io.IOException: Failed to download remote update`

Expo Go shows this when it can't fetch the Metro JS bundle from your dev server. Causes and fixes, in order of likelihood:

1. **Phone and laptop on different WiFi networks** (or the WiFi uses client isolation, common on university/hotel networks). Put both on the same SSID, or skip WiFi entirely by running Expo in tunnel mode:
   ```bash
   cd mobile
   npm run start:tunnel
   ```
   The tunnel proxies the bundle via ngrok so the phone doesn't need your LAN.

2. **`EXPO_PUBLIC_API_URL` is set to a stale value**. The app normally auto-detects the backend from Metro's host (see [`mobile/src/services/api.js`](../mobile/src/services/api.js)), so leave `EXPO_PUBLIC_API_URL` empty unless you're deliberately using a tunnelled backend for a remote collaborator. If a `mobile/.env` exists with a hard-coded LAN IP, delete that line.

3. **Firewall blocks port 8081** (Metro) on your computer. Allow it:
   ```bash
   sudo ufw allow 8081/tcp    # Linux
   ```

4. **Stale Metro cache.** Clear it:
   ```bash
   cd mobile && npx expo start --clear
   ```

5. **Expo Go SDK mismatch.** The app in `mobile/package.json` uses Expo SDK 54. Update Expo Go on your phone to the version that supports SDK 54 (Play Store / App Store).

### Mobile: `URL.protocol is not implemented`

The Hermes JS engine has incomplete `URL` support. The `react-native-url-polyfill` package in `mobile/package.json` fixes this. Ensure `App.js` imports it at the very top:

```js
import 'react-native-url-polyfill/auto';  // must be first import
import React from 'react';
```

### Mobile: `"main" has not been registered`

Ensure `mobile/package.json` has:
```json
"main": "expo/AppEntry"
```
Not `"main": "App.js"` — Expo's `AppEntry` handles `AppRegistry.registerComponent` automatically.

### Mobile: SDK version mismatch with Expo Go

The container must build with the same Expo SDK version that your Expo Go app supports. Check:

```bash
docker compose logs mobile | grep "Installed expo version"
```

This should match the SDK version shown in Expo Go on your phone.

### Port already in use

```bash
# Find what's using the port
lsof -i :5000    # replace with the port number
kill -9 <PID>
```

### MongoDB connection refused

```bash
# Check if MongoDB container is running
docker compose ps mongodb

# Check logs
docker compose logs mongodb
```

### CORS errors in browser

Ensure `CLIENT_URL=http://localhost:3000` is set (already configured in `docker-compose.yml` for Docker users).

---

## 14. Ports Summary

| Service | Port | Container Name |
|---------|------|----------------|
| Backend API | 5000 | sboup-server |
| Web Client | 3000 | sboup-client |
| MongoDB | 27017 | sboup-mongodb |
| Redis | 6379 | sboup-redis |
| Matching Engine | 5001 | sboup-matching |
| Fraud Detection | 5002 | sboup-fraud |
| CV Generation | 5003 | sboup-cv |
| Learning Engine | 5004 | sboup-learning |
| Chatbot Service | 5005 | sboup-chatbot |
| Mobile (Expo Dev Server) | 8081 | sboup-mobile |
