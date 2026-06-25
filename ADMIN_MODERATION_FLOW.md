# Admin Moderation Flow - Complete Breakdown

## Overview
When an admin clicks an action (approve/remove/suspend/reactivate) on reported content, here's the complete flow:

---

## 1. BEFORE: What Triggers Moderation Review

### Auto-Hidden Content (Auto-Escalation)
When a content receives **3+ reports in 48 hours**:

```
User Reports Content
  ↓
Report.create() → Report submitted
  ↓
Count recent reports (last 48h)
  ↓
If count >= 3:
  └─ Auto-hide content
  └─ Create ModerationCase
  └─ Update content status to 'under_review'
  └─ Notify all active admins
  └─ Create AuditLog entry
```

**What gets auto-hidden:**
- **Opportunity**: `status → 'under_review'`
- **User**: `accountStatus → 'suspended'`
- **Message**: `moderationStatus → 'under_review'`

---

## 2. DASHBOARD: What Admins See

### A) Moderation Tab (Flagged Content)
**Source:** `GET /api/admin/flagged`

**Displays:**
- Opportunities with `status: 'under_review'`
- Shows:
  - Opportunity title
  - Posted by (employer fullName)
  - **Fraud Risk Score** (color-coded: red >70, yellow >30, green <30)
  - First 3 lines of description
  - Action buttons: **Approve** | **Remove**

**Example:**
```
┌─────────────────────────────────┐
│ [FLAGGED] Opportunity Card      │
│ Title: Senior Developer Role    │
│ Posted by: John Smith           │
│ Fraud Risk: 85 (RED)            │
│ Description: We're looking...   │
│ [Approve] [Remove]              │
└─────────────────────────────────┘
```

### B) Cases Tab (Moderation Cases)
**Source:** `GET /api/admin/cases`

**Displays:**
- ModerationCase records with `status: { $in: ['open', 'under_review'] }`
- Shows:
  - **Target Type**: opportunity | user | message
  - **Target ID**: The ID of the reported content
  - **Reports**: How many reports triggered this case (minimum 3)
  - **Status**: open | under_review
  - **Assigned Admin**: If assigned to someone (optional)
  - **Action buttons** (context-aware):
    - If opportunity: **Approve** | **Remove**
    - If user: **Suspend** | **Reactivate**
    - If message: **Remove** | **Restore**

**Example:**
```
┌─────────────────────────────────────────┐
│ Moderation Case                         │
│ Type: opportunity                       │
│ Target ID: 507f1f77bcf86cd799439011    │
│ Reports: 5                              │
│ Status: under_review                    │
│ Assigned Admin: Jane Doe                │
│                                         │
│ [Approve] [Remove]                      │
└─────────────────────────────────────────┘
```

---

## 3. ADMIN CLICKS ACTION: The Full Backend Flow

### Endpoint Called
```
POST /api/admin/moderate
Body: {
  contentId: "...",
  contentType: "opportunity" | "user" | "message",
  action: "approve" | "remove" | "suspend" | "reactivate" | "restore"
}
```

### Controller: `admin.controller.js → moderateContent()`

#### For **Opportunity**:
```javascript
If action === "approve":
  ✓ Update Opportunity.status → 'published'
  ✓ Trigger onOpportunityPublished() (worker notifications, etc.)
  
If action === "remove":
  ✓ Update Opportunity.status → 'blocked'
```

#### For **User**:
```javascript
If action === "suspend":
  ✓ Update User.accountStatus → 'suspended'
  
If action === "reactivate" || "restore":
  ✓ Update User.accountStatus → 'active'
  
If action === "ban" || "remove":
  ✓ Update User.accountStatus → 'banned'
```

#### For **Message**:
```javascript
If action === "remove":
  ✓ Update Message.moderationStatus → 'blocked'
  ✓ Message becomes hidden from receivers
  
If action === "restore":
  ✓ Update Message.moderationStatus → 'normal'
```

### After Update - Audit Trail
**Every moderation action creates:**

1. **AuditLog entry**:
   ```javascript
   {
     adminId: req.user._id,
     action: "approve" | "remove" | ...,
     targetType: "opportunity" | "user" | "message",
     targetId: contentId,
     notes: "Opportunity status changed from under_review to published",
     metadata: { contentType, action },
     createdAt: now
   }
   ```

2. **Response back to frontend**:
   ```json
   {
     "message": "Opportunity restored successfully."
   }
   ```

---

## 4. FRONTEND: What Happens After Action

### File: `client/src/pages/AdminDashboard.js`

#### Step 1: Action Button Clicked
```javascript
onClick={() => moderateContent(c.targetId, 'opportunity', 'approve')}
```

#### Step 2: Frontend Function Executes
```javascript
const moderateContent = async (contentId, contentType, action) => {
  try {
    await adminAPI.moderate({ contentId, contentType, action });
    
    // Show success
    toast.success(`Content ${action}d`);
    
    // Remove from Moderation tab
    if (contentType === 'opportunity') {
      setFlagged((prev) => ({
        ...prev,
        flaggedOpportunities: prev.flaggedOpportunities.filter(
          (o) => o._id !== contentId
        ),
      }));
    }
    
    // Remove from Cases tab
    setCases((prev) => prev.filter(
      (c) => c.targetId !== contentId || c.targetType !== contentType
    ));
  } catch {
    toast.error('Action failed');
  }
};
```

#### Step 3: Dashboard Updates
- **Moderation Tab**: The item disappears from the list
- **Cases Tab**: The case is removed from the list
- **Toast notification**: "Content approved" or "Content removed"
- User can continue reviewing other cases

---

## 5. EXAMPLE SCENARIO: End-to-End

### Initial Event
```
Worker reports an opportunity as fraudulent
  ↓
2 more workers report the same opportunity
  ↓
Total: 3 reports in 48 hours
```

### Backend Auto-Escalation
```
Report #3 submitted
  ↓
Report.create() + count = 3
  ↓
Opportunity.status → 'under_review' ✓
ModerationCase.create() with:
  - targetType: "opportunity"
  - targetId: <oppId>
  - reportCount: 3
  - status: "under_review"
  ↓
Admins notified: "A reported opportunity has reached 3 reports..."
AuditLog: "auto_hidden after 3 reports"
```

### Admin Dashboard
```
Admin opens Dashboard → Moderation tab
  ↓
Loads flagged opportunities
  ↓
Sees: "Senior Developer - Fraud Risk: 85"
  ↓
Admin clicks [Remove]
  ↓
POST /api/admin/moderate sent
  └─ contentId: <oppId>
  └─ contentType: "opportunity"
  └─ action: "remove"
```

### Backend Processing
```
Opportunity.findByIdAndUpdate({status: 'blocked'})
  ↓
AuditLog.create({
  adminId: <adminId>,
  action: "remove",
  targetType: "opportunity",
  targetId: <oppId>,
  notes: "Opportunity status changed from under_review to blocked"
})
  ↓
Response: "Opportunity removed successfully."
```

### Frontend Update
```
Toast: "Content removed" ✓
Moderation tab: Opportunity disappears from list
Cases tab: Case for this opportunity is removed
Admin sees: "[0 cases remaining]"
```

---

## 6. Data Models Summary

### ModerationCase
```javascript
{
  _id: ObjectId,
  targetType: "opportunity" | "user" | "message",
  targetId: ObjectId,
  reportCount: number,
  reportIds: [ObjectId],
  status: "open" | "under_review" | "closed",
  assignedAdmin: ObjectId | null,
  createdAt: Date,
  updatedAt: Date
}
```

### AuditLog
```javascript
{
  _id: ObjectId,
  adminId: ObjectId,
  action: "approve" | "remove" | "suspend" | "reactivate" | "restore" | "auto_hidden",
  targetType: "opportunity" | "user" | "message",
  targetId: ObjectId,
  notes: string,
  metadata: object,
  createdAt: Date
}
```

### Report
```javascript
{
  _id: ObjectId,
  reporterId: ObjectId (user who reported),
  targetType: "opportunity" | "user" | "message",
  targetId: ObjectId,
  reason: string,
  description: string,
  status: "pending" | "reviewed" | "resolved",
  createdAt: Date
}
```

---

## 7. Available Admin Actions by Content Type

| Content Type | Actions | Before | After |
|---|---|---|---|
| **Opportunity** | Approve | `status: 'under_review'` | `status: 'published'` |
| | Remove | `status: 'under_review'` | `status: 'blocked'` |
| **User** | Suspend | `accountStatus: 'active'` | `accountStatus: 'suspended'` |
| | Reactivate | `accountStatus: 'suspended'` | `accountStatus: 'active'` |
| **Message** | Remove | `moderationStatus: 'under_review'` | `moderationStatus: 'blocked'` |
| | Restore | `moderationStatus: 'blocked'` | `moderationStatus: 'normal'` |

---

## 8. Current Gaps (Optional Enhancements)

- [ ] Admin case assignment UI (assign to specific admin)
- [ ] Case close/resolve action (close case after decision)
- [ ] Bulk moderation actions
- [ ] Case notes/comments by admin
- [ ] Report details view (see why users reported it)
- [ ] Auto-case closure timeline notification

