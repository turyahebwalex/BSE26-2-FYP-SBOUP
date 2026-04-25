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

Full guide: [docs/git-setup-and-contributor-guide.md](docs/git-setup-and-contributor-guide.md)

### One command to start everything

After cloning the repo (and after any `git pull` that touches dependencies), this is all you need to bring up the entire stack — web, mobile, backend, AI services, MongoDB, and Redis:

```bash
bash scripts/setup.sh && docker compose up --build
```

What each half does:

1. **`bash scripts/setup.sh`** — creates any missing `.env` files, installs Node deps for `server/`, `client/`, and `mobile/`, and seeds Mongo with the shared demo accounts below. Idempotent — safe to re-run.
2. **`docker compose up --build`** — pulls MongoDB 7 and Redis 7, builds the server, web client, all 5 AI services, and the mobile container, then starts every service. Scan the QR code printed by `sboup-mobile` with Expo Go on your phone to launch the app.

On subsequent runs you usually only need `docker compose up` (no `--build`, no setup script) unless someone changed dependencies or a Dockerfile.

### Shared demo credentials (seeded on every dev database)

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@skillbridge.ug` | `Admin@12345` |
| Employer | `employer@demo.ug` | `Employer@12345` |
| Skilled Worker | `worker@demo.ug` | `Worker@12345` |

Use these on both the web client and the Expo mobile app — no need to register a new user just to log in.

### Troubleshooting

#### Mobile (Expo) — phone can't connect, or login says "Couldn't reach the server"

The app auto-detects the backend URL from Metro's address, so there's normally **no config needed** beyond the one command above. If Expo Go shows `Failed to download remote update`, or the in-app login fails:

1. **Easiest fix: tether the laptop to your phone's hotspot.** Turn the phone hotspot on and connect the laptop to it (rather than the phone joining the laptop's Wi-Fi). This avoids campus / public Wi-Fi that block device-to-device traffic on ports like 5000 and 8081. Then re-run `docker compose up --build` so Metro picks up the new IP.
2. **Otherwise, both devices must be on the same Wi-Fi** *and* that Wi-Fi must allow device-to-device traffic. Test reachability from the phone's browser: `http://<your-laptop-LAN-IP>:5000/api/health` (find the IP with `ip -4 addr show` on Linux / `ipconfig getifaddr en0` on macOS). If that times out, the network is blocking — go back to step 1.
3. **Stale `mobile/.env` overrides auto-detect.** If you ran the project before the auto-detect change, your local `mobile/.env` may still pin `EXPO_PUBLIC_API_URL=http://localhost:5000/api`. Delete the file (it's gitignored and regenerated by `setup.sh`) or comment that line out.

#### Mobile — app icon / splash screen don't appear

This used to happen when `EXPO_OFFLINE=1` was set in `docker-compose.yml`: offline mode aborts the manifest-asset upload that serves icons/splash to Expo Go. The variable has been removed; if you've been running an older checkout, just `git pull` and rebuild the mobile service.

#### Docker — `npm install` hangs or fails to fetch images

Usually a slow / flaky network. Both halves of the build use `network: host`, but if Docker Hub itself is unreachable from your network, retry the command — base images get cached after the first successful pull. See [docs/git-setup-and-contributor-guide.md](docs/git-setup-and-contributor-guide.md#12-common-issues--troubleshooting) for more.

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