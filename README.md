# SKILL-BASED OPPORTUNITIES AND UPSKILLING PLATFORM (SBOUP)

## Group Name
**BSE26-2-FYP-SBOUP**

---

## Group Members & Registration Numbers

| Name | Registration Number |
|-----|---------------------|
| Nakanwagi Vanesa | 22/U/6530 |
| Yapyeko Rebecca | 22/U/3962/EVE |
| Lutalo Allan | 22/U/3330/PS |
| Turyahabwa Alex | 18/U/23405/EVE |

---

## Project Description

The **Skill-Based Opportunities and Upskilling Platform (SBOUP)** is an AI-enhanced web and mobile application designed to bridge the gap between multi-skilled workers and potential employers in Uganda.

The platform addresses critical challenges identified through field research conducted with **119 respondents**, including:

- **Skill invisibility**: 29.1% of informal workers lack platforms to effectively showcase their skills.
- **Trust deficits**: 15–20% of workers have encountered fraud when seeking employment opportunities.
- **Documentation barriers**: 90.9% of respondents demand AI-powered CV generation tools.
- **Disconnected learning–employment pathways**: 72.3% want integrated platforms that connect skills development directly to job opportunities.

SBOUP integrates **AI-powered CV generation**, **skill verification**, **learning pathways**, and **employment matching** to create a trusted, inclusive digital ecosystem for skills visibility, upskilling, and employment access.

---

## Key Objectives
- Enable workers to showcase verified skills digitally
- Provide AI-assisted CV and profile generation
- Connect users to relevant job opportunities
- Integrate learning and upskilling pathways with employment
- Reduce fraud and improve trust between workers and employers

---

## Target Users
- Formal multi-skilled workers
- Informal multi-skilled workers
- Potential Employers

---

## Technologies Used

### SBOUP Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend (Web) | React.js | Responsive web application with component-based UI |
| Frontend (Mobile) | React Native | Cross-platform mobile application for Android and iOS |
| Backend | Node.js + Express | RESTful API server, business logic, authentication |
| AI Services | Python (Flask) | Microservices for ML models: matching, fraud detection, NLP |
| Database | MongoDB Atlas | Primary document-oriented database |
| Caching | Redis | Session management, caching, rate limiting |
| File Storage | Amazon S3 / Azure Blob | User uploads, generated CVs, portfolio files |
| Authentication | JWT + OAuth 2.0 | Token-based auth with optional Google OAuth |
| Email | SendGrid / Amazon SES | Transactional emails: verification, notifications |
| Push Notifications | FCM + APNs | Mobile push notifications for Android and iOS |
| Containerisation | Docker + Kubernetes | Application packaging, deployment, and scaling |
| ML Libraries | scikit-learn, NLTK | Machine learning models and NLP processing |

---

## How to Run the Project

Full git/contributor guide: [docs/git-setup-and-contributor-guide.md](docs/git-setup-and-contributor-guide.md)

### Prerequisites

Install these once on each collaborator's machine — the dev launcher refuses to start without them:

