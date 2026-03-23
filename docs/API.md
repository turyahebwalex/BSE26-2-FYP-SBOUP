# SBOUP API Reference

Base URL: `http://localhost:5000/api`

## Authentication

All protected endpoints require `Authorization: Bearer <token>` header.

### Auth Endpoints

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register new user | No |
| POST | `/auth/login` | Login and get JWT | No |
| POST | `/auth/refresh` | Refresh access token | No |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password/:token` | Reset password | No |
| GET | `/auth/verify-email/:token` | Verify email | No |
| GET | `/auth/me` | Get current user | Yes |
| GET | `/auth/google` | Google OAuth redirect | No |

### Profile Endpoints

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/profiles` | Create profile | Yes | Any |
| GET | `/profiles/me` | Get own profile + skills + exp | Yes | Any |
| PUT | `/profiles/me` | Update profile | Yes | Any |
| GET | `/profiles/:id` | Get public profile | No | — |
| POST | `/profiles/skills` | Add skill to profile | Yes | Any |
| DELETE | `/profiles/skills/:id` | Remove skill | Yes | Any |
| POST | `/profiles/experience` | Add experience | Yes | Any |
| PUT | `/profiles/experience/:id` | Update experience | Yes | Any |
| DELETE | `/profiles/experience/:id` | Delete experience | Yes | Any |
| POST | `/profiles/education` | Add education | Yes | Any |
| DELETE | `/profiles/education/:id` | Delete education | Yes | Any |
| PUT | `/profiles/preferences` | Update preferences | Yes | Any |

### Opportunity Endpoints

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/opportunities` | Create opportunity | Yes | Employer |
| GET | `/opportunities` | Search/filter opportunities | Optional | — |
| GET | `/opportunities/:id` | Get opportunity detail | Optional | — |
| PUT | `/opportunities/:id` | Update opportunity | Yes | Employer |
| DELETE | `/opportunities/:id` | Archive opportunity | Yes | Employer |
| GET | `/opportunities/employer/mine` | Get employer's jobs | Yes | Employer |

**Query Parameters for GET /opportunities:**
- `page`, `limit` — Pagination
- `search` — Full-text search
- `category` — formal, contract, freelance, apprenticeship
- `location` — Location filter
- `experienceLevel` — entry, mid, senior, any
- `isRemote` — true/false
- `minPay`, `maxPay` — Compensation filter

### Application Endpoints

| Method | Endpoint | Description | Auth | Role |
|--------|----------|-------------|------|------|
| POST | `/applications` | Apply for opportunity | Yes | Worker |
| GET | `/applications/mine` | Get my applications | Yes | Worker |
| GET | `/applications/opportunity/:id` | Get apps for job | Yes | Employer |
| PUT | `/applications/:id/status` | Update app status | Yes | Employer |

### AI Service Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/matching/recommendations` | Get personalized recommendations |
| GET | `/matching/score` | Get match score for profile+opportunity |
| POST | `/cv/generate` | Generate AI-powered CV |
| GET | `/cv/mine` | Get generated CVs |
| POST | `/learning/generate` | Generate learning path |
| GET | `/learning/mine` | Get learning paths |
| PUT | `/learning/:id/progress` | Update learning progress |
| POST | `/chatbot/query` | Send chatbot query |

### Communication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/messages` | Send message |
| GET | `/messages/inbox` | Get conversation list |
| GET | `/messages/conversation/:userId` | Get conversation |
| GET | `/messages/unread-count` | Get unread count |
| GET | `/notifications` | Get notifications |
| PUT | `/notifications/:id/read` | Mark as read |
| PUT | `/notifications/read-all` | Mark all as read |

### Admin Endpoints (Admin role only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/dashboard` | Dashboard stats |
| GET | `/admin/flagged` | Flagged content |
| POST | `/admin/moderate` | Approve/remove content |
| GET | `/admin/users` | List users |
| PUT | `/admin/users/:id` | Update user status/role |

### Other Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/skills` | Get skill taxonomy |
| POST | `/skills` | Create skill (admin) |
| POST | `/reports` | Submit report |
| GET | `/health` | Health check |
