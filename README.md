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
bash scripts/dev.sh
```

The launcher prompts for mobile mode (Wi-Fi QR / USB / skip), brings up the Docker stack, auto-detects your LAN IP so generated CV PDFs open on the phone, and starts Expo on the host. Scan the QR with Expo Go to launch the mobile app.

On the **first run after cloning**, also run the bootstrap once to install Node deps and seed the database:

```bash
bash scripts/setup.sh && bash scripts/dev.sh
```

`setup.sh` is idempotent — safe to re-run, but only needed once unless dependencies change.

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

### Remote collaborators

If you're working from a different network than your teammates and need to share a running stack:

- **Phone + laptop on the same Wi-Fi → just use `bash scripts/dev.sh`.** The Wi-Fi mode prints the QR; LAN IP is auto-detected.
- **Phone via USB cable → `bash scripts/dev.sh` → choose option 2.** `adb reverse` tunnels Metro and the API over USB, sidestepping any restrictive Wi-Fi.
- **Phone on a different network entirely** → start Expo in tunnel mode and pin the API URL to a public tunnel:
  ```bash
  cd mobile && npm run start:tunnel        # Expo bundle goes through ngrok
  EXPO_PUBLIC_API_URL=https://<your-public-backend>/api docker compose up -d server
  ```

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