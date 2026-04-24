# SBOUP — Full Setup & Contributor Guide

A complete guide for contributors to clone, set up, run, and contribute to the **Skill-Based Opportunities and Upskilling Platform (SBOUP)**.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Getting the Code](#2-getting-the-code)
3. [Project Structure](#3-project-structure)
4. [Architecture Overview](#4-architecture-overview)
5. [Environment Configuration](#5-environment-configuration)
6. [Running with Docker (Recommended)](#6-running-with-docker-recommended)
7. [How Docker Guarantees Correct Versions for All Contributors & CI/CD](#7-how-docker-guarantees-correct-versions-for-all-contributors--cicd)
8. [Running the Mobile App (Expo Go on Physical Device)](#8-running-the-mobile-app-expo-go-on-physical-device)
9. [Running Without Docker (Manual Setup)](#9-running-without-docker-manual-setup)
10. [Verifying Everything Works](#10-verifying-everything-works)
11. [Contributing — Git Workflow](#11-contributing--git-workflow)
12. [Common Issues & Troubleshooting](#12-common-issues--troubleshooting)
13. [Ports Summary](#13-ports-summary)

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

### Start all services

```bash
# From the project root
docker compose up --build
```

That's it. This single command:
- Pulls MongoDB 7 and Redis 7 images
- Builds containers for server, client, all 5 AI services, and mobile
- Installs all Node.js and Python dependencies **inside containers**
- Starts everything with correct environment variables and networking

### Start specific services only

```bash
# Backend + database only (no AI services or frontend)
docker compose up --build mongodb redis server

# Backend + web client (most common for web development)
docker compose up --build mongodb redis server client

# Everything except mobile
docker compose up --build mongodb redis server client matching-engine fraud-detection cv-generation learning-engine chatbot-service
```

### Stop services

```bash
# Stop all services (preserves data)
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v
```

### Rebuild after dependency changes

If someone updates a `package.json`, `requirements.txt`, or `Dockerfile`:

```bash
docker compose build --no-cache <service-name>
docker compose up <service-name>

# Or rebuild everything
docker compose up --build
```

---

## 7. How Docker Guarantees Correct Versions for All Contributors & CI/CD

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

> **Recommendation:** Add `.dockerignore` files to `server/` and `client/` as well (see below).

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

### Best practice: Adding `.dockerignore` to all services

Currently only `mobile/` has a `.dockerignore`. For maximum safety, add one to `server/` and `client/` as well:

**`server/.dockerignore`** and **`client/.dockerignore`**:
```
node_modules
npm-debug.log
.env
.env.*
```

This prevents local `node_modules` from overriding the container's installed packages in any service.

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

## 8. Running the Mobile App (Expo Go on Physical Device)

The mobile app runs as an **Expo development server inside Docker** and serves a QR code you scan with the Expo Go app on your phone.

### Prerequisites

- Your phone and computer must be on the **same WiFi network**
- Install **Expo Go** on your phone from [Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent) or [App Store](https://apps.apple.com/app/expo-go/id982107779)

### Start the mobile container

```bash
# Start backend + mobile (mobile depends on the backend API)
docker compose up --build mongodb redis server mobile
```

### What happens inside the container

1. Docker builds a `node:20-alpine` container
2. `npm install` installs Expo SDK 54, React Native 0.79, and all dependencies
3. `npx expo start --lan` starts the Expo dev server in LAN mode
4. The container runs with `network_mode: host`, sharing your computer's network interfaces
5. A **QR code** appears in the terminal output

### Scan the QR code

1. Open **Expo Go** on your phone
2. Scan the QR code displayed in the terminal (e.g., `exp://192.168.x.x:8081`)
3. The app will download the JavaScript bundle and launch on your phone

### Key environment variables for mobile

| Variable | Set in | Purpose |
|----------|--------|---------|
| `EXPO_PUBLIC_API_URL` | `docker-compose.yml` | Backend API URL the mobile app connects to |
| `EXPO_OFFLINE=1` | `docker-compose.yml` | Skips Expo API server checks (avoids DNS issues in Docker) |

### Configuring the API URL for physical devices

The default `EXPO_PUBLIC_API_URL=http://localhost:5000/api` works when the backend is also running in Docker with host networking. If your phone can't reach `localhost`, update it to your computer's LAN IP:

```bash
# Find your computer's IP
ip addr show | grep "inet " | grep -v 127.0.0.1
```

Then update in `docker-compose.yml`:
```yaml
environment:
  - EXPO_PUBLIC_API_URL=http://<YOUR-COMPUTER-IP>:5000/api
```

### Why `network_mode: host`?

Expo in LAN mode needs to advertise the host machine's real IP address so your phone can connect. A bridged Docker network would isolate the container, making the QR code point to an unreachable internal IP. `network_mode: host` lets the Expo server use the host's network interfaces directly.

---

## 9. Running Without Docker (Manual Setup)

> **Note:** Docker is the recommended approach. Manual setup requires installing and managing all dependencies yourself.

### 9.1 Start MongoDB

```bash
# If installed locally
sudo systemctl start mongod

# Or run via Docker (just MongoDB)
docker run -d -p 27017:27017 --name sboup-mongo mongo:7
```

### 9.2 Start Redis

```bash
# If installed locally
sudo systemctl start redis-server

# Or run via Docker (just Redis)
docker run -d -p 6379:6379 --name sboup-redis redis:7-alpine
```

### 9.3 Start the Backend Server

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

### 9.4 Start the Web Client

In a **new terminal**:

```bash
cd client
npm install
npm start
```

The web app will open at **http://localhost:3000**.

### 9.5 Start AI Services (optional)

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

### 9.6 Start the Mobile App (without Docker)

```bash
cd mobile
npm install
npx expo start
```

- Press **`a`** to open on Android emulator
- Press **`i`** to open on iOS simulator (macOS only)
- Scan the **QR code** with Expo Go on your phone

---

## 10. Verifying Everything Works

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

## 11. Contributing — Git Workflow

### 11.1 Create a Feature Branch

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

### 11.2 Make Your Changes

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

### 11.3 After Changing Dependencies

If you modify `package.json`, `requirements.txt`, or a `Dockerfile`, **always rebuild the affected container** to verify it works before committing:

```bash
# Rebuild and test the specific service
docker compose build --no-cache <service-name>
docker compose up <service-name>
```

This ensures your teammates and CI/CD will also be able to build successfully.

### 11.4 Keep Your Branch Up to Date

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

### 11.5 Push Your Branch

```bash
git push -u origin feature/your-feature-name
```

### 11.6 Open a Pull Request

1. Go to the repository on GitHub
2. Click **"Compare & pull request"** (or **New Pull Request**)
3. Set base branch to `main`
4. Write a clear title and description of your changes
5. Submit the PR

### 11.7 After Your PR is Merged

```bash
git checkout main
git pull origin main
git branch -d feature/your-feature-name    # delete the local branch
```

---

## 12. Common Issues & Troubleshooting

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

2. **`EXPO_PUBLIC_API_URL` points to `localhost`**. On a phone, `localhost` is the phone itself, so API calls go nowhere. Set it to your computer's LAN IP in `mobile/.env`:
   ```env
   EXPO_PUBLIC_API_URL=http://192.168.x.y:5000/api
   ```
   Find your IP with `ip -4 addr show` (Linux) or `ipconfig getifaddr en0` (macOS).

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

## 13. Ports Summary

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
