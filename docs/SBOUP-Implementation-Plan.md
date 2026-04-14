# SBOUP — Skills-Based Opportunity Unleashing Platform
## Implementation Plan with ClickUp Task Management

| Field | Value |
|---|---|
| **Project** | BSE26-2-FYP-SBOUP |
| **Academic Year** | 2025–2026 |
| **Document Version** | 1.0 |
| **Date** | April 14, 2026 |

---

## Table of Contents

1. [Project Overview & Team Allocation](#1-project-overview--team-allocation)
2. [ClickUp Project Structure](#2-clickup-project-structure)
3. [Week 1 — Frontend Core Development](#3-week-1--frontend-core-development-days-17)
4. [Week 2 — Frontend Advanced Features](#4-week-2--frontend-advanced-features-days-814)
5. [Week 3 — Backend Core Development](#5-week-3--backend-core-development-days-1521)
6. [Week 4 — Backend AI Microservices & Integration](#6-week-4--backend-ai-microservices--integration-days-2228)
7. [Dependencies Map](#7-dependencies-map)
8. [Acceptance Criteria Standards](#8-acceptance-criteria-standards)
9. [Definition of Done](#9-definition-of-done)

---

## 1. Project Overview & Team Allocation

### Project Description

SBOUP is a four-layer full-stack platform connecting skilled workers with employment opportunities. The system integrates AI microservices for CV generation, opportunity matching, fraud detection, learning path generation, and intelligent chatbot assistance.

### Technology Stack

| Layer | Technology |
|---|---|
| **Frontend (Web)** | React.js, Tailwind CSS, React Router DOM |
| **Frontend (Mobile)** | React Native, Expo SDK 54, React Navigation v7 |
| **Backend API** | Node.js, Express.js, JWT Auth, Redis, Socket.io |
| **AI Microservices** | Python Flask (5 services) |
| **Database** | MongoDB Atlas (13 collections) |
| **Cache** | Redis (session + query cache) |
| **File Storage** | Amazon S3 / Azure Blob Storage |
| **Auth** | JWT (access + refresh tokens) + Google OAuth 2.0 |
| **Email/Push** | SendGrid/Amazon SES + FCM/APNs |
| **CI/CD** | Docker Compose, GitHub Actions |

### Team Allocation

| Role | Member | Student ID | Responsibilities |
|---|---|---|---|
| **Frontend Manager 1** | Nakanwagi Vanesa | 22/U/6530 | Auth Module UI, Communication Module UI, User Onboarding, Profile Setup screens, Notifications UI, Mobile + Web parity |
| **Frontend Manager 2** | Lutalo Allan | 22/U/3330/PS | Matching UI, Opportunity Discovery screens, Analytics Dashboard, Admin Panel UI, CV Generation UI, Learning Path UI |
| **Backend Manager 1** | Turyahebwa Alex | 18/U/23405/EVE | Opportunity Management API, Learning Path backend, CV Generation backend, Redis caching layer, S3/Blob file storage, Socket.io messaging server |
| **Backend Manager 2** | Yapyeko Rebecca | 22/U/3962/EVE | Authentication & Authorization APIs, Fraud Detection backend, Trust & Safety systems, User Profile APIs, Notification service, Reporting & Moderation |

---

## 2. ClickUp Project Structure

### Space Hierarchy

```
SPACE: SBOUP — FYP Platform
│
├── FOLDER: Frontend Development
│     ├── LIST: Week 1 — Frontend Core
│     └── LIST: Week 2 — Frontend Advanced Features
│
├── FOLDER: Backend Development
│     ├── LIST: Week 3 — Backend Core
│     └── LIST: Week 4 — Backend AI & Integration
│
├── FOLDER: AI Microservices
│     └── LIST: AI Service Stubs & Integration Contracts
│
├── FOLDER: DevOps & QA
│     ├── LIST: Docker & CI/CD
│     └── LIST: Testing & QA
│
└── FOLDER: Documentation
      └── LIST: SDD, API Docs, Contribution Guides
```

### Custom Fields (applied to all tasks)

| Field | Values |
|---|---|
| **Assignee** | Team member name |
| **Priority** | Urgent / High / Normal / Low |
| **Status** | To Do / In Progress / In Review / Done / Blocked |
| **Estimated Hours** | Number (hours) |
| **Actual Hours** | Number (tracked via time tracking) |
| **Module** | Auth \| Matching \| Opportunity \| Communication \| Learning \| Fraud \| Admin \| DevOps |
| **Layer** | Presentation \| Application \| Intelligence \| Data |
| **Depends On** | Task ID(s) |
| **Sprint** | Week 1 \| Week 2 \| Week 3 \| Week 4 |
| **Platform** | Web \| Mobile \| Both \| Backend \| AI Service |

### Labels

`#bug` `#feature` `#integration` `#ui-component` `#api` `#testing` `#documentation` `#blocked` `#ai-service` `#mobile` `#web` `#auth`

### Automation Rules

| Rule | Trigger | Action |
|---|---|---|
| Rule 1 | Status = "Done" AND all subtasks closed | Notify assignee's manager via ClickUp comment |
| Rule 2 | Due date passes AND Status ≠ "Done" | Change Priority to "Urgent" + tag `#blocked` |
| Rule 3 | Task moves to "In Review" | Auto-assign reviewer based on Module field |
| Rule 4 | Daily at 08:30 AM | Post standup reminder in `#sboup-standup` comment thread |

### Views Configured

| View | Purpose |
|---|---|
| **Board View** | Kanban by Status (per folder) |
| **List View** | All tasks sorted by Sprint, then Priority |
| **Gantt View** | Timeline showing task dependencies across 4 weeks |
| **Workload View** | Hours per team member per week |
| **Calendar View** | Due date overview |

---

## 3. Week 1 — Frontend Core Development (Days 1–7)

> **Sprint Goal:** Implement all authentication screens, user onboarding, worker and employer dashboards, and the core navigation structure for both web and mobile. All screens must be visually complete, responsive, and connected to mock API responses. WCAG 2.1 AA compliance required from day one.

**Total Estimated Hours:** Vanesa ~40h · Allan ~40h

---

### W1-001 · Project Setup & Design System Bootstrap

| Field | Value |
|---|---|
| **Assignee** | Both (Vanesa + Allan, pair session) |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 6 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Due** | Day 1 |

**Description:** Initialize the React.js web project and confirm the React Native/Expo mobile project structure. Establish the shared design system: colour palette, typography scale, spacing tokens, and reusable base components used across all screens.

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-001a | Confirm Expo SDK 54 mobile project runs (`npx expo start`) | Vanesa | 1h |
| W1-001b | Initialize React.js web project (Vite + Tailwind CSS) | Allan | 1h |
| W1-001c | Create `/src/theme/` with `colors.js`, `typography.js`, `spacing.js` | Vanesa | 1h |
| W1-001d | Build base components: Button, Input, Card, Badge, Avatar | Allan | 2h |
| W1-001e | Set up axios instance with base URL and interceptors | Both | 1h |

**Acceptance Criteria:**
- Both web and mobile projects start without errors
- Theme tokens are imported and applied in at least one component
- Axios `baseURL` points to `http://localhost:5000/api` (configurable via `.env`)
- All base components render in isolation (Storybook or manual test)

**Dependencies:** None (first task)

---

### W1-002 · Authentication Screens — Registration & Login

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 10 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Auth |
| **Due** | Day 2–3 |

**Description:** Implement the full authentication UI flow. Covers registration (role selection: Skilled Worker vs Employer), login, Google OAuth button. Both web and mobile required. All forms use controlled components with client-side validation.

**Screens to Build:**

| Screen | Description |
|---|---|
| `WelcomeScreen` | App logo, "Get Started", "Sign In" CTAs |
| `RegisterScreen` | Name, email, password, role toggle (Worker/Employer) |
| `LoginScreen` | Email, password, "Forgot Password?", Google OAuth button |
| `ForgotPasswordScreen` | Email input, "Send Reset Link" button |
| `ResetPasswordScreen` | New password + confirm password fields |
| `EmailVerifyScreen` | "Check your inbox" confirmation with resend option |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-002a | WelcomeScreen (web + mobile) | Vanesa | 1h |
| W1-002b | RegisterScreen with role selector toggle | Vanesa | 2h |
| W1-002c | LoginScreen with form validation (email format, min 8 char password) | Vanesa | 2h |
| W1-002d | Google OAuth button component (opens browser/webview) | Vanesa | 1h |
| W1-002e | ForgotPasswordScreen + ResetPasswordScreen | Vanesa | 2h |
| W1-002f | EmailVerifyScreen | Vanesa | 1h |
| W1-002g | AuthContext integration (useAuth hook, token storage) | Vanesa | 1h |

**API Integration** *(mock in Week 1, live in Week 3):*
```
POST /api/auth/register        → { name, email, password, role }
POST /api/auth/login           → { email, password }
POST /api/auth/google          → { idToken }
POST /api/auth/refresh         → { refreshToken }
POST /api/auth/forgot-password → { email }
POST /api/auth/reset-password  → { token, newPassword }
```

**Acceptance Criteria:**
- All 6 screens render without crashes on web and mobile
- Form validation shows inline error messages on invalid input
- Successful mock login stores JWT in `AsyncStorage` (mobile) / `localStorage` (web)
- Role selection visually differentiates Worker vs Employer path
- Google OAuth button is present and tappable
- WCAG 2.1 AA: all form fields have accessible labels, contrast ≥ 4.5:1

**Dependencies:** W1-001

---

### W1-003 · Worker Onboarding & Profile Setup Screens

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟠 High |
| **Estimated Hours** | 8 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Auth / Profile |
| **Due** | Day 3–4 |

**Description:** Multi-step onboarding wizard for skilled workers after registration. Employers have a shorter 2-step onboarding.

**Worker Onboarding Steps (with progress indicator):**

| Step | Name | Fields |
|---|---|---|
| 1 | Personal Info | Full name, phone, location (city/district) |
| 2 | Skills Selection | Searchable multi-select (tag chips), skill level: Beginner/Intermediate/Expert |
| 3 | Experience | Job title, employer, start/end date, description (multiple entries) |
| 4 | Education | Institution, qualification, year (multiple entries) |
| 5 | Availability | Full-time / part-time / contract / gig, start date, expected rate |
| 6 | Profile Photo | Image picker (camera or gallery), crop UI |
| 7 | Review & Submit | Summary of all data with edit buttons |

**Employer Onboarding Steps:**

| Step | Fields |
|---|---|
| 1 — Company Info | Company name, industry, size, website, logo |
| 2 — Hiring Preferences | Job types typically posted, locations |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-003a | Onboarding wizard shell (step tracker, next/back navigation) | Vanesa | 1h |
| W1-003b | Step 1 — Personal Info form | Vanesa | 1h |
| W1-003c | Step 2 — Skills multi-select with level picker | Vanesa | 2h |
| W1-003d | Steps 3 & 4 — Experience & Education (repeatable form sections) | Vanesa | 2h |
| W1-003e | Steps 5 & 6 — Availability + Image picker | Vanesa | 1h |
| W1-003f | Step 7 — Review screen + Employer onboarding (2 steps) | Vanesa | 1h |
| W1-003g | *(Bonus)* Persist onboarding progress to AsyncStorage | Vanesa | — |

**API Integration** *(mock in Week 1):*
```
GET  /api/skills             → list of all available skills
POST /api/profile/worker     → { personalInfo, skills, experience, education, preferences }
POST /api/profile/employer   → { companyInfo, hiringPreferences }
POST /api/profile/photo      → multipart/form-data (photo upload to S3)
```

**Acceptance Criteria:**
- Wizard shows correct step number and progress bar
- Can navigate forward and backward without losing entered data
- Skills search filters in real time (debounced, 300ms)
- Multiple experience/education entries can be added and removed
- Photo picker opens device gallery/camera (Expo ImagePicker)
- Review screen shows all entered data before final submission
- All forms accessible via keyboard navigation on web

**Dependencies:** W1-002

---

### W1-004 · Worker Home Dashboard & Navigation Shell

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟠 High |
| **Estimated Hours** | 6 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Matching / Opportunity |
| **Due** | Day 4–5 |

**Description:** Worker Home Dashboard — card-based feed with AI-matched recommendations, quick stats, and upskill card. Sets up the full navigation shell for the Worker role.

**Worker Bottom Tabs (mobile):**

| Tab | Screen | Owner |
|---|---|---|
| 1 | Home (dashboard) | Vanesa, Week 1 |
| 2 | Discover | Allan, Week 2 |
| 3 | My CV | Allan, Week 2 |
| 4 | Learn | Allan, Week 2 |
| 5 | Messages | Vanesa, Week 2 |

**Worker Sidebar (web):** Dashboard · Discover Opportunities · My CV · Learning Path · Messages · Notifications · Profile Settings · Logout

**Dashboard Components:**

| Component | Description |
|---|---|
| `ProfileStrengthCard` | Circular progress, "Complete your profile" CTA |
| `MatchedOpportunitiesCarousel` | 3–5 AI-matched job cards (horizontal scroll) |
| `QuickStatsRow` | Applications sent, views, shortlisted count |
| `UpskillCard` | Current learning path card with progress bar |
| `RecentActivityFeed` | Last 5 actions (applied, messaged, skill added) |
| `NotificationBell` | Badge count, dropdown/modal on press |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-004a | Worker bottom tab navigator (React Navigation v7) | Vanesa | 1h |
| W1-004b | Web sidebar layout + responsive drawer | Vanesa | 1h |
| W1-004c | ProfileStrengthCard component | Vanesa | 1h |
| W1-004d | MatchedOpportunitiesCarousel (mock data, 3 cards) | Vanesa | 1h |
| W1-004e | QuickStatsRow + RecentActivityFeed | Vanesa | 1h |
| W1-004f | NotificationBell with badge and empty-state handling | Vanesa | 1h |

**API Integration** *(mock in Week 1):*
```
GET /api/matching/recommendations?userId=&limit=5  → matched opportunities
GET /api/profile/strength/:userId                  → { score, missingFields }
GET /api/notifications?userId=&unreadOnly=true     → notification list
```

**Acceptance Criteria:**
- Bottom tab navigator switches between all 5 tabs without crashes
- Dashboard renders with mock data in under 1 second
- ProfileStrengthCard displays correct percentage and missing fields
- Opportunity cards show: title, company, location, match score badge
- NotificationBell shows badge count > 0 when unread notifications exist
- Responsive: sidebar on web (≥768px), bottom tabs on mobile/small screens

**Dependencies:** W1-001, W1-002

---

### W1-005 · Employer Home Dashboard & Navigation Shell

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟠 High |
| **Estimated Hours** | 6 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Opportunity / Matching |
| **Due** | Day 4–5 |

**Description:** Employer Home Dashboard with active posting summary, top matched candidates, recent applications, and fraud alert banner.

**Employer Bottom Tabs (mobile):**

| Tab | Screen | Owner |
|---|---|---|
| 1 | Dashboard | Allan, Week 1 |
| 2 | My Postings | Allan, Week 2 |
| 3 | Candidates | Allan, Week 2 |
| 4 | Messages | Vanesa, Week 2 |
| 5 | Reports | Allan, Week 2 |

**Dashboard Components:**

| Component | Description |
|---|---|
| `ActivePostingsCard` | Count of live postings, CTA "Post New" |
| `TopMatchesPreview` | Top 3 worker cards matched to latest posting |
| `RecentApplicationsList` | Last 5 applications with status badges |
| `FraudAlertBanner` | Visible if any active fraud flags exist |
| `PostOpportunityFAB` | Floating action button (mobile) / top button (web) |
| `QuickStatsRow` | Total applicants, hired count, avg match score |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-005a | Employer bottom tab navigator + web sidebar layout | Allan | 1.5h |
| W1-005b | ActivePostingsCard + PostOpportunityFAB | Allan | 1h |
| W1-005c | TopMatchesPreview (name, top skills, match %) | Allan | 1.5h |
| W1-005d | RecentApplicationsList with status badges | Allan | 1h |
| W1-005e | FraudAlertBanner + QuickStatsRow | Allan | 1h |

**API Integration** *(mock in Week 1):*
```
GET /api/opportunities?employerId=&status=active    → active postings
GET /api/matching/top-candidates?opportunityId=&limit=3
GET /api/applications?employerId=&limit=5
GET /api/fraud/alerts?employerId=                   → active fraud flags
```

**Acceptance Criteria:**
- All dashboard cards render with mock data
- PostOpportunityFAB navigates to PostOpportunityScreen (stub in Week 1)
- FraudAlertBanner is hidden when no fraud flags are present
- Navigation tabs switch without re-mounting dashboard

**Dependencies:** W1-001, W1-002

---

### W1-006 · User Profile View & Edit Screen

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟡 Normal |
| **Estimated Hours** | 5 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Profile / Auth |
| **Due** | Day 5–6 |

**Worker Profile Sections:** Header (photo, name, title, location, strength %) · Skills (chips with level) · Experience (timeline) · Education · Availability (badge + rate) · CV Preview button

**Employer Profile Sections:** Header (logo, name, industry, size) · About (description, website) · Active Postings count

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-006a | WorkerProfileScreen (view mode, all sections) | Vanesa | 2h |
| W1-006b | ProfileEditScreen (reuse onboarding forms as edit mode) | Vanesa | 1.5h |
| W1-006c | EmployerProfileScreen + EmployerProfileEditScreen | Vanesa | 1h |
| W1-006d | "View as Employer" toggle (worker sees own public profile) | Vanesa | 0.5h |

**API Integration:**
```
GET /api/profile/worker/:userId
PUT /api/profile/worker/:userId
GET /api/profile/employer/:userId
PUT /api/profile/employer/:userId
```

**Acceptance Criteria:**
- Profile view shows all sections with placeholder data if field is empty
- Edit mode pre-fills all current profile values
- Photo upload: ImagePicker → base64 preview before upload
- "View as Employer" toggle switches to public-facing profile view
- Back navigation from edit screen shows unsaved warning modal

**Dependencies:** W1-002, W1-003

---

### W1-007 · Notifications Screen

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟡 Normal |
| **Estimated Hours** | 4 |
| **Sprint** | Week 1 |
| **Platform** | Web + Mobile |
| **Module** | Communication |
| **Due** | Day 6–7 |

**Notification Types:**

| Type | Example |
|---|---|
| `APPLICATION_UPDATE` | "Your application to [Company] was shortlisted" |
| `NEW_MESSAGE` | "[Name] sent you a message" |
| `MATCH_ALERT` | "3 new opportunities match your profile" |
| `FRAUD_FLAG` | "A report has been filed regarding [Opportunity]" |
| `LEARNING_REMINDER` | "Continue your [Skill] learning path" |
| `PROFILE_PROMPT` | "Complete your profile to increase matches by 40%" |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W1-007a | NotificationsScreen with grouped list (Today / Yesterday / Earlier) | Vanesa | 1.5h |
| W1-007b | NotificationItem component (icon, title, body, timestamp, unread dot) | Vanesa | 1h |
| W1-007c | Mark as read on tap + "Mark all as read" action | Vanesa | 0.5h |
| W1-007d | Empty state: "No notifications yet" illustration | Vanesa | 0.5h |

**API Integration:**
```
GET    /api/notifications?userId=
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all?userId=
DELETE /api/notifications/:id
```

**Acceptance Criteria:**
- Notifications grouped correctly by date
- Unread notifications have visible indicator (blue dot or bold text)
- Tapping a notification navigates to the relevant screen
- "Mark all as read" clears all unread indicators immediately (optimistic update)
- Empty state shown when list is empty

**Dependencies:** W1-004

---

### Week 1 Summary

| Task | Assignee | Hours | Priority | Module |
|---|---|---|---|---|
| W1-001 | Both | 6 | 🔴 Urgent | Setup |
| W1-002 | Vanesa | 10 | 🔴 Urgent | Auth |
| W1-003 | Vanesa | 8 | 🟠 High | Profile/Auth |
| W1-004 | Vanesa | 6 | 🟠 High | Dashboard |
| W1-005 | Allan | 6 | 🟠 High | Dashboard |
| W1-006 | Vanesa | 5 | 🟡 Normal | Profile |
| W1-007 | Vanesa | 4 | 🟡 Normal | Communication |
| **Total** | **Vanesa 36h · Allan 9h** | **45h** | | |

#### End of Week 1 Milestone Checklist
- [ ] All auth screens functional with mock data
- [ ] Worker + Employer dashboards render with navigation
- [ ] Onboarding wizard completes all 7 steps
- [ ] Profile view and edit operational
- [ ] Notifications screen displays and interacts correctly
- [ ] Zero crashes on both web and mobile
- [ ] WCAG 2.1 AA compliance on all screens built this week
- [ ] Git: all Week 1 branches merged to main via PR

---

## 4. Week 2 — Frontend Advanced Features (Days 8–14)

> **Sprint Goal:** Build all feature-rich screens: opportunity discovery, job posting, AI CV generation UI, learning path UI, candidate management, real-time messaging, and the admin dashboard. All screens wired to mock endpoints. End of week: full frontend is code-complete.

**Total Estimated Hours:** Vanesa ~40h · Allan ~38h

---

### W2-001 · Opportunity Discovery & Search Screen (Worker)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 8 |
| **Module** | Matching / Opportunity |
| **Due** | Day 8–9 |

**Screens:** `DiscoverScreen` · `OpportunityDetailScreen` · `SavedOpportunitiesScreen`

**Key Components:**

| Component | Description |
|---|---|
| `SearchBar` | Debounced (300ms), voice search icon |
| `FilterDrawer` | Location, job type, salary range, skills, posted date, employer rating |
| `OpportunityCard` | Thumbnail, title, company, location, salary range, AI match score badge, save icon |
| `ApplyModal` | "Apply Now" confirmation + optional cover note field |
| `MatchScoreBreakdown` | Skills match %, experience match %, location compatibility |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-001a | DiscoverScreen with FlatList (infinite scroll, pagination) | 2h |
| W2-001b | SearchBar + FilterDrawer (slide-in bottom sheet) | 2h |
| W2-001c | OpportunityCard component with match score badge | 1h |
| W2-001d | OpportunityDetailScreen + MatchScoreBreakdown | 2h |
| W2-001e | ApplyModal + SavedOpportunitiesScreen | 1h |

**API Integration:**
```
GET  /api/opportunities?search=&location=&type=&skills=&page=&limit=
GET  /api/opportunities/:id
POST /api/applications                  → { opportunityId, workerId, coverNote }
POST /api/opportunities/:id/save
GET  /api/opportunities/saved?workerId=
GET  /api/matching/score?workerId=&opportunityId=
```

**Acceptance Criteria:**
- Search returns results within 500ms (mock data)
- Match score badge colour-coded: 🟢 ≥80% · 🟡 50–79% · 🔴 <50%
- Infinite scroll loads next page at bottom of list
- Saved opportunities persist across sessions (AsyncStorage)

**Dependencies:** W1-001, W1-004

---

### W2-002 · Post Opportunity & Manage Postings (Employer)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 8 |
| **Module** | Opportunity |
| **Due** | Day 8–9 |

**Screens:** `PostOpportunityScreen` (5-step wizard) · `ManagePostingsScreen` · `EditOpportunityScreen` · `PostingDetailScreen`

**Post Opportunity Steps:**

| Step | Fields |
|---|---|
| 1 — Job Basics | Title, description, job type (full/part/contract/gig) |
| 2 — Skills Required | Multi-select + AI Suggest button |
| 3 — Location | City, remote/on-site/hybrid toggle |
| 4 — Compensation | Salary range, currency, payment frequency |
| 5 — Review | Full summary + "Post Now" / "Save Draft" |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-002a | PostOpportunityScreen wizard (5 steps, progress bar) | 2h |
| W2-002b | AI Skill Suggest button (calls matching API, shows suggestion chips) | 1.5h |
| W2-002c | ManagePostingsScreen (list: Active / Draft / Closed) | 1.5h |
| W2-002d | EditOpportunityScreen (pre-filled form reuse) | 1h |
| W2-002e | PostingDetailScreen with applicant count + "View Applicants" CTA | 2h |

**API Integration:**
```
POST   /api/opportunities
GET    /api/opportunities?employerId=
PUT    /api/opportunities/:id
PATCH  /api/opportunities/:id/status  → { status: active|draft|closed }
DELETE /api/opportunities/:id
POST   /api/matching/suggest-skills   → { title, description }
```

**Acceptance Criteria:**
- AI Skill Suggest returns ≥ 3 suggestions within 1 second (mock)
- Draft postings can be saved and resumed
- Status toggles between Active / Paused / Closed

**Dependencies:** W1-001, W1-005

---

### W2-003 · CV Generation Screen (Worker)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟠 High |
| **Estimated Hours** | 7 |
| **Module** | CV Generation (AI) |
| **Due** | Day 10–11 |

**Screens:** `CVGenerationScreen` · `CVPreviewScreen` · `CVCustomizeScreen` · `MyCVsScreen`

**Templates:**

| Template | Style |
|---|---|
| Professional | Blue header, two-column layout |
| Modern | Minimalist, left sidebar |
| Classic | Traditional single-column, serif |

**Generation Flow:**
1. Worker selects template → taps "Generate CV"
2. Loading spinner: *"AI is crafting your CV..."*
3. `CVPreviewScreen` displays generated content
4. Worker customizes or downloads directly

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-003a | CVGenerationScreen with template card selector | 1.5h |
| W2-003b | Loading animation component | 0.5h |
| W2-003c | CVPreviewScreen (scrollable, full document view) | 2h |
| W2-003d | CVCustomizeScreen (section toggles, basic text edits) | 2h |
| W2-003e | MyCVsScreen (CV versions list, download + share buttons) | 1h |

**API Integration:**
```
POST /api/cv/generate    → { userId, templateId } → { cvId, content }
GET  /api/cv/:cvId
PUT  /api/cv/:cvId       → { customizations }
GET  /api/cv?userId=
GET  /api/cv/:cvId/pdf   → returns PDF file
```

**Acceptance Criteria:**
- Template selector highlights selected template
- Loading spinner shows during generation (2–3s mock)
- "Share" opens native share sheet (mobile) or copies download URL (web)

**Dependencies:** W1-003, W1-004

---

### W2-004 · Learning Path Screen (Worker)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟠 High |
| **Estimated Hours** | 6 |
| **Module** | Learning (AI) |
| **Due** | Day 10–11 |

**Screens:** `LearningPathScreen` · `SkillGapScreen` · `CourseDetailScreen` · `LearningHistoryScreen`

**Key Components:** `SkillGapChart` (horizontal bar) · `LearningPathTimeline` · `CourseCard` · `ProgressBadge` · `EnrollButton`

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-004a | LearningPathScreen with SkillGapChart | 2h |
| W2-004b | LearningPathTimeline component | 1h |
| W2-004c | CourseCard + CourseDetailScreen | 1.5h |
| W2-004d | LearningHistoryScreen with badge display | 1h |
| W2-004e | SkillGapScreen (full skill category breakdown) | 0.5h |

**API Integration:**
```
GET  /api/learning/path?userId=
GET  /api/learning/skill-gap?userId=
GET  /api/learning/courses?skills=
POST /api/learning/enroll         → { userId, courseId }
PATCH /api/learning/complete      → { userId, courseId }
GET  /api/learning/history?userId=
```

**Acceptance Criteria:**
- SkillGapChart shows ≥ 5 skills with current vs target levels
- Enrolling marks course "in progress" immediately (optimistic)
- Completed courses appear in history with date and badge

**Dependencies:** W1-003, W1-004

---

### W2-005 · Matched Candidates Screen (Employer)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟠 High |
| **Estimated Hours** | 5 |
| **Module** | Matching |
| **Due** | Day 12 |

**Screens:** `MatchedCandidatesScreen` · `WorkerPublicProfileScreen` · `ApplicationsScreen`

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-005a | MatchedCandidatesScreen (sorted by match score) | 1.5h |
| W2-005b | WorkerPublicProfileScreen (read-only employer view) | 1.5h |
| W2-005c | ApplicationsScreen with status dropdown per application | 1h |
| W2-005d | Shortlist / Reject actions with undo toast | 1h |

**API Integration:**
```
GET  /api/matching/candidates?opportunityId=&limit=&page=
GET  /api/profile/worker/:userId/public
GET  /api/applications?opportunityId=
PATCH /api/applications/:id/status    → { status }
POST /api/matching/shortlist          → { opportunityId, workerId }
```

**Acceptance Criteria:**
- List defaults to sorted by match score descending
- Shortlisted candidate moves to top with a star badge
- "Contact" button navigates to MessagingScreen with pre-populated recipient

**Dependencies:** W1-005, W2-002

---

### W2-006 · Messaging / Chat Interface

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟠 High |
| **Estimated Hours** | 10 |
| **Module** | Communication |
| **Due** | Day 8–10 |

**Description:** Real-time messaging between workers and employers using Socket.io. Classic two-panel chat layout (conversation list + message thread).

**Screens:** `ConversationsListScreen` · `ChatScreen` · `NewConversationModal`

**Key Components:**

| Component | Description |
|---|---|
| `ConversationItem` | Avatar, name, last message preview, timestamp, unread dot |
| `MessageBubble` | Sent (right, primary colour) / received (left, grey) |
| `TypingIndicator` | "..." animation while other party is typing |
| `MessageInput` | Text input + send button + attachment icon (stub) |
| `OnlineStatusDot` | Green dot on avatar when user is online |
| `SystemMessage` | Centred text for system events |

**Socket.io Events:**

| Direction | Event | Payload |
|---|---|---|
| Emit | `send_message` | `{ conversationId, content, senderId }` |
| Emit | `typing_start` | `{ conversationId, userId }` |
| Emit | `typing_stop` | `{ conversationId, userId }` |
| On | `new_message` | Updates thread and conversation list |
| On | `user_typing` | Shows/hides TypingIndicator |
| On | `user_online` | Updates OnlineStatusDot |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-006a | ConversationsListScreen (mock data, last message sort) | 1.5h |
| W2-006b | ChatScreen with MessageBubble + MessageInput | 3h |
| W2-006c | TypingIndicator + OnlineStatusDot components | 1h |
| W2-006d | Socket.io client setup (connect on auth, disconnect on logout) | 2h |
| W2-006e | NewConversationModal with user search | 1h |
| W2-006f | Unread count badge on Messages tab icon | 1.5h |

**Socket Endpoint:** `ws://localhost:5000`

**Acceptance Criteria:**
- Messages appear in real time without page refresh
- Sent messages appear immediately (optimistic insert before server ACK)
- Typing indicator appears within 500ms
- Conversations list moves to top on new message
- Auto-scrolls to latest message on open and on new message

**Dependencies:** W1-002, W1-004, W1-005

---

### W2-007 · Analytics Dashboard (Employer)

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟡 Normal |
| **Estimated Hours** | 5 |
| **Platform** | Web (primary), Mobile (simplified) |
| **Module** | Analytics |
| **Due** | Day 12–13 |

**Charts/Widgets:**

| Widget | Type |
|---|---|
| Application Funnel | Bar chart: Applied → Shortlisted → Interviewed → Hired |
| Match Score Distribution | Histogram of applicant match scores |
| Top Skills Requested | Horizontal bar chart |
| Time to Hire | Average days from post to hire (metric card) |
| Views vs Applications | Line chart over last 30 days |
| Active Postings | Donut chart (active vs closed) |

**Charting Libraries:** `react-native-chart-kit` (mobile) · `recharts` (web)

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-007a | AnalyticsDashboardScreen layout + chart grid | 1h |
| W2-007b | ApplicationFunnel + MatchScoreDistribution | 1.5h |
| W2-007c | TopSkillsRequested + ActivePostingsGauge | 1.5h |
| W2-007d | TimeToHireMetric + ViewsVsApplicationsLine | 1h |

**Acceptance Criteria:**
- All 6 chart types render with mock data
- Date range selector (7d / 30d / 90d) re-fetches and updates charts
- Charts use accessible, colour-blind safe palette

**Dependencies:** W2-002

---

### W2-008 · Admin Panel UI

| Field | Value |
|---|---|
| **Assignee** | Lutalo Allan |
| **Priority** | 🟡 Normal |
| **Estimated Hours** | 7 |
| **Platform** | Web only |
| **Module** | Admin |
| **Due** | Day 13–14 |

**Screens:** `AdminDashboardScreen` · `UserManagementScreen` · `FraudReportsScreen` · `ContentModerationScreen` · `SystemAnalyticsScreen`

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-008a | Admin layout (left nav sidebar with all admin routes) | 1h |
| W2-008b | AdminDashboardScreen + MetricsGrid | 1h |
| W2-008c | UserManagementScreen with DataTable + UserActionMenu | 2h |
| W2-008d | FraudReportsScreen + FraudReportCard | 2h |
| W2-008e | ContentModerationScreen + SystemAnalyticsScreen | 1h |

**API Integration:**
```
GET    /api/admin/users?search=&role=&status=&page=
PATCH  /api/admin/users/:id/status       → { status: active|suspended|banned }
GET    /api/admin/fraud-reports?status=open
PATCH  /api/admin/fraud-reports/:id      → { resolution, status }
GET    /api/admin/moderation/queue
PATCH  /api/admin/moderation/:id         → { action: approve|remove }
GET    /api/admin/analytics/system
```

**Acceptance Criteria:**
- Admin routes protected (redirect non-admin users to home)
- DataTable supports search, sort, and pagination
- User actions (suspend/ban) require confirmation modal
- Fraud report resolution requires reason text (min 20 chars)
- System analytics displays ≥ 6 key metrics

**Dependencies:** W1-001, W1-002

---

### W2-009 · Fraud Alerts & Trust UI

| Field | Value |
|---|---|
| **Assignee** | Nakanwagi Vanesa |
| **Priority** | 🟠 High |
| **Estimated Hours** | 4 |
| **Module** | Fraud / Trust |
| **Due** | Day 11–12 |

**Screens:** `ReportOpportunityScreen` · `ReportWorkerScreen` · `TrustScoreBanner` · `FraudWarningModal`

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W2-009a | ReportOpportunityScreen + ReportWorkerScreen (shared ReportForm) | 1.5h |
| W2-009b | TrustScoreBadge component (integrated into OpportunityCard) | 1h |
| W2-009c | FraudWarningModal (triggered when trust score < 40) | 1h |
| W2-009d | "Report" button added to OpportunityDetailScreen and CandidateCard | 0.5h |

**API Integration:**
```
POST /api/fraud/report          → { type, targetId, reason, description }
GET  /api/fraud/score/:entityId → { trustScore, flags }
```

**Acceptance Criteria:**
- Report form requires reason + minimum 50-char description
- TrustScoreBadge colour: 🟢 ≥70 · 🟡 40–69 · 🔴 <40
- FraudWarningModal blocks navigation until user explicitly chooses to proceed

**Dependencies:** W2-001, W2-005

---

### Week 2 Summary

| Task | Assignee | Hours | Priority | Module |
|---|---|---|---|---|
| W2-001 | Allan | 8 | 🔴 Urgent | Opportunity/Matching |
| W2-002 | Allan | 8 | 🔴 Urgent | Opportunity |
| W2-003 | Allan | 7 | 🟠 High | CV Generation |
| W2-004 | Allan | 6 | 🟠 High | Learning |
| W2-005 | Allan | 5 | 🟠 High | Matching |
| W2-006 | Vanesa | 10 | 🟠 High | Communication |
| W2-007 | Allan | 5 | 🟡 Normal | Analytics |
| W2-008 | Allan | 7 | 🟡 Normal | Admin |
| W2-009 | Vanesa | 4 | 🟠 High | Fraud/Trust |
| **Total** | **Vanesa 14h · Allan 46h** | **60h** | | |

> **Note:** Allan's week is front-loaded. If time-constrained, W2-007 and W2-008 may extend into the first day of Week 3.

#### End of Week 2 Milestone Checklist (Frontend Complete)
- [ ] All screens built for Worker role (web + mobile)
- [ ] All screens built for Employer role (web + mobile)
- [ ] Admin Panel built (web only)
- [ ] Real-time messaging with Socket.io client integrated
- [ ] CV Generation UI functional with template selector
- [ ] Learning path UI shows skill gap and recommendations
- [ ] Fraud reporting and trust score display implemented
- [ ] All screens pass accessibility audit (WCAG 2.1 AA)
- [ ] All API calls point to correct mock endpoints
- [ ] UI reviewed against SDD wireframes — all screens match spec
- [ ] Git: all Week 2 branches merged to main via PR

---

## 5. Week 3 — Backend Core Development (Days 15–21)

> **Sprint Goal:** Implement all backend API endpoints, MongoDB models, auth middleware, and core business logic. By end of week: REST API is fully functional, all frontend mock endpoints are replaced with real data.

**Total Estimated Hours:** Alex ~42h · Rebecca ~42h

---

### W3-001 · Project Setup, MongoDB Models & Middleware Foundation

| Field | Value |
|---|---|
| **Assignee** | Both (Alex + Rebecca, pair session) |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 6 |
| **Due** | Day 15 |

**Database Collections & Mongoose Models:**

| Model | Key Fields |
|---|---|
| `User` | `_id`, `name`, `email`, `passwordHash`, `role`, `googleId`, `isVerified`, `isSuspended` |
| `Profile` | `userId`, `bio`, `location`, `availability`, `expectedRate`, `profilePhotoUrl`, `trustScore` |
| `Skill` | `_id`, `name`, `category`, `level` |
| `ProfileSkill` | `profileId`, `skillId`, `proficiencyLevel`, `yearsExp` |
| `Experience` | `profileId`, `title`, `employer`, `startDate`, `endDate`, `description` |
| `Education` | `profileId`, `institution`, `qualification`, `year` |
| `Preference` | `userId`, `jobTypes[]`, `locations[]`, `salaryMin`, `salaryMax` |
| `Opportunity` | `_id`, `employerId`, `title`, `description`, `skillsRequired[]`, `jobType`, `location`, `salary`, `status` |
| `Application` | `opportunityId`, `workerId`, `status`, `coverNote`, `matchScore`, `appliedAt` |
| `CV` | `userId`, `templateId`, `content` (JSON), `pdfUrl`, `createdAt` |
| `LearningPath` | `userId`, `targetRole`, `steps[]`, `completedSteps[]` |
| `Message` | `conversationId`, `senderId`, `content`, `sentAt`, `readAt` |
| `Conversation` | `participantIds[]`, `lastMessage`, `lastMessageAt` |
| `Report` | `reporterId`, `targetType`, `targetId`, `reason`, `description`, `status` |
| `Notification` | `userId`, `type`, `title`, `body`, `data` (JSON), `isRead` |

**Middleware to Implement:**

| Middleware | Purpose |
|---|---|
| `authMiddleware` | Validates JWT access token, attaches `req.user` |
| `refreshMiddleware` | Validates refresh token, issues new access token |
| `roleMiddleware` | Checks `req.user.role` against required roles |
| `rateLimiter` | 100 req/min per IP (express-rate-limit + Redis store) |
| `requestLogger` | Morgan + Winston: method, URL, status, duration |
| `errorHandler` | Centralised error response formatter |
| `validateSchema` | Joi/Zod schema validation middleware factory |

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W3-001a | Express app setup (`app.js`, `server.js`, routes index) | Alex | 1h |
| W3-001b | MongoDB Atlas connection (`mongoose.connect` + env vars) | Alex | 0.5h |
| W3-001c | Define all 15 Mongoose models | Rebecca | 3h |
| W3-001d | Implement all middleware | Rebecca | 1.5h |

**Acceptance Criteria:**
- Server starts without errors, connects to MongoDB Atlas
- JWT middleware correctly rejects expired/invalid tokens with 401
- Rate limiter returns 429 after 100 requests per minute per IP
- Error handler returns `{ success: false, message, code }` consistently

**Dependencies:** None (first backend task)

---

### W3-002 · Authentication & Authorization API

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 10 |
| **Module** | Auth |
| **Due** | Day 15–16 |

**Endpoints:**

| Method | Endpoint | Action |
|---|---|---|
| `POST` | `/api/auth/register` | Hash password (bcrypt), create User, send verification email |
| `POST` | `/api/auth/verify-email` | Validate email token, set `isVerified = true` |
| `POST` | `/api/auth/login` | Verify credentials, issue access (15min) + refresh (7d) tokens |
| `POST` | `/api/auth/google` | Verify Google ID token, upsert user, issue SBOUP JWT pair |
| `POST` | `/api/auth/refresh` | Validate refresh token from Redis, issue new access token |
| `POST` | `/api/auth/logout` | Delete refresh token from Redis |
| `POST` | `/api/auth/forgot-password` | Generate reset token, store in Redis (15min TTL), send email |
| `POST` | `/api/auth/reset-password` | Validate token from Redis, hash new password |
| `GET` | `/api/auth/me` | Return current user (no password) |

**Redis Key Schema:**

| Key Pattern | Value | TTL |
|---|---|---|
| `refresh:<userId>` | refreshToken | 7 days |
| `emailVerify:<token>` | userId | 24 hours |
| `passwordReset:<token>` | userId | 15 minutes |
| `blacklist:<jti>` | 1 | Remaining access token lifetime |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-002a | Register endpoint + bcrypt password hashing | 1.5h |
| W3-002b | Email verification flow (SendGrid template + token storage) | 1.5h |
| W3-002c | Login endpoint + JWT pair issuance + Redis storage | 1.5h |
| W3-002d | Google OAuth endpoint (google-auth-library) | 1.5h |
| W3-002e | Refresh token endpoint + Redis validation | 1h |
| W3-002f | Logout + token blacklisting | 0.5h |
| W3-002g | Forgot/reset password flow | 1.5h |
| W3-002h | `GET /api/auth/me` + integration tests | 1h |

**Acceptance Criteria:**
- Registration returns 409 if email already exists
- Login returns 401 for wrong credentials, 403 if email not verified
- Refresh token rotation: old token invalidated when new one issued
- Google OAuth creates new user if not found, or links to existing account
- 100% endpoint coverage with integration tests (supertest + MongoDB in-memory)

**Dependencies:** W3-001

---

### W3-003 · User Profile & Skills API

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🟠 High |
| **Estimated Hours** | 8 |
| **Module** | Profile |
| **Due** | Day 17–18 |

**Endpoints:**
```
GET  /api/profile/worker/:userId
POST /api/profile/worker
PUT  /api/profile/worker/:userId
GET  /api/profile/worker/:userId/public   (no sensitive fields)

GET  /api/profile/employer/:userId
POST /api/profile/employer
PUT  /api/profile/employer/:userId

GET  /api/profile/strength/:userId        → { score: 0–100, missingFields[] }
POST /api/profile/photo                   → S3 upload → returns URL

GET  /api/skills                          → full catalogue
GET  /api/skills?search=                  → filtered
POST /api/profile/:userId/skills          → { skillId, proficiencyLevel }
DELETE /api/profile/:userId/skills/:skillId

POST   /api/profile/:userId/experience
PUT    /api/profile/:userId/experience/:id
DELETE /api/profile/:userId/experience/:id

POST   /api/profile/:userId/education
PUT    /api/profile/:userId/education/:id
DELETE /api/profile/:userId/education/:id
```

**Profile Strength Algorithm:**

| Criteria | Points |
|---|---|
| Base fields (name, location, photo) | 30 |
| Skills (≥3 skills) | 20 |
| Experience (≥1 entry) | 20 |
| Education (≥1 entry) | 15 |
| Availability set | 10 |
| Bio written (≥50 chars) | 5 |
| **Total** | **100** |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-003a | Worker profile CRUD endpoints | 2h |
| W3-003b | Employer profile CRUD endpoints | 1h |
| W3-003c | Skills catalogue + ProfileSkill CRUD | 1.5h |
| W3-003d | Experience & Education CRUD | 1.5h |
| W3-003e | Profile photo upload (multer + S3/Azure Blob SDK) | 1.5h |
| W3-003f | Profile strength calculation endpoint | 0.5h |

**Acceptance Criteria:**
- Profile photo upload returns S3/Blob URL; original not stored locally
- Public profile endpoint excludes: email, phone, expectedRate
- Profile strength recalculated on every `PUT` to profile
- Owner-only: workers can only edit their own profile

**Dependencies:** W3-001, W3-002

---

### W3-004 · Opportunity Management API

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 10 |
| **Module** | Opportunity |
| **Due** | Day 15–17 |

**Endpoints:**
```
POST   /api/opportunities                    (employer role required)
GET    /api/opportunities?search=&location=&type=&skills=&page=&limit=
GET    /api/opportunities/:id
PUT    /api/opportunities/:id
PATCH  /api/opportunities/:id/status         → { status: active|draft|closed|paused }
DELETE /api/opportunities/:id

POST   /api/opportunities/:id/save           → worker bookmark
DELETE /api/opportunities/:id/save
GET    /api/opportunities/saved?workerId=

POST   /api/applications                     → { opportunityId, workerId, coverNote }
GET    /api/applications?opportunityId=&workerId=&status=&page=&limit=
GET    /api/applications/:id
PATCH  /api/applications/:id/status          → { status: pending|shortlisted|interviewing|hired|rejected }

GET    /api/analytics/employer/:id/pipeline  → application funnel stats
```

**Full-Text Search:** MongoDB Atlas Search index on `Opportunity` — fields: `title` (weight 3), `description` (weight 1), `skillsRequired` (weight 2). Supports fuzzy matching (`maxEdits: 1`).

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-004a | Opportunity CRUD endpoints | 2.5h |
| W3-004b | Full-text search + filter + pagination | 2h |
| W3-004c | Opportunity status management | 0.5h |
| W3-004d | Save/bookmark endpoints | 1h |
| W3-004e | Application CRUD + status workflow | 2h |
| W3-004f | Application notification (creates Notification doc) | 1h |
| W3-004g | Analytics pipeline endpoint | 1h |

**Acceptance Criteria:**
- Applying twice to the same opportunity returns 409 Conflict
- Application status change notifies the worker (Notification doc created)
- Full-text search on "carpenter Kampala" returns relevant results
- Only the posting owner can edit/delete/change status

**Dependencies:** W3-001, W3-002

---

### W3-005 · Notification Service API

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🟠 High |
| **Estimated Hours** | 5 |
| **Module** | Communication |
| **Due** | Day 18–19 |

**Endpoints:**
```
GET    /api/notifications?userId=&unreadOnly=false&page=&limit=
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all?userId=
DELETE /api/notifications/:id
DELETE /api/notifications/clear-all?userId=
```

**Internal Service Function:**
```js
createNotification({ userId, type, title, body, data })
// 1. Save Notification doc to MongoDB
// 2. Look up user's FCM token
// 3. If token exists → send push via firebase-admin SDK
// 4. FCM failures are logged but don't fail the parent operation
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-005a | Notification CRUD endpoints | 1.5h |
| W3-005b | `createNotification()` internal service function | 1h |
| W3-005c | FCM push integration (firebase-admin) | 1.5h |
| W3-005d | Wire `createNotification()` into auth and application services | 1h |

**Acceptance Criteria:**
- `read-all` marks all unread in a single DB update
- FCM push sent within 2 seconds of `createNotification()` call
- Missing FCM token does not crash — notification still saved to DB

**Dependencies:** W3-001, W3-002, W3-004

---

### W3-006 · Messaging API & Socket.io Server

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🟠 High |
| **Estimated Hours** | 8 |
| **Module** | Communication |
| **Due** | Day 17–19 |

**REST Endpoints:**
```
GET  /api/messages/conversations?userId=&page=&limit=
POST /api/messages/conversations              → { participantIds[] }
GET  /api/messages/conversation/:id?page=&limit=
POST /api/messages/send                       → { conversationId, content, senderId }
PATCH /api/messages/conversation/:id/read
GET  /api/messages/unread-count?userId=       → { count }
```

**Socket.io Events (Client → Server):**

| Event | Payload | Server Action |
|---|---|---|
| `send_message` | `{ conversationId, content, senderId }` | Save to DB → emit `new_message` to room |
| `typing_start` | `{ conversationId, userId }` | Emit `user_typing` to room (exclude sender) |
| `typing_stop` | `{ conversationId, userId }` | Emit `user_stopped_typing` to room |
| `join_room` | `{ conversationId }` | `socket.join(conversationId)` |
| `mark_read` | `{ conversationId, userId }` | Update `readAt` → emit `messages_read` to room |

**Socket.io Events (Server → Client):**

| Event | Payload |
|---|---|
| `new_message` | Message object |
| `user_typing` | `{ userId, conversationId }` |
| `user_stopped_typing` | `{ userId, conversationId }` |
| `messages_read` | `{ conversationId, userId, timestamp }` |
| `user_online` / `user_offline` | `{ userId }` |

**Redis Pub/Sub:** Channel `sboup:messages:<conversationId>` — broadcasts Socket.io events across multiple Node.js instances.

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-006a | Conversation + Message REST endpoints | 2h |
| W3-006b | Socket.io server setup + JWT auth handshake | 1.5h |
| W3-006c | `send_message` handler (DB save + room broadcast) | 1.5h |
| W3-006d | Typing indicators | 0.5h |
| W3-006e | Online/offline presence events | 1h |
| W3-006f | Redis pub/sub for multi-instance support | 1.5h |

**Acceptance Criteria:**
- Socket connection rejected if JWT invalid or expired
- `new_message` broadcast to all room sockets within 100ms
- Typing indicator stops automatically after 3 seconds (server-side timeout)

**Dependencies:** W3-001, W3-002

---

### W3-007 · Redis Caching Layer

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🟠 High |
| **Estimated Hours** | 5 |
| **Module** | Infrastructure |
| **Due** | Day 19–20 |

**Cache Strategy:**

| Endpoint | TTL |
|---|---|
| `GET /api/opportunities` (list) | 60s |
| `GET /api/opportunities/:id` | 300s |
| `GET /api/skills` | 3600s |
| `GET /api/profile/worker/:id/public` | 120s |
| `GET /api/matching/recommendations` | 180s |
| `GET /api/analytics/employer/:id/*` | 300s |

**Cache Invalidation:** On `PUT /api/opportunities/:id` → delete that opportunity's cache key. On `POST /api/opportunities` → delete list cache. On `PUT /api/profile/worker/:id` → delete profile cache.

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-007a | Redis client setup (ioredis) + health check | 0.5h |
| W3-007b | `cacheMiddleware` factory (check → serve or pass through) | 1.5h |
| W3-007c | Apply `cacheMiddleware` to all listed endpoints | 1h |
| W3-007d | Cache invalidation on write endpoints | 1h |
| W3-007e | Cache hit/miss logging for monitoring | 1h |

**Acceptance Criteria:**
- Cache hit reduces response time by ≥ 50% on repeated requests
- `Cache-Control: max-age` header set on cached responses
- Stale data never served beyond TTL

**Dependencies:** W3-001, W3-004

---

### W3-008 · Reporting & Fraud Report API (Basic)

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🟠 High |
| **Estimated Hours** | 5 |
| **Module** | Fraud / Trust |
| **Due** | Day 19–20 |

**Endpoints:**
```
POST  /api/fraud/report              → { type, targetId, reason, description, evidence[] }
GET   /api/fraud/reports?reporterId=&status=&targetType=
GET   /api/fraud/score/:entityType/:entityId  → { trustScore, flags[] }
PATCH /api/fraud/reports/:id         (admin only) → { status, resolution }
GET   /api/admin/fraud-reports?status=open&page= (admin only)
```

**Basic Trust Score Algorithm** *(AI-enhanced in Week 4):*

| Event | Score Change |
|---|---|
| Starting score | 100 |
| Each unresolved report | −10 |
| Each confirmed report | −25 |
| Dismissed report | +5 |
| Minimum | 0 |

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W3-008a | `POST /api/fraud/report` + auto-flag at 3+ reports | 1.5h |
| W3-008b | GET fraud reports (user and admin views) | 1h |
| W3-008c | `GET /api/fraud/score` — basic trust score calculation | 1.5h |
| W3-008d | PATCH report status (admin resolution) | 1h |

**Acceptance Criteria:**
- Duplicate report on same entity returns 409
- Auto-flag at 3 unresolved reports → creates admin notification
- Admin-only endpoints return 403 for non-admin users

**Dependencies:** W3-001, W3-002, W3-005

---

### Week 3 Summary

| Task | Assignee | Hours | Priority | Module |
|---|---|---|---|---|
| W3-001 | Both | 6 | 🔴 Urgent | Infrastructure |
| W3-002 | Rebecca | 10 | 🔴 Urgent | Auth |
| W3-003 | Rebecca | 8 | 🟠 High | Profile |
| W3-004 | Alex | 10 | 🔴 Urgent | Opportunity |
| W3-005 | Rebecca | 5 | 🟠 High | Notifications |
| W3-006 | Alex | 8 | 🟠 High | Messaging |
| W3-007 | Alex | 5 | 🟠 High | Infrastructure |
| W3-008 | Rebecca | 5 | 🟠 High | Fraud |
| **Total** | **Alex 29h · Rebecca 31h** | **57h** | | |

#### End of Week 3 Milestone Checklist
- [ ] Server starts, connects to MongoDB Atlas and Redis
- [ ] All Mongoose models defined and indexed
- [ ] Auth endpoints functional (register, login, Google OAuth, refresh)
- [ ] Worker and Employer profile CRUD working
- [ ] Opportunities: create, search, filter, paginate all working
- [ ] Applications: submit, status update, notifications sent
- [ ] Socket.io messaging: real-time message delivery working
- [ ] Redis caching: key endpoints return cached responses
- [ ] Basic fraud reporting API functional
- [ ] Integration test suite passes (≥ 80% endpoint coverage)
- [ ] Docker Compose: backend + MongoDB + Redis containers all run
- [ ] Git: all Week 3 branches merged to main via PR

---

## 6. Week 4 — Backend AI Microservices & Integration (Days 22–28)

> **Sprint Goal:** Deploy all 5 Python Flask AI microservices, integrate with Node.js backend via internal HTTP, and connect the frontend to live endpoints. End of week: fully integrated end-to-end system running in Docker Compose, tested.

**Total Estimated Hours:** Alex ~42h · Rebecca ~38h

---

### W4-001 · Matching Engine Microservice

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 10 |
| **Platform** | Python Flask (port 5001) |
| **Module** | Matching (AI) |
| **Due** | Day 22–23 |

**Algorithm: `ComputeMatchScore`**

**Step 1 — Content-Based Filtering (CBF):**

| Score | Method |
|---|---|
| `skillScore` | TF-IDF weighted cosine similarity of worker skills vs required skills |
| `locationScore` | Exact match=1.0, same region=0.7, remote=0.8, different region=0.3 |
| `expScore` | Years of relevant experience vs required, via sigmoid function |
| `salaryScore` | Worker `expectedRate` within opportunity salary range (0 if incompatible) |

**Step 2 — Collaborative Filtering (CF):**
Find workers similar to this worker (cosine on skill/preference vectors), look up opportunities they applied to/were hired for → CF signal score.

**Step 3 — Hybrid Score:**
```
matchScore = (0.40 × skillScore)
           + (0.20 × locationScore)
           + (0.20 × expScore)
           + (0.10 × salaryScore)
           + (0.10 × cfScore)
```

**Flask Endpoints:**
```
POST /match/score           → { workerProfile, opportunity } → { matchScore, breakdown }
POST /match/recommendations → { workerProfile, opportunities[] } → sorted by matchScore
POST /match/top-candidates  → { opportunity, workerProfiles[] } → sorted by matchScore
POST /match/suggest-skills  → { jobTitle, description } → { suggestedSkills[] }
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-001a | Flask app setup + requirements.txt (scikit-learn, numpy, flask) | 0.5h |
| W4-001b | CBF skill cosine similarity (TF-IDF vectorizer) | 2h |
| W4-001c | Location, experience, salary scoring functions | 1.5h |
| W4-001d | Collaborative filtering (cosine on user-item matrix) | 2h |
| W4-001e | Hybrid score combiner + Flask endpoints | 1.5h |
| W4-001f | Suggest-skills endpoint (frequency analysis) | 1h |
| W4-001g | Dockerfile + Docker Compose integration | 1.5h |

**Acceptance Criteria:**
- Score range: 0 to 1 (inclusive)
- Perfect match (all skills, same location, within salary) → score ≥ 0.85
- Zero skill overlap → skill score = 0
- Single score endpoint responds within 500ms; 50 recommendations within 2s
- Suggest-skills returns ≥ 3 suggestions for any meaningful job title

**Dependencies:** W3-001, W3-004

---

### W4-002 · CV Generation Microservice

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🟠 High |
| **Estimated Hours** | 8 |
| **Platform** | Python Flask (port 5003) |
| **Module** | CV Generation (AI) |
| **Due** | Day 23–24 |

**Algorithm: `GenerateCV`**

| Step | Description |
|---|---|
| 1 — Summary | GPT-2/transformer generates 3–5 sentence professional summary from skills + experience + bio |
| 2 — Skills | Group by category, order by proficiency |
| 3 — Experience | NLP expansion of sparse descriptions: action verb + achievement + metric |
| 4 — Rendering | Jinja2 template → HTML → PDF via WeasyPrint |
| 5 — Upload | PDF uploaded to S3/Azure Blob → signed URL returned |

**Flask Endpoints:**
```
POST /cv/generate           → { workerProfile, templateId } → { cvId, content, pdfUrl }
POST /cv/regenerate-summary → { bio, skills[], latestJobTitle } → { summary }
GET  /cv/templates          → [{ id, name, previewUrl }]
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-002a | Flask app + model loading (GPT-2 / sentence-transformers) | 1h |
| W4-002b | Professional summary generation (NLP transformer pipeline) | 2h |
| W4-002c | Experience bullet expansion (NLP enhancement) | 1.5h |
| W4-002d | Jinja2 template rendering for all 3 templates | 1.5h |
| W4-002e | HTML to PDF conversion (WeasyPrint) + S3/Blob upload | 1h |
| W4-002f | Flask endpoints + Node.js integration + Docker Compose | 1h |

**Acceptance Criteria:**
- Generated CV contains all sections: summary, skills, experience, education
- PDF renders correctly for all 3 templates
- Generation completes within 10 seconds for a typical profile
- Empty/minimal profiles handled gracefully (no crash; placeholder text used)

**Dependencies:** W3-003

---

### W4-003 · Fraud Detection Microservice

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 10 |
| **Platform** | Python Flask (port 5002) |
| **Module** | Fraud Detection (AI) |
| **Due** | Day 22–24 |

**Algorithm: `DetectFraud`**

**Feature Engineering:**

| Entity | Features |
|---|---|
| **Opportunity** | `salary_anomaly`, `skill_mismatch_score`, `description_quality`, `employer_report_count`, `posting_velocity`, `contact_info_exposed` |
| **Worker Profile** | `profile_completeness`, `skill_inflation`, `account_age_days`, `application_velocity`, `report_count` |

**Model:** Ensemble — `0.5 × RandomForest + 0.5 × XGBoost`

**Output:**
```json
{
  "fraudProbability": 0.82,
  "riskLevel": "high",
  "flags": ["salary_anomaly", "contact_info_exposed"],
  "trustScore": 18
}
```

**Trust Score:** `trustScore = 100 × (1 − fraudProbability)`

**Flask Endpoints:**
```
POST /fraud/analyze        → { entity, entityType } → { fraudProbability, riskLevel, flags[], trustScore }
POST /fraud/batch-analyze  → { entities[], entityType } → results[]
GET  /fraud/model/stats    → { accuracy, precision, recall, f1 }
```

**Training Data:** Synthetic dataset of 500 labelled examples (250 fraudulent, 250 legitimate).
Script: `ai-services/fraud-detection/generate_training_data.py`

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-003a | Flask app + scikit-learn, xgboost setup | 0.5h |
| W4-003b | Feature engineering functions | 2h |
| W4-003c | Synthetic training data generation script | 1h |
| W4-003d | RandomForest + XGBoost training + ensemble | 2.5h |
| W4-003e | Flask prediction endpoints | 1.5h |
| W4-003f | Trust score update wiring (Node.js calls on report) | 1.5h |
| W4-003g | Docker Compose + model persistence (joblib) | 1h |

**Acceptance Criteria:**
- Model achieves ≥ 80% accuracy on 20% held-out test set
- Obvious fraud (salary anomaly + exposed contact info) → score > 0.8
- Batch analysis of 100 entities completes within 5 seconds
- Model file persisted to disk (joblib); loaded on service start, no retraining

**Dependencies:** W3-001, W3-008

---

### W4-004 · Learning Path Generation Microservice

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🟠 High |
| **Estimated Hours** | 8 |
| **Platform** | Python Flask (port 5004) |
| **Module** | Learning (AI) |
| **Due** | Day 24–25 |

**Algorithm: `GenerateLearningPath`**

| Step | Description |
|---|---|
| 1 — Skill Gap | `gap[] = targetSkills NOT IN currentSkills` + skills where worker level < required level, sorted by importance |
| 2 — Bayesian Estimation | Estimate `hours_to_proficiency` per skill based on related skill levels, historical averages, and worker completion rate |
| 3 — RL Course Selection | Q-learning policy selects next course. State: `(currentLevels, targetSkills, availableTime)`. Reward: skill gap reduction / completion probability |
| 4 — Assembly | Returns ordered path with total estimated hours and projected match score improvement |

**Flask Endpoints:**
```
POST /learning/generate        → { workerProfile, targetRole } → { learningPath, skillGapAnalysis, totalHours }
POST /learning/skill-gap       → { currentSkills[], targetRole } → { gaps[], estimatedHoursToClose }
POST /learning/update-progress → { userId, completedCourseId, newSkillLevel } → { updatedPath }
GET  /learning/courses?skills=&level=&maxHours=
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-004a | Flask app + dependencies (numpy, scipy, gym) | 0.5h |
| W4-004b | Skill gap analysis function | 1.5h |
| W4-004c | Bayesian time-to-proficiency estimator | 2h |
| W4-004d | RL policy (simplified Q-learning for course selection) | 2h |
| W4-004e | Flask endpoints + course catalogue (JSON seed, ≥50 courses) | 1.5h |
| W4-004f | Docker Compose + Node.js wiring | 0.5h |

**Acceptance Criteria:**
- "HTML skills → Senior React Developer" path: logical progression (HTML → JS → React)
- Skill gap returns ≥ 3 gaps for a typical mismatch
- `update-progress` adjusts remaining path (no restart)
- Projected match score improvement shown (e.g., "+22% match for this role")

**Dependencies:** W3-001, W3-003

---

### W4-005 · Chatbot / Conversational Assistant Microservice

| Field | Value |
|---|---|
| **Assignee** | Yapyeko Rebecca |
| **Priority** | 🟡 Normal |
| **Estimated Hours** | 8 |
| **Platform** | Python Flask (port 5005) |
| **Module** | Communication (AI) |
| **Due** | Day 24–26 |

**Algorithm: `ProcessMessage`**

**Supported Intents:**

| Intent | Example Query |
|---|---|
| `FIND_JOBS` | "show me jobs for a carpenter in Kampala" |
| `GET_MATCH_SCORE` | "why did I score 65% for this job?" |
| `APPLY_HELP` | "how do I apply for this opportunity?" |
| `CV_HELP` | "generate my CV" |
| `LEARN_SKILLS` | "what should I learn to get this job?" |
| `FRAUD_QUERY` | "is this job posting legitimate?" |
| `GENERAL_HELP` | "how does SBOUP work?" |
| `GREETING` | "hello" |
| `FALLBACK` | Unrecognized input |

**Processing Pipeline:**
1. **Intent Classification:** TF-IDF + Logistic Regression (or BERT-based)
2. **Entity Extraction:** spaCy NER + regex (jobTitle, location, skillName, opportunityId)
3. **Response Generation:** API call for data intents; template for informational intents

**Flask Endpoints:**
```
POST /chatbot/message   → { message, userId, conversationHistory[] } → { response, intent, entities, suggestedActions[] }
GET  /chatbot/intents   → list of supported intents + examples
POST /chatbot/feedback  → { messageId, rating: 1-5, comment }
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-005a | Flask app + spaCy + sklearn setup | 0.5h |
| W4-005b | Intent classification model (TF-IDF + LogReg + training data) | 2h |
| W4-005c | Entity extraction (spaCy NER + custom regex) | 1.5h |
| W4-005d | Response template system + API call integration | 2h |
| W4-005e | Flask endpoints + Node.js chatbot proxy endpoint | 1h |
| W4-005f | Docker Compose + chatbot UI wiring | 1h |

**Acceptance Criteria:**
- Intent classification ≥ 85% accuracy on 50-query test set
- `FIND_JOBS` triggers real job search and returns formatted results
- Fallback triggered for unrecognized queries
- Response time < 2 seconds per message

**Dependencies:** W3-004, W4-001

---

### W4-006 · End-to-End Integration & Frontend API Wiring

| Field | Value |
|---|---|
| **Assignee** | All team members |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 8 (2h per person) |
| **Due** | Day 25–26 |

#### Integration Checklist

**Auth flow:**
- [ ] Register → email verification → login → JWT stored → dashboard loads
- [ ] Google OAuth flow end-to-end
- [ ] Token refresh on 401 response (auto-retry in axios interceptor)
- [ ] Logout clears tokens and navigates to auth stack

**Profile:**
- [ ] Onboarding wizard POSTs to `/api/profile/worker`
- [ ] Profile edit screen PUTs updated fields
- [ ] Photo upload reaches S3/Blob and displays URL

**Opportunities:**
- [ ] Employer creates posting → appears in ManagePostingsScreen
- [ ] Worker search returns real MongoDB data
- [ ] Worker applies → employer sees application in list
- [ ] Application status update → worker receives push notification

**Matching:**
- [ ] Worker home dashboard shows real AI match scores
- [ ] OpportunityDetailScreen shows real MatchScoreBreakdown from AI
- [ ] Employer CandidatesScreen shows real ranked workers

**Messaging:**
- [ ] Two users can exchange real-time messages via Socket.io
- [ ] Conversation list updates without refresh
- [ ] Unread badge count is accurate

**CV Generation:**
- [ ] "Generate CV" → real AI generation → real PDF URL → download works

**Learning:**
- [ ] Learning path shows AI-generated path from real profile skills
- [ ] SkillGapChart reflects real skill gap vs target

**Fraud:**
- [ ] Report filing stores in MongoDB + AI analysis runs + trust score updates
- [ ] Flagged opportunity shows FraudWarningModal

**Admin:**
- [ ] Admin panel shows real users from MongoDB
- [ ] Admin can suspend a user → user logged out on next token check

**Subtasks:**

| ID | Task | Assignee | Est. |
|---|---|---|---|
| W4-006a | Auth flow integration | Vanesa | 2h |
| W4-006b | Opportunity + Application + Matching flow | Allan + Alex | 3h |
| W4-006c | Messaging Socket.io client-server end-to-end | Vanesa | 1h |
| W4-006d | CV, Learning, Fraud, Admin integration | Rebecca + Allan | 2h |

**Acceptance Criteria:**
- Every checklist item above passes manual testing
- No "Network Error" or 404s in the browser/app network tab
- Real data persisted to MongoDB Atlas (verified via MongoDB Compass)
- JWT auto-refresh tested (manually expire an access token)

**Dependencies:** All previous tasks

---

### W4-007 · Docker Compose Final Configuration

| Field | Value |
|---|---|
| **Assignee** | Turyahebwa Alex |
| **Priority** | 🟠 High |
| **Estimated Hours** | 5 |
| **Due** | Day 26–27 |

**Services in Docker Compose:**

| Service | Image | Port |
|---|---|---|
| `mongodb` | MongoDB 7 | 27017 |
| `redis` | Redis 7 Alpine | 6379 |
| `backend` | Node.js Express | 5000 |
| `matching-service` | Python Flask | 5001 |
| `fraud-service` | Python Flask | 5002 |
| `cv-service` | Python Flask | 5003 |
| `learning-service` | Python Flask | 5004 |
| `chatbot-service` | Python Flask | 5005 |
| `web` | React.js / Nginx | 3000 |
| `mobile` | Expo (dev) | 8081 |

**Health Checks:**
```
backend:          GET /api/health   → { status: "ok", db: "connected" }
*-service:        GET /health       → { status: "ok" }
mongodb:          mongosh --eval "db.adminCommand('ping')"
redis:            redis-cli ping
```

**Subtasks:**

| ID | Task | Est. |
|---|---|---|
| W4-007a | Final `docker-compose.yml` with all 10 services | 2h |
| W4-007b | Health check endpoints in all services | 1h |
| W4-007c | `.env.example` with all required variables documented | 0.5h |
| W4-007d | Full system boot test: `docker compose up` → all green | 1.5h |

**Acceptance Criteria:**
- `docker compose up` starts all services without manual intervention
- All health checks pass within 60 seconds of startup
- Services communicate via internal Docker network (not localhost)
- No hardcoded secrets in any committed file
- `.env.example` documents every required variable with a description

**Dependencies:** All Week 4 AI services, W3-001

---

### W4-008 · System Testing & Bug Fixes

| Field | Value |
|---|---|
| **Assignee** | All team members (Rebecca coordinates) |
| **Priority** | 🔴 Urgent |
| **Estimated Hours** | 8 (2h per person) |
| **Due** | Day 27–28 |

**Test Scenarios:**

| TC | Module | Scenario |
|---|---|---|
| TC01 | Auth | Full registration → email verification → login flow |
| TC02 | Auth | Google OAuth login creates user and returns valid token |
| TC03 | Auth | Expired access token auto-refreshed via refresh token |
| TC04 | Auth | Logout prevents refresh token reuse |
| TC05 | Auth | Password reset flow (forgot → email → reset → login) |
| TC06 | Profile | Worker completes onboarding → profile strength = 100 |
| TC07 | Opportunity | Employer posts opportunity → appears in worker discovery |
| TC08 | Opportunity | Worker applies → employer receives in-app notification |
| TC09 | Opportunity | Employer changes application status → worker notified |
| TC10 | Search | Full-text search returns relevant results for 5 test queries |
| TC11 | Matching | Worker with matching skills scores > 0.7 for relevant opportunity |
| TC12 | Matching | Worker with no matching skills scores < 0.2 |
| TC13 | CV Gen | CV generation produces valid PDF for a complete profile |
| TC14 | Learning | Learning path for target role shows logical skill order |
| TC15 | Analytics | Charts display real data after 2+ applications exist |
| TC16 | Messaging | Real-time messages delivered within 1 second between 2 users |
| TC17 | Fraud | Report filed → trust score updated → FraudWarningModal shown |
| TC18 | Admin | Admin can view and resolve a fraud report |
| TC19 | Chatbot | Chatbot responds correctly to 5 different intent queries |
| TC20 | Push | Push notification received on mobile (FCM) for app/status change |

**Bug Triage:**

| Priority | Definition | Target Resolution |
|---|---|---|
| **P0 Critical** | Blocks a complete user journey | Same day |
| **P1 High** | Visible but workaround exists | Within 4 hours |
| **P2 Normal** | Minor UI/UX issue | Fix if time allows |
| **P3 Low** | Cosmetic | Document for post-FYP |

**Acceptance Criteria:**
- All 20 test cases pass without P0 bugs
- P1 bugs resolved before final sign-off
- Test results documented in ClickUp (test case linked to task)

**Dependencies:** W4-006, W4-007

---

### Week 4 Summary

| Task | Assignee | Hours | Priority | Module |
|---|---|---|---|---|
| W4-001 | Alex | 10 | 🔴 Urgent | Matching AI |
| W4-002 | Alex | 8 | 🟠 High | CV Gen AI |
| W4-003 | Rebecca | 10 | 🔴 Urgent | Fraud AI |
| W4-004 | Alex | 8 | 🟠 High | Learning AI |
| W4-005 | Rebecca | 8 | 🟡 Normal | Chatbot AI |
| W4-006 | All | 8 | 🔴 Urgent | Integration |
| W4-007 | Alex | 5 | 🟠 High | DevOps |
| W4-008 | All | 8 | 🔴 Urgent | QA |
| **Total** | **Alex 33h · Rebecca 26h** | **65h** | | |

#### End of Week 4 Milestone Checklist (Full System Complete)
- [ ] All 5 AI microservices deployed and responding to health checks
- [ ] Matching engine returns real AI scores on opportunity discovery
- [ ] CV generation produces downloadable PDF
- [ ] Fraud detection updates trust scores after report filing
- [ ] Learning path generated from real profile vs real target role
- [ ] Chatbot responds correctly to all 9 intent types
- [ ] All 20 system test cases pass
- [ ] No P0 or P1 bugs outstanding
- [ ] `docker compose up` starts entire system within 60 seconds
- [ ] `.env.example` committed with all required variables
- [ ] Final code review: all PRs merged to main
- [ ] Implementation plan milestone closed in ClickUp

---

## 7. Dependencies Map

### Critical Path

```
W1-001 → W1-002 → W1-003 → W1-004 → W2-001
                          → W1-005 → W2-002
W3-001 → W3-002 → W3-003
       → W3-004 → W4-001 → W4-006
       → W3-006           → W4-005
```

### Parallel Tracks

| Track | Member | Sequence |
|---|---|---|
| **A** | Vanesa | W1-002 → W1-003 → W1-006 → W1-007 → W2-006 → W2-009 |
| **B** | Allan | W1-001 → W1-005 → W2-001 → W2-002 → W2-003 → W2-004 → W2-005 → W2-007 → W2-008 |
| **C** | Alex | W3-001 → W3-004 → W3-006 → W3-007 → W4-001 → W4-002 → W4-004 → W4-007 |
| **D** | Rebecca | W3-001 → W3-002 → W3-003 → W3-005 → W3-008 → W4-003 → W4-005 → W4-008 |

### Key Handoffs

| Handoff | When | What |
|---|---|---|
| Frontend → Backend | End of Day 7 (Week 1→2 boundary) | API contract document: endpoint list + request/response schemas |
| Backend → All | End of Day 21 (Week 3→4 boundary) | Live API base URL + Postman collection |
| AI Services → Integration | Day 25 | All 5 AI services must be running before W4-006 starts |

---

## 8. Acceptance Criteria Standards

### All Frontend Tasks
- **Accessibility:** WCAG 2.1 AA — colour contrast ≥ 4.5:1, all interactive elements keyboard accessible
- **Loading states:** Spinner/skeleton shown for any async operation > 200ms
- **Error states:** User-friendly error message on API failure (not raw error objects)
- **Empty states:** Meaningful placeholder shown when a list is empty
- **Responsive:** mobile (320px+) · tablet (768px+) · desktop (1024px+)
- **Performance:** Screens render initial content in < 1 second on mock data

### All Backend Tasks
- **Input validation:** Joi/Zod schema on all POST/PUT request bodies
- **Error format:** All errors return `{ success: false, message, code, details? }`
- **HTTP status codes:** Correct codes enforced (200, 201, 400, 401, 403, 404, 409, 429, 500)
- **Auth protection:** All non-public endpoints require valid JWT
- **Rate limiting:** 100 req/min per IP enforced
- **Logging:** All requests logged with method, URL, status, duration (ms)

### All AI Microservices
- **Health endpoint:** `GET /health` → `{ status: "ok" }`
- **Input validation:** Return 400 with descriptive error on invalid input
- **Performance:** Score endpoints < 500ms; generation endpoints < 10s
- **Graceful degradation:** Missing model file returns 503 with a meaningful message

---

## 9. Definition of Done

### A task is DONE when ALL of the following are true:
- [ ] Code implemented and matches the specification in this document
- [ ] No crashes or unhandled exceptions on the happy path
- [ ] All acceptance criteria listed for the task pass
- [ ] Code committed and pushed to the relevant feature branch
- [ ] Pull request opened and reviewed by at least one other team member
- [ ] PR merged to main branch
- [ ] ClickUp task status set to **Done**
- [ ] If API endpoint: tested via Postman, collection updated
- [ ] If frontend screen: tested on both web browser and Expo mobile app
- [ ] If AI service: model accuracy metric recorded in ClickUp task comment

### A sprint is DONE when:
- [ ] All tasks in the sprint list are individually Done
- [ ] No P0 or P1 bugs outstanding
- [ ] End of sprint milestone checklist fully checked off
- [ ] Sprint retrospective notes added to ClickUp Sprint folder
- [ ] `docker compose up` starts cleanly after all sprint merges

---

## Total Project Effort Summary

| Team Member | Week 1 | Week 2 | Week 3 | Week 4 | **Total** |
|---|---|---|---|---|---|
| Nakanwagi Vanesa | 36h | 14h | — | 2h | **52h** |
| Lutalo Allan | 9h | 46h | — | 6h | **61h** |
| Turyahebwa Alex | 3h | — | 29h | 33h | **65h** |
| Yapyeko Rebecca | 3h | — | 31h | 26h | **60h** |
| **Total** | **51h** | **60h** | **60h** | **67h** | **238h** |

> Week 1/2 hours for Vanesa are higher due to the complexity of the auth and communication modules. Allan's Week 2 is front-loaded due to the breadth of features assigned. The distribution reflects the SDD task allocation and is balanced given each member's role specialization.

---

*Document path: `docs/SBOUP-Implementation-Plan.md`*  
*Generated: 2026-04-14*  
*Team: BSE26-2 — Nakanwagi Vanesa · Lutalo Allan · Turyahebwa Alex · Yapyeko Rebecca*
