# SBOUP — Messaging & User Reporting Module
## Product Requirements Document (PRD)

| Field | Value |
|---|---|
| **Module** | Messaging & User Reporting |
| **Project** | BSE26-2-FYP-SBOUP |
| **Document Version** | 1.0 |
| **Date** | 2026-06-25 |
| **Primary Owner** | Nakanwagi Vanesa (per SBOUP-Implementation-Plan v3.0) |
| **Source of Truth** | SBOUP Software Design Document (SDD), Chapters 4–7 |

---

## 1. Module Overview

This PRD covers two tightly-coupled sub-modules:

1. **Messaging** — Real-time direct messaging between Workers and Employers (and between any two users), with file attachments, read receipts, typing indicators, conversation management, and admin moderation.
2. **User Reporting** — In-context reporting of messages, users, companies, and opportunities; automated escalation at 3+ reports; admin triage with graduated moderation actions (warn → suspend → ban).

### Key Business Goals

| Goal | Metric |
|---|---|
| Enable direct Worker ↔ Employer communication outside the application flow | Messages sent per day |
| Detect and remove harmful content quickly | Time-to-moderate (reports → admin action) |
| Prevent repeat offenders from creating new accounts | Auto-suspend at 3 reports in 48h |
| Maintain full audit compliance | 100% of admin actions logged to `AuditLog` |
| Enforce permanent bans for severe violations | No "Reinstate" option for banned accounts |

---

## 2. User Personas

| Persona | Role | Primary Goal in This Module |
|---|---|---|
| **Worker** | `skilled_worker` | Message employers about jobs; report harmful messages/users |
| **Employer** | `employer` | Message workers about applications; report fraudulent workers/companies |
| **Admin** | `admin` | Triage reports, apply moderation, review flagged content |
| **System** | Automated | Auto-escalate at 3+ reports, enforce suspensions/bans platform-wide |

---

## 3. Messaging Module — User Stories

### 3.1 Real-Time Messaging

---

**M1 — Send Direct Messages**
> As a **Worker or Employer**, I want to send direct messages to any other user so that we can discuss opportunities, applications, and logistics in real-time.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | User opens a conversation with another user via search or from a profile/opportunity page. |
| AC-2 | Messages are sent via `POST /api/messages` and appear in the conversation within 200ms via Socket.IO `new_message` event. |
| AC-3 | Messages show in the sender's conversation immediately (optimistic UI) with a "sent" status (✓). |
| AC-4 | A `Notification` of type `message` is created for the receiver. |
| AC-5 | Blocked users cannot message each other — the API returns 403. |
| AC-6 | Suspended/banned users cannot send or receive messages — auth middleware blocks access. |

**Key Files:** `server/src/controllers/message.controller.js:6-118`, `client/src/pages/ChatScreen.js`, `mobile/src/screens/shared/ChatScreen.js`

---

**M2 — Real-Time Typing Indicators**
> As a **conversation participant**, I want to see "Typing..." in the chat header when the other person is composing a message so that I know a reply is coming.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | When User A types, the client calls `POST /api/messages/typing`. |
| AC-2 | Server emits `typing_status` event via Socket.IO to User B. |
| AC-3 | User B sees "Typing..." in the chat header. |
| AC-4 | Typing indicator clears after 3 seconds of inactivity. |

**Key Files:** `server/src/controllers/message.controller.js:348-371`

---

**M3 — Read Receipts (Sent → Delivered → Read)**
> As a **message sender**, I want to see double-checkmarks (✓ → ✓✓) on my messages so that I know when my message has been received and seen.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | Sent messages show a single checkmark (✓) until `deliveredStatus` is true. |
| AC-2 | When the receiver's client fetches the conversation, messages are bulk-marked as delivered (`POST /api/messages/mark-delivered`) and status becomes `delivered` (✓✓ gray). |
| AC-3 | When the receiver actually reads/scolls through the conversation, messages are bulk-marked as read (`POST /api/messages/mark-read`) and status becomes `read` (✓✓ blue). |
| AC-4 | Socket.IO `messages_read` event notifies the sender to update their UI. |

**Key Files:** `server/src/controllers/message.controller.js:294-345`, `server/src/models/Message.js:40-43`

---

**M4 — File Attachments in Messages**
> As a **user**, I want to attach files (images, PDFs, documents, Excel) up to 10MB to my messages so that I can share resumes, portfolios, and contracts.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | Chat UI provides attachment options: Camera, Gallery, Document. |
| AC-2 | Server validates file size ≤ 10MB and file type (images, PDFs, docs, Excel, text). |
| AC-3 | Oversized files are rejected with a clear error message. |
| AC-4 | Attachments are stored with `fileName`, `fileUrl`, `fileSize`, `fileType`, `mimeType`. |
| AC-5 | Attachment-only messages (no text content) are allowed. |
| AC-6 | Message attachment count limits are enforced. |

**Key Files:** `server/src/controllers/message.controller.js:58-90`, `server/src/models/Message.js`

---

### 3.2 Inbox & Conversation Management

---

**M5 — Grouped Inbox with Unread Counts**
> As a **user**, I want my inbox grouped by conversation partner (showing last message, timestamp, and unread count) so that I can quickly see who needs a reply.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | `GET /api/messages/inbox` returns conversations aggregated by partner with last message preview + unread count. |
| AC-2 | Only `moderationStatus: 'normal'` conversations appear in the inbox (blocked/under_review messages are hidden). |
| AC-3 | Inbox shows user avatar, name, last message snippet, timestamp, and unread badge. |
| AC-4 | `GET /api/messages/unread-count` returns the total unread count across all conversations. |
| AC-5 | Socket.IO `unread_count_update` event updates the badge in real-time. |
| AC-6 | Mobile inbox shows "Pinned Applications" (from `/applications/mine`) at the top for quick access. |

**Key Files:** `server/src/controllers/message.controller.js:200-291`, `client/src/pages/MessagesPage.js`, `mobile/src/screens/shared/MessagesInbox.js`

---

**M6 — Paginated Conversation History**
> As a **user**, I want to scroll through my full message history with a specific user (paginated) so that I can review past conversations.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | `GET /api/messages/conversation/:userId` returns messages between the two users. |
| AC-2 | Messages are paginated (server decides page size). |
| AC-3 | Pagination is triggered by scroll-to-top (load more). |
| AC-4 | All messages are returned including `under_review` and `blocked` ones (moderation filter removed for visibility, but blocked ones render as "deleted by admin"). |

**Key Files:** `server/src/controllers/message.controller.js:120-198`

---

**M7 — Soft-Delete Messages & Conversations**
> As a **user**, I want to delete a single message or an entire conversation so that I can clean up my chat history.

| Attribute | Detail |
|---|---|
| **Priority** | Could Have |
| **Acceptance Criteria** | |
| AC-1 | User can delete a single message via `DELETE /api/messages/:messageId`. |
| AC-2 | Deletion is soft — the user's ID is appended to `Message.deletedBy` array. |
| AC-3 | The other participant still sees the message (it's only hidden for the deleter). |
| AC-4 | User can delete an entire conversation via `DELETE /api/messages/conversation/:userId`. |
| AC-5 | Bulk soft-delete appends user ID to all messages in the thread. |
| AC-6 | Socket.IO `message_deleted` event updates the other user's UI. |

**Key Files:** `server/src/controllers/message.controller.js:374-429`, `server/src/models/Message.js:70-75`

---

### 3.3 Moderation & Safety

---

**M8 — Admin-Modified Messages Show "Deleted by Admin"**
> As a **user**, I want to know when a message has been removed by an admin (rather than by the other user) so that I understand the content was moderated, not just deleted.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | When `Message.moderationStatus = 'blocked'`, the message renders as a dashed placeholder bubble. |
| AC-2 | Placeholder text: *"This message has been deleted by admin."* |
| AC-3 | The placeholder shows regardless of whether the current user sent or received the blocked message. |
| AC-4 | The original content is preserved in the database (not hard-deleted) for audit. |

**Key Files:** `client/src/pages/ChatScreen.js:534-555, 663-687`, `server/src/controllers/admin.controller.js:945-991`

---

**M9 — Blocked Users Cannot Message Each Other**
> As a **user**, I cannot message someone who has blocked me so that blocked users don't harass each other through DMs.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Server checks `user.blockedUsers` array before allowing message send. |
| AC-2 | If blocked, returns 403 with error: "You cannot message this user." |
| AC-3 | Blocking is per-user — blocking someone also prevents them from messaging you. |
| AC-4 | Unblocking removes the restriction. |

**Key Files:** `server/src/controllers/message.controller.js:52-57`, `server/src/models/User.js:103-106`

---

**M10 — Suspended/Banned Users Lose Platform Access**
> As a **suspended or banned user**, I want my messaging access revoked so that moderation is enforced platform-wide, not just in the admin panel.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Auth middleware checks `accountStatus` against `BLOCKED_STATUSES = ['suspended', 'banned', 'locked']`. |
| AC-2 | Blocked users receive 403 on every authenticated endpoint including messaging. |
| AC-3 | Company `moderationStatus` is also checked for employers. |
| AC-4 | Blocked users see: "Your account has been [suspended/banned]. Please contact admin@skillbridge.ug." |

**Key Files:** `server/src/middleware/auth.js:5-36`

---

### 3.4 Search & Discovery

---

**M11 — Search Users to Start a Conversation**
> As a **user**, I want to search for Workers, Employers, or Companies by name so that I can easily start a new conversation.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | Mobile Messages hub has a Search tab with filter chips: Workers, Employers, Companies. |
| AC-2 | Search results show user/company cards with avatars and relevant info. |
| AC-3 | Each result card has "View Profile/Jobs" and "Message" buttons. |
| AC-4 | Tapping "Message" opens a new or existing chat with that user. |

**Key Files:** `mobile/src/screens/shared/MessagesScreen.js` — Search tab

---

### 3.5 Message Management & Conversation Features

---

**M12 — Individual Message Deletion**
> As a **user**, I want to delete a specific message from a conversation so that I can remove messages that are no longer relevant or were sent by mistake.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | User can long-press (mobile) or hover/click a message action menu (web) to reveal a delete option for a single message. |
| AC-2 | A confirmation dialog ("Are you sure you want to delete this message?") is displayed before deletion. |
| AC-3 | On confirmation, the client calls `DELETE /api/messages/:messageId`. |
| AC-4 | The message is soft-deleted for the current user only (appended to `deletedBy` array). |
| AC-5 | The deleted message is removed from the user's conversation view. |
| AC-6 | The other participant still sees the message unless they also delete it. |
| AC-7 | Socket.IO `message_deleted` event updates the other user's UI. |

**Key Files:** `server/src/controllers/message.controller.js:374-407`, `server/src/models/Message.js:70-75`

---

**M13 — Multi-Message Selection and Bulk Deletion**
> As a **user**, I want to select multiple messages and delete them in bulk so that I can efficiently manage and clean up conversation history.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | User can enter a "selection mode" via a long-press gesture on a message (mobile) or a "Select" button in the chat header (web). |
| AC-2 | In selection mode, tapping messages toggles their selected state (checkbox or highlight). |
| AC-3 | User sees a count of selected messages and a "Delete Selected" action button. |
| AC-4 | Tapping "Delete Selected" shows a confirmation dialog ("Delete {n} messages?"). |
| AC-5 | On confirmation, the client soft-deletes all selected messages for the current user. |
| AC-6 | Deleted messages disappear from view; remaining messages stay intact. |
| AC-7 | Socket.IO `message_deleted` events are emitted for each deleted message so the other participant's UI updates. |

**Key Files:** `server/src/controllers/message.controller.js:374-429` (existing soft-delete), new client/mobile UI state management

---

### 3.6 Presence & Real-Time Indicators

---

**M14 — Typing Indicators**
> As a **user**, I want to see when another user is typing so that I know a response is being prepared.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | When User A types in the chat input, the client emits a `typing` Socket.IO event to User B. |
| AC-2 | The server relays the typing status to the recipient via `typing_status` event. |
| AC-3 | User B's chat header shows "Typing..." while User A is actively typing. |
| AC-4 | The indicator disappears after 3 seconds of inactivity or when the message is sent. |
| AC-5 | Only the two participants in the conversation can see the indicator. |
| AC-6 | Infinite typing loops are prevented (typing stop is sent when input is empty or after a timeout). |

**Key Files:** `server/src/controllers/message.controller.js:348-371`, `client/src/pages/ChatScreen.js:439-453`, `mobile/src/screens/shared/ChatScreen.js:346-364`

---

**M15 — Online Status and Last Active Information**
> As a **user**, I want to see whether another user is online or when they were last active so that I can determine their availability before sending a message.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | The chat header displays a green dot indicator next to the other user's avatar when they are online. |
| AC-2 | When offline, the header shows a relative timestamp of last activity (e.g., "Last seen 2h ago"). |
| AC-3 | Online status updates in real time via Socket.IO `user_status_changed` event. |
| AC-4 | Status is updated when the chat screen is focused and refreshed on navigation. |
| AC-5 | Only authorized participants in the conversation can see the presence status. |
| AC-6 | The mobile inbox also shows an online dot next to recent contacts. |

**Key Files:** `server/src/models/User.js:91-92`, `server/src/routes/user.routes.js`, `client/src/pages/ChatScreen.js:288-290, 510, 516-517`, `mobile/src/screens/shared/ChatScreen.js:66-69, 727, 828, 869`

---

### 3.7 Conversation Discovery

---

**M16 — User Search for New Conversations**
> As a **user**, I want to search for other users by name or email address so that I can start new conversations efficiently.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | User can access a search interface from the Messages hub to find other users. |
| AC-2 | Search supports partial and case-insensitive matches on both name and email address. |
| AC-3 | Search results display matching users with their avatar, name, and email/role. |
| AC-4 | Each result card provides a direct "Message" action that opens a new or existing conversation. |
| AC-5 | No duplicate conversations are created — the system opens the existing thread if one exists. |
| AC-6 | Search results update in real time as the user types (with debouncing). |

**Key Files:** `mobile/src/screens/shared/MessagesScreen.js` — Search tab, `client/src/pages/MessagesPage.js`

---

## 4. Reporting Module — User Stories

### 4.1 Submitting Reports

---

**R1 — Report a Specific Message**
> As a **user**, I want to report a specific message in a conversation (via hover-flag on web or long-press context menu on mobile) so that I can flag harmful, threatening, or inappropriate content.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Received messages show a flag icon on hover (web) or in a long-press context menu (mobile). |
| AC-2 | Tapping the flag opens the `ReportBottomSheet` with `targetType: 'message', targetId: msg._id`. |
| AC-3 | Own sent messages cannot be reported. |
| AC-4 | Report is submitted via `POST /api/reports`. |

**Key Files:** `client/src/pages/ChatScreen.js:581-593`, `mobile/src/screens/shared/ChatScreen.js:801-821`

---

**R2 — Report a User or Company**
> As a **user**, I want to report a user profile or company page so that I can flag fake profiles, scams, or fraudulent employers.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | User/company profile pages have a "Report" button/option. |
| AC-2 | Report pre-fills `targetType: 'user'` or `'company'` and the correct `targetId`. |
| AC-3 | Same report flow as messages (reason → details → success). |

**Key Files:** `client/src/pages/AdminTargetDetailPage.js`, mobile context menu

---

**R3 — Report an Opportunity**
> As a **user**, I want to report a job posting so that I can flag fraudulent/scam opportunities.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | Opportunity detail/listing pages have a "Report" option. |
| AC-2 | Report pre-fills `targetType: 'opportunity'` and the correct `targetId`. |
| AC-3 | Supports all 6 reasons including `fraudulent_scam`, `fake_credentials`, `payment_request`. |

**Key Files:** `client/src/pages/OpportunityDetailScreen.js`, mobile opportunity screen

---

**R4 — Six-Category Reason Selection**
> As a **reporter**, I want to select a reason from 6 predefined categories so that admins understand what type of violation I'm reporting.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | The 6 reasons are: `fraudulent_scam`, `spam`, `inappropriate_content`, `fake_credentials`, `payment_request`, `other`. |
| AC-2 | Each reason has an icon and a short description in the UI. |
| AC-3 | Only one reason can be selected per report. |
| AC-4 | Server validates the reason against the enum. |

**Key Files:** `server/src/validators/index.js:191-203`, `client/src/pages/ReportBottomSheet.js`

---

**R5 — Optional Details (Free Text)**
> As a **reporter**, I want to optionally add free-text details (max 2000 characters) so that I can explain the context of my report.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | After selecting a reason, the bottom sheet advances to a details textarea. |
| AC-2 | Textarea has a 2000-character limit with a live counter. |
| AC-3 | Details are optional — user can submit with just a reason. |
| AC-4 | Details are stored in `Report.details` and visible to admins. |

**Key Files:** `client/src/pages/ReportBottomSheet.js`, `server/src/models/Report.js`

---

**R6 — Anonymous Reporting**
> As a **reporter**, I want my identity to be hidden from the target so that reported users cannot retaliate against me.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | `Report.reporterId` is stored but never exposed to the reported target. |
| AC-2 | Admins can see who submitted the report (for audit/trust). |
| AC-3 | The UI shows "Your report is anonymous" during the report flow. |

**Key Files:** `server/src/models/Report.js`, `server/src/controllers/report.controller.js`

---

**R7 — Report Success Confirmation**
> As a **reporter**, I want a clear success confirmation after submitting a report so that I know my action was recorded.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | After submission, the bottom sheet shows a checkmark animation + "Report Submitted. Thank you." |
| AC-2 | For reports that trigger auto-escalation: "Report submitted and content moved to admin review." |
| AC-3 | User can dismiss the sheet and return to their conversation/profile. |

**Key Files:** `client/src/pages/ReportBottomSheet.js` — Stage 3 (Success)

---

**R8 — Anti-Spam: Duplicate Report Window**
> As a **system**, I want to block duplicate reports on the same target within 1 hour so that the admin queue is not flooded.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Before creating a report, server checks for an existing report from the same user on the same target within `DUPLICATE_REPORT_WINDOW_MS` (1 hour). |
| AC-2 | If a duplicate is detected, the API returns 409 with: "You have already reported this recently." |
| AC-3 | Users can re-report after the window expires. |

**Key Files:** `server/src/controllers/report.controller.js:130-140`

---

### 4.2 Automatic Escalation

---

**R9 — Auto-Escalation at 3+ Reports (48-Hour Window)**
> As a **system**, when a target receives 3+ reports within 48 hours, I want it automatically suspended/blocked and a `ModerationCase` opened so that high-risk content does not linger.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Server counts reports on the same `targetId + targetType` within `AUTO_HIDE_WINDOW_MS` (48 hours). |
| AC-2 | If count ≥ 3: |
| | • `ModerationCase` is created or updated (status: `under_review`). |
| | • Opportunity → `status: 'under_review'` |
| | • User → `accountStatus: 'suspended'` |
| | • Message → `moderationStatus: 'under_review'` |
| | • Company → `verificationStatus: 'pending'` |
| AC-3 | All active admins receive a `moderation`-type notification. |
| AC-4 | Reporter receives: "Report submitted and content moved to admin review." |
| AC-5 | If count < 3: reporter receives "Report submitted. Thank you." |

**Key Files:** `server/src/controllers/report.controller.js:160-189`, `server/src/models/ModerationCase.js`

---

### 4.3 Admin Moderation Workflow

---

**R10 — Admin Reports Dashboard (Searchable List)**
> As an **admin**, I want a Reports tab in the dashboard listing all reports with search so that I can triage reports efficiently.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Reports tab shows: target type, target name, reporter name, date, reason, status badge. |
| AC-2 | Search bar filters by: company name, user name, opportunity title, email, message content, sender/recipient, reason. |
| AC-3 | Status badges are color-coded: `pending` (yellow), `reviewed` (blue), `action_taken` (green), `dismissed` (gray). |
| AC-4 | "No reports to review" empty state shown when no results match. |
| AC-5 | Pagination is supported for large report sets. |

**Key Files:** `client/src/pages/AdminDashboard.js:1653-1851`

---

**R11 — Mark Report as Reviewed**
> As an **admin**, I want to mark a report as "Reviewed" so that I can track which reports I have already examined.

| Attribute | Detail |
|---|---|
| **Priority** | Should Have |
| **Acceptance Criteria** | |
| AC-1 | Only reports with `status: 'pending'` show the "Mark Reviewed" button. |
| AC-2 | Action updates report status to `reviewed`. |
| AC-3 | Report card updates instantly in the UI without a full reload. |
| AC-4 | Toast notification confirms the action. |

**Key Files:** `AdminDashboard.js:1769-1775`, `server/src/controllers/admin.controller.js`

---

**R12 — Dismiss a Report**
> As an **admin**, I want to dismiss a report when no action is warranted so that it is archived and no longer appears as pending.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | "Dismiss" button is available for all non-dismissed reports. |
| AC-2 | Action updates report status to `dismissed`. |
| AC-3 | If the report was linked to a `ModerationCase`, the case may be closed or updated. |
| AC-4 | Toast notification confirms the action. |

**Key Files:** `AdminDashboard.js:1777-1783`

---

**R13 — Graduated User Moderation: Warn → Suspend → Ban**
> As an **admin**, I want four actions (Warn, Suspend, Ban, Reinstate) on user/company targets so that I have a graduated moderation ladder appropriate to the severity of the violation.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | **Warn** → sets `accountStatus: 'warned'`; user remains active but sees a warning notification. |
| AC-2 | **Suspend** → sets `accountStatus: 'suspended'`; user is blocked from login/API access temporarily. |
| AC-3 | **Ban** → sets `accountStatus: 'banned'`; user is permanently blocked; notification says "This action is not reversible." |
| AC-4 | **Reinstate** → sets `accountStatus: 'active'`; only available for `warned` and `suspended` accounts. |
| AC-5 | **Banned accounts CANNOT be reinstated** — returns 403 with: "Banned accounts cannot be reinstated. This action is permanent." |
| AC-6 | Admin is prompted for a reason/note for warn/suspend/ban (shown in user notification). |
| AC-7 | Admin confirms reinstate via `window.confirm` (no note required). |

**Key Files:** `server/src/controllers/admin.controller.js:751-830`

---

**R14 — Company Moderation Syncs to Linked Employers**
> As an **admin**, when I take action on a company (suspend/ban), I want all linked employer accounts to be affected so that the moderation is enforced across all user accounts under that company.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | `applyCompanyAction` updates `Company.moderationStatus`. |
| AC-2 | All `User` documents with `companyId` matching the company are updated to the same `accountStatus`. |
| AC-3 | All linked employers receive a `account_status` notification. |
| AC-4 | Moderation note is also synced to each user's `moderationNote` field. |

**Key Files:** `server/src/controllers/admin.controller.js:858-944`

---

**R15 — Admin Notifications for Moderation Actions**
> As an **admin**, when I apply warn/suspend/ban/reinstate to a user or company, I want the affected user to receive a tailored notification so that they know exactly what happened and why.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | **Warn**: "Account Warning — Your account has received a formal warning... Further violations may result in suspension." |
| AC-2 | **Suspend**: "Account Suspended — Your account has been temporarily suspended... Contact admin@skillbridge.ug if you believe this is an error." |
| AC-3 | **Ban**: "Account Banned — Your account has been permanently banned due to serious or repeated violations... This action is not reversible." |
| AC-4 | **Reinstate**: "Account Reinstated — Your account has been reviewed and reinstated." |
| AC-5 | If admin provided a note, it is appended: "Reason: {note}." |
| AC-6 | Same notification patterns apply for companies (title prefixes: "Company Account..."). |

**Key Files:** `server/src/controllers/admin.controller.js:799-818` (user), `admin.controller.js:870-888` (company)

---

**R16 — Full Audit Trail**
> As a **compliance officer**, I want every admin moderation action logged to `AuditLog` so that there is a tamper-evident record of all trust & safety decisions.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | Every `applyUserAction`, `applyCompanyAction`, `applyMessageAction` creates an `AuditLog` entry. |
| AC-2 | `AuditLog` fields: `adminId`, `action` (e.g. `user_suspend`, `company_ban`, `message_remove`), `targetType`, `targetId`, `notes`, `metadata` (reportId, previousStatus). |
| AC-3 | Audit logs are never editable or deletable by regular users. |
| AC-4 | Failed audit log writes are logged as warnings but do not block the moderation action. |

**Key Files:** `server/src/controllers/admin.controller.js:784-796`

---

### 4.4 Message Moderation

---

**R17 — Admin Can Remove or Leave Reported Messages**
> As an **admin**, I want to either remove a reported message or leave it as-is so that I have full control over message-level moderation.

| Attribute | Detail |
|---|---|
| **Priority** | Must Have |
| **Acceptance Criteria** | |
| AC-1 | **Remove message** → sets `Message.moderationStatus = 'blocked'`. |
| AC-2 | **Leave as-is** → resets `Message.moderationStatus = 'normal'`. |
| AC-3 | Blocked messages are hidden from all users' conversations and replaced with "deleted by admin" placeholder. |
| AC-4 | Blocked messages are preserved in the database (not hard-deleted) for audit. |
| AC-5 | If linked to a report: remove → `action_taken`, leave → `dismissed`. |
| AC-6 | Both parties to the conversation see the placeholder. |

**Key Files:** `server/src/controllers/admin.controller.js:945-991`

---

## 5. Non-Functional Requirements

| ID | Requirement |
|---|---|
| **NFR-1** | **Real-time latency**: Socket.IO events (`new_message`, `typing_status`, `messages_read`, `message_deleted`) must be delivered within 200ms under normal network conditions. |
| **NFR-2** | **Message persistence**: All messages are stored in MongoDB with indexes on `senderId+receiverId`, `receiverId+readStatus`, `sentAt`. |
| **NFR-3** | **File storage**: Attachments are stored via configured storage (local/cloud); URLs are preserved in `Message.attachments`. |
| **NFR-4** | **Auto-escalation timing**: Report counting uses server-side timestamps; the 48-hour and 1-hour windows are enforced server-side and cannot be bypassed by client clock manipulation. |
| **NFR-5** | **Moderation enforcement**: Suspension/ban status is checked in `auth` middleware on every request — it cannot be bypassed by direct API calls. |
| **NFR-6** | **Notification delivery**: All admin moderation actions trigger `Notification.create()`; failures are logged as warnings but do not block the action. |
| **NFR-7** | **Cross-platform consistency**: Messaging and reporting flows must work identically on Web (React) and Mobile (React Native), with the same backend endpoints. |
| **NFR-8** | **Mobile offline resilience**: ChatScreen should handle temporary network drops gracefully (Socket.IO auto-reconnect). |

---

## 6. API Endpoint Summary

### Messaging

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/messages` | `authenticate` | Send a message (with optional file attachments) |
| GET | `/api/messages/inbox` | `authenticate` | Get all conversations (last message + unread count) |
| GET | `/api/messages/unread-count` | `authenticate` | Get total unread message count |
| GET | `/api/messages/conversation/:userId` | `authenticate` | Get paginated conversation with a specific user |
| POST | `/api/messages/mark-delivered` | `authenticate` | Bulk mark messages as delivered |
| POST | `/api/messages/mark-read` | `authenticate` | Bulk mark messages as read |
| POST | `/api/messages/typing` | `authenticate` | Send typing indicator |
| DELETE | `/api/messages/:messageId` | `authenticate` | Soft-delete a single message |
| DELETE | `/api/messages/conversation/:userId` | `authenticate` | Soft-delete entire conversation |

### Reporting

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/reports` | `authenticate` | Create a new report |
| GET | `/api/reports` | `authenticate`, `admin` | List all reports (paginated, filterable) |
| GET | `/api/reports/target/:targetType/:targetId` | `authenticate`, `admin` | Get all reports for a specific target |
| PUT | `/api/reports/:id/status` | `authenticate`, `admin` | Update a report's status |

### Admin Moderation

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/admin/users/:userId/action` | `admin` | Apply warn/suspend/ban/reinstate to user |
| POST | `/api/admin/companies/:companyId/action` | `admin` | Apply warn/suspend/ban/reinstate to company |
| POST | `/api/admin/messages/:messageId/action` | `admin` | Remove or leave a reported message |

---

## 7. Data Model Summary

### Message
```js
{
  senderId: ObjectId (ref: User),
  receiverId: ObjectId (ref: User),
  applicationRef: ObjectId (ref: Application, optional),
  content: String (optional — attachment-only messages allowed),
  attachments: [{ fileName, fileUrl, fileSize, fileType, mimeType }],
  readStatus: Boolean (default: false),
  deliveredStatus: Boolean (default: false),
  status: enum ['sent', 'delivered', 'read', 'failed'] (default: 'sent'),
  moderationStatus: enum ['normal', 'under_review', 'blocked'] (default: 'normal'),
  sentAt: Date,
  deletedBy: [ObjectId (ref: User)] — soft-delete per-user,
  replyTo: ObjectId (ref: Message, optional)
}
```

### Report
```js
{
  reporterId: ObjectId (ref: User),
  targetId: ObjectId,
  targetType: enum ['opportunity', 'user', 'message', 'company'],
  reason: enum ['fraudulent_scam', 'spam', 'inappropriate_content', 'fake_credentials', 'payment_request', 'other'],
  details: String (max: 2000),
  status: enum ['pending', 'under_review', 'reviewed', 'action_taken', 'resolved', 'dismissed'] (default: 'pending')
}
```

### ModerationCase
```js
{
  targetType: String,
  targetId: ObjectId,
  reportCount: Number,
  status: enum ['open', 'under_review', 'resolved', 'dismissed'] (default: 'open'),
  assignedAdmin: ObjectId (ref: User, optional),
  reportIds: [ObjectId (ref: Report)],
  notes: String
}
```

### Notification (relevant types)
```js
{
  type: enum ['message', 'account_status', 'moderation', ...],
  title: String,
  content: String,
  userId: ObjectId (ref: User),
  metadata: Object
}
```

### User (relevant fields)
```js
{
  accountStatus: enum ['active', 'locked', 'suspended', 'warned', 'banned'] (default: 'active'),
  blockedUsers: [ObjectId (ref: User)],
  moderationNote: String (max: 500),
  isOnline: Boolean,
  lastSeenAt: Date
}
```

---

## 8. Out of Scope (Future Iterations)

| Feature | Reason |
|---|---|
| Group chats / multi-party conversations | Current model is 1:1 only |
| End-to-end encryption | Platform is not E2EE by design (needs admin moderation visibility) |
| Message reactions / emoji | Not in current SDD |
| Voice/video calls | Not in current SDD |
| Appeal system for message moderation | Users can re-report but cannot appeal blocked messages |
| Admin chat with users | Admin-to-user direct messaging not implemented |
| Report appeal by target | Target cannot contest a report directly |

---

## 9. Definition of Done

A story is considered **Done** when:

1. Backend endpoint is implemented, validated, and tested.
2. Socket.IO events are emitted correctly (where applicable).
3. Web UI (`client/src/`) AND Mobile UI (`mobile/src/`) are both implemented.
4. Notifications are created and delivered for all action paths.
5. `AuditLog` entries are written for all admin moderation actions.
6. Suspension/ban enforcement is verified in `auth` middleware and message controllers.
7. The feature matches the SBOUP definitions for suspend (temporary, reversible) and ban (permanent, irreversible).
8. Admin contact email `admin@skillbridge.ug` appears in all user-facing blocked/suspended messages.

---

*Document maintained by Nakanwagi Vanesa. Updates should be reflected in both this PRD and the SBOUP-Implementation-Plan.md.*