| Tool | Minimum | Why |
|------|---------|-----|
| **Docker Desktop** or **Docker Engine + Compose v2** | 24+ | Runs MongoDB, Redis, the API gateway, the web client, and all five AI microservices. |
| **Node.js** | 18 LTS or newer | `setup.sh` runs `npm install` for `server/`, `client/`, and `mobile/`, plus seeds the DB. |
| **Git** | any modern version | Cloning + branch hygiene. |
| **Expo Go** on the test phone | latest from Play Store / App Store | Loads the React Native bundle over LAN or USB. Same app for Android and iOS. |
| **adb** *(only if you'll run mobile via USB)* | any | `bash scripts/dev.sh` option 2 uses `adb reverse` to tunnel Metro + the API over USB. |

Verify in one shot:

```bash
docker --version && docker compose version && node --version && git --version
```

### First-time run after cloning

Do this **exactly once** per machine. The order matters — `setup.sh` must finish before any `npm run` or `expo start` is attempted, otherwise `node_modules` isn't yet installed.

```bash
git clone https://github.com/turyahebwalex/BSE26-2-FYP-SBOUP.git
cd BSE26-2-FYP-SBOUP
bash scripts/setup.sh && bash scripts/dev.sh
```

`setup.sh` does the following, in order, and skips any step that's already done:

1. Copies every `.env.example → .env` (root + `server/`, `client/`, `mobile/`, all `ai-services/*/`).
2. Installs Node dependencies under `server/`, `client/`, and `mobile/`.
3. Starts MongoDB + Redis via Docker if they aren't already running.
4. Seeds the database with the [shared demo users](#shared-demo-credentials-seeded-on-every-dev-database).

Then `dev.sh` brings the rest of the stack up (Docker compose, mobile Expo). When it prompts for mobile mode, **choose option 1 (Wi-Fi)** unless you have a USB cable + adb (option 2).

> **Important — don't skip `setup.sh` on first run.** It's the only thing that creates `.env` files. If you go straight to `dev.sh`, Docker compose will fall back to placeholders and the API will boot without a working JWT secret.

### Subsequent runs (everyday dev loop)

```bash
bash scripts/dev.sh
```

That's it. No `setup.sh` needed unless someone has changed `package.json`, the seeder, or `.env.example`. The launcher reuses the existing Docker images (no rebuilds), reuses the seeded database, and just brings the stack back up plus Expo.

### Pull from main: when to re-run what

| What changed in the pull | Run before `dev.sh` |
|---|---|
| Only application code (`.js` / `.py` / templates) | nothing — `dev.sh` is enough |
| `package.json`, `requirements.txt`, or `Dockerfile` | `bash scripts/setup.sh` to refresh `node_modules`, plus `bash scripts/dev.sh --build` to rebuild changed images |
| `.env.example` (new variable added) | `bash scripts/setup.sh` so the new key gets copied into your local `.env` |
| AI service code under `ai-services/cv-generation` or `ai-services/learning-engine` | `bash scripts/dev.sh --pull` to grab the freshly-built GHCR image instead of rebuilding locally |

### Avoiding Expo "failed to download remote update" + port conflicts

The Expo Go client times out after ~30 seconds when fetching the JS bundle, but a **first-time** Metro bundle on this project takes 35–45 seconds (1100+ modules, Hermes transform). That timing mismatch is the single biggest source of "failed to download remote update" reports. Follow these rules to avoid it:

**Before running `dev.sh`:**

1. **Make sure nothing else is holding port 8081 or 5000.** If a previous Metro/server is still alive from an earlier session, the new run picks port 8082 instead — and Expo Go on the phone, if you scan the freshly-printed QR, then fails to resolve the bundle. Kill stale processes first:

   ```bash
   fuser -k 8081/tcp 5000/tcp 2>/dev/null || true
   docker compose rm -fs mobile        # only relevant if you've ever run `docker compose up` without dev.sh
   ```

2. **Phone and laptop must be on the same Wi-Fi network for Wi-Fi mode** (option 1). Tethering off the phone's hotspot is the most reliable setup — campus / public Wi-Fi often blocks device-to-device traffic to ports 8081/5000.

**On the phone:**

3. **Don't scan the QR while Metro is still building the bundle for the first time.** Wait until you see the line `Android Bundled <Nms> node_modules/expo/AppEntry.js (1122 modules)` in the terminal. *Only then* scan.

4. **Pre-warm the bundle from the laptop before scanning** — turns the phone's first bundle fetch into a cache hit (< 1 s) instead of a 35-second wait:

   ```bash
   curl -s "http://$(ip route get 1.1.1.1 | awk '/src/ {print $7}'):8081/node_modules/expo/AppEntry.bundle?platform=android&dev=true" >/dev/null
   ```

   Run that in a separate terminal once Metro is up. When it returns (≈ 40 s the first time, < 2 s afterwards), scan the QR.

5. **If Expo Go is stuck on "Failed to download remote update":** force-close Expo Go (swipe from recents — don't just background it), reopen, rescan. The bundle is cached now, the second attempt loads in seconds. If that still fails on Android: long-press Expo Go → App info → Storage → Clear data; on iOS, uninstall + reinstall (iOS caches more aggressively).

**Don't ever run `docker compose up` directly without `dev.sh`** — the compose file ships a `mobile` service that races for port 8081 with the host-side Expo. `dev.sh` excludes that service for you (`--scale mobile=0`).

### Useful flags for `dev.sh`

| Flag | When to use |
|------|------|
| *(none)* | Normal day-to-day. Uses cached images, no rebuilds, no pulls. |
| `--pull` | Fetch the latest pre-built images for `cv-generation` and `learning-engine` from GHCR before starting. **Recommended for collaborators on slow / weak networks** — skips the multi-GB torch + HuggingFace model downloads those services would otherwise pull at build time. |
| `--build` | Force a local rebuild (e.g. after editing a `Dockerfile` or `requirements.txt`). |

Pre-built images live at `ghcr.io/turyahebwalex/sboup-cv:latest` and `ghcr.io/turyahebwalex/sboup-learning:latest` (both public — no `docker login` needed). Other AI services (matching, fraud, chatbot) and the shared shell (server, client, mobile) build locally from source.

### Shared demo credentials (seeded on every dev database)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@skillbridge.ug` | `Admin@12345` |
| Employer | `employer@demo.ug` | `Employer@12345` |
| Skilled Worker | `worker@demo.ug` | `Worker@12345` |

Use these on both the web client and the Expo mobile app — no need to register a new user just to log in.

### Ports the stack uses

If any of these are taken, the run will fail. Check with `ss -lntp` (Linux) or `lsof -i :<port>` (macOS) before starting.

| Port | Service |
|------|---------|
| 3000 | Web client (React) |
| 5000 | API gateway (Node/Express) |
| 5001 | matching-engine (Python) |
| 5002 | fraud-detection (Python) |
| 5003 | cv-generation (Python, GHCR image) |
| 5004 | learning-engine (Python, GHCR image) |
| 5005 | chatbot-service (Python) |
| 6379 | Redis |
| 8081 | Expo Metro bundler |
| 27017 | MongoDB |

### Remote collaborators (phone on a different network than the laptop)

The default Wi-Fi setup assumes phone + laptop on the same network. When that's not the case:

- **Easiest workaround — phone hotspot.** Disable laptop Wi-Fi, then connect laptop to phone's hotspot. Now both devices are on the same micro-network and `dev.sh` option 1 just works. Avoids campus/hotel Wi-Fi blocking device-to-device traffic.
- **USB tether.** `bash scripts/dev.sh → option 2`. `adb reverse` tunnels Metro (8081) and the API (5000) over USB. No Wi-Fi needed at all.
- **Truly remote (different geographies).** Expo tunnel mode relays the bundle through Expo's servers:
  ```bash
  cd mobile && npm run start:tunnel
  ```
  Then expose the backend through `ngrok http 5000` (or similar) and set `EXPO_PUBLIC_API_URL=https://<ngrok-domain>/api` before re-running `docker compose up -d server`. Slower, but works across NATs and firewalls.

### Troubleshooting

#### Mobile (Expo) — phone can't connect, or login says "Couldn't reach the server"

The app auto-detects the backend URL from Metro's address, so there's normally **no config needed**. If Expo Go shows `Failed to download remote update`, or the in-app login fails:

1. **Easiest fix: tether the laptop to your phone's hotspot.** Turn the phone hotspot on and connect the laptop to it (rather than the phone joining the laptop's Wi-Fi). This avoids campus / public Wi-Fi that blocks device-to-device traffic on ports like 5000 and 8081. Then re-run `bash scripts/dev.sh`.
2. **Or use USB:** `bash scripts/dev.sh` → option 2. Bypasses Wi-Fi entirely.
3. **Test reachability from the phone's browser:** `http://<your-laptop-LAN-IP>:5000/api/health` (find the IP with `ip -4 addr show` on Linux / `ipconfig getifaddr en0` on macOS). If that times out, the network is blocking — go back to step 1 or 2.

#### Generated CV PDF says "Cannot display PDF"

The CV service must publish PDFs at the laptop's LAN IP, not `localhost`, so Google Drive's mobile PDF viewer can fetch them. `dev.sh` sets `CV_PUBLIC_BASE_URL` automatically based on `ip route get`. If that detection fails, set it manually before bringing the stack up:

```bash
export CV_PUBLIC_BASE_URL=http://<your-laptop-LAN-IP>:5003
docker compose up -d cv-generation
```

#### Docker — `pip install` times out building cv-generation or learning-engine

The torch wheel and HuggingFace model weights are multi-hundred-MB downloads that throttled networks (campus / MikroTik / hotel Wi-Fi) can't sustain. Skip the build entirely:

```bash
bash scripts/dev.sh --pull
```

This pulls `ghcr.io/turyahebwalex/sboup-{cv,learning}:latest` instead of building. Built once on GitHub's runners, consumed by everyone.

#### Web client — `react-scripts: not found`

A previous run cached a broken `node_modules` volume. Rebuild fresh:

```bash
docker compose build --no-cache client && docker compose up client
```

#### Port already in use

Find and kill the offending process:

```bash
lsof -i :5000      # replace with the conflicting port (3000, 8081, 27017, etc.)
kill -9 <PID>
```

---

## Academic Information
This project is submitted as a **Final Year Project (FYP)** in partial fulfillment of the requirements for the award of a Bachelor's degree.

---

## License
This project is for academic purposes only.