# Testing Admin Moderation Flow - Step by Step

## Prerequisites
- Backend running: `npm start` in `/server`
- Client running: `npm start` in `/client`
- MongoDB running (docker or local)
- At least 3 user accounts (2+ workers, 1 employer, 1 admin)

---

## Setup: Create Test Data

### 1. Create Test Users (if not exists)
Use Postman or curl to create users:

**Worker 1:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Worker 1",
    "email": "worker1@test.com",
    "password": "TestPass123!",
    "role": "skilled_worker",
    "profileType": "profile"
  }'
```

**Worker 2:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Worker 2",
    "email": "worker2@test.com",
    "password": "TestPass123!",
    "role": "skilled_worker",
    "profileType": "profile"
  }'
```

**Worker 3:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Worker 3",
    "email": "worker3@test.com",
    "password": "TestPass123!",
    "role": "skilled_worker",
    "profileType": "profile"
  }'
```

**Employer:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Employer",
    "email": "employer@test.com",
    "password": "TestPass123!",
    "role": "employer",
    "profileType": "company"
  }'
```

**Admin (if not exists):**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "fullName": "Test Admin",
    "email": "admin@test.com",
    "password": "TestPass123!",
    "role": "admin",
    "profileType": "profile"
  }'
```

---

## Test 1: Create Reportable Content

### Create an Opportunity (as Employer)

**1. Login as Employer**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employer@test.com",
    "password": "TestPass123!"
  }' | jq '.token'
```
Save the token as `EMPLOYER_TOKEN`

**2. Create Opportunity**
```bash
EMPLOYER_TOKEN="<from above>"

curl -X POST http://localhost:5000/api/opportunities \
  -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "FRAUDULENT Senior Developer",
    "description": "This is a suspicious job posting designed to test moderation. No actual job. Wire money to xyz account.",
    "location": "Remote",
    "salary": 50000,
    "paymentType": "monthly",
    "skills": ["JavaScript", "React"],
    "workType": "full-time"
  }' | jq '._id'
```
Save the opportunity ID as `OPP_ID`

---

## Test 2: Trigger Auto-Escalation (3+ Reports)

### Step 1: Get Worker Tokens

**Worker 1:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "worker1@test.com",
    "password": "TestPass123!"
  }' | jq '.token'
```
Save as `WORKER1_TOKEN`

**Worker 2:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "worker2@test.com",
    "password": "TestPass123!"
  }' | jq '.token'
```
Save as `WORKER2_TOKEN`

**Worker 3:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "worker3@test.com",
    "password": "TestPass123!"
  }' | jq '.token'
```
Save as `WORKER3_TOKEN`

### Step 2: Submit 3 Reports

**Report 1 (Worker 1):**
```bash
WORKER1_TOKEN="<token>"
OPP_ID="<opportunity id>"

curl -X POST http://localhost:5000/api/reports \
  -H "Authorization: Bearer $WORKER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "opportunity",
    "targetId": "'$OPP_ID'",
    "reason": "fraud",
    "description": "This posting looks like a scam. Asking for wire transfer."
  }' | jq '.'
```

**Report 2 (Worker 2):**
```bash
WORKER2_TOKEN="<token>"

curl -X POST http://localhost:5000/api/reports \
  -H "Authorization: Bearer $WORKER2_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "opportunity",
    "targetId": "'$OPP_ID'",
    "reason": "fraud",
    "description": "Definitely fraudulent. Classic scam signs."
  }' | jq '.'
```

**Report 3 (Worker 3):**
```bash
WORKER3_TOKEN="<token>"

curl -X POST http://localhost:5000/api/reports \
  -H "Authorization: Bearer $WORKER3_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "targetType": "opportunity",
    "targetId": "'$OPP_ID'",
    "reason": "fraud",
    "description": "Red flags everywhere. Suspicious employer."
  }' | jq '.'
```

**Expected Response on Report #3:**
```json
{
  "report": { "_id": "...", "status": "pending", ... },
  "moderationCase": {
    "_id": "...",
    "targetType": "opportunity",
    "targetId": "<OPP_ID>",
    "reportCount": 3,
    "status": "under_review",
    "reportIds": ["...","...","..."]
  },
  "message": "Report submitted and content moved to admin review."
}
```

---

## Test 3: Verify Backend Data

### Check MongoDB Data

**Option A: MongoDB CLI**
```bash
# Connect to MongoDB
mongosh

# Check reports
db.reports.find({ targetId: ObjectId("<OPP_ID>") })

# Check moderation cases
db.moderationcases.find({ targetId: ObjectId("<OPP_ID>") })

# Check opportunity status
db.opportunities.findOne({ _id: ObjectId("<OPP_ID>") })
```

**Option B: Using API**
```bash
ADMIN_TOKEN="<admin token>"

# Get all open cases
curl http://localhost:5000/api/admin/cases \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'

# Get all reports
curl http://localhost:5000/api/reports \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'

# Get flagged content
curl http://localhost:5000/api/admin/flagged \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
```

**Expected:**
- Opportunity `status: 'under_review'` ✓
- ModerationCase with `reportCount: 3` and `status: 'under_review'` ✓
- 3 Report documents in DB ✓

---

## Test 4: Admin Dashboard UI

### 1. Login as Admin
- Open http://localhost:3000
- Login with: admin@test.com / TestPass123!
- Navigate to Admin → Dashboard

### 2. Check Moderation Tab
**Expected:**
- See the fraudulent opportunity card
- Shows: Title, Posted by (Employer), **Fraud Risk Score** (should be high)
- Description preview
- [Approve] and [Remove] buttons

### 3. Check Cases Tab
**Expected:**
- See moderation case card
- Shows:
  - Target Type: "opportunity"
  - Target ID: `<OPP_ID>`
  - Reports: 3
  - Status: "under_review"
- Buttons: [Approve] [Remove]

---

## Test 5: Admin Takes Action

### Click "Remove" on the Opportunity

**In browser console** (F12 → Console):
```javascript
// You'll see the API call
fetch('http://localhost:5000/api/admin/moderate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer <ADMIN_TOKEN>',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    contentId: '<OPP_ID>',
    contentType: 'opportunity',
    action: 'remove'
  })
})
```

**Expected Frontend:**
- Toast notification: "Content removed" ✓
- Moderation tab: Opportunity disappears from list ✓
- Cases tab: Case disappears from list ✓

**Expected Backend:**
- Opportunity `status: 'blocked'` ✓
- AuditLog entry created:
  ```json
  {
    "adminId": "<ADMIN_ID>",
    "action": "remove",
    "targetType": "opportunity",
    "targetId": "<OPP_ID>",
    "notes": "Opportunity status changed from under_review to blocked",
    "metadata": { "contentType": "opportunity", "action": "remove" }
  }
  ```

### Verify in MongoDB:
```bash
mongosh
db.opportunities.findOne({ _id: ObjectId("<OPP_ID>") })
# Should show: status: "blocked"

db.auditlogs.findOne({ targetId: ObjectId("<OPP_ID>"), action: "remove" })
# Should show admin action entry
```

---

## Test 6: Test User Moderation

### Create Suspicious User (optional)

For this test, you can use an existing worker account and report them:

```bash
WORKER1_TOKEN="<token>"
WORKER_TO_REPORT_ID="<worker1 or worker2 id>"

# Report 3 times
for i in {1..3}; do
  curl -X POST http://localhost:5000/api/reports \
    -H "Authorization: Bearer $WORKER1_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "targetType": "user",
      "targetId": "'$WORKER_TO_REPORT_ID'",
      "reason": "harassment",
      "description": "Inappropriate behavior #'$i'"
    }'
done
```

### Check Cases Tab
- Should see a case with:
  - Target Type: "user"
  - Target ID: `<USER_ID>`
  - Reports: 3
  - User accountStatus should be "suspended" already

### Admin Action: Reactivate
- Click [Reactivate] button
- User accountStatus → "active" ✓
- Case disappears from list ✓

---

## Test 7: Test Message Moderation

### Send a Message (as one worker to another)
```bash
WORKER1_TOKEN="<token>"
WORKER2_ID="<worker2 id>"

curl -X POST http://localhost:5000/api/messages \
  -H "Authorization: Bearer $WORKER1_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "receiverId": "'$WORKER2_ID'",
    "content": "This is a test message"
  }' | jq '._id'
```
Save as `MESSAGE_ID`

### Report the Message 3 Times
```bash
# From different workers
for i in {1..3}; do
  curl -X POST http://localhost:5000/api/reports \
    -H "Authorization: Bearer $WORKER${i}_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{
      "targetType": "message",
      "targetId": "'$MESSAGE_ID'",
      "reason": "spam",
      "description": "Spam message #'$i'"
    }'
done
```

### Check Cases Tab
- Should see a case with Target Type: "message"
- Admin can click [Remove] or [Restore]

---

## Quick Test Checklist

- [ ] 3 workers created
- [ ] 1 employer created
- [ ] 1 admin account exists
- [ ] Fraudulent opportunity created
- [ ] 3 reports submitted (auto-escalation triggered)
- [ ] MongoDB shows opportunity status = 'under_review'
- [ ] MongoDB shows ModerationCase created
- [ ] Admin dashboard loads
- [ ] **Moderation tab** shows flagged opportunity
- [ ] **Cases tab** shows moderation case with 3 reports
- [ ] Admin clicks [Remove]
- [ ] Frontend toast shows success
- [ ] Opportunity disappears from both tabs
- [ ] MongoDB shows opportunity status = 'blocked'
- [ ] MongoDB shows AuditLog entry

---

## Debugging

### If moderation case doesn't appear:
1. Check Report.create() in controller - ensure auto-escalation logic runs
2. Verify MongoDB ModerationCase collection has entries
3. Check browser console for API errors
4. Verify admin token is valid

### If action doesn't work:
1. Open browser DevTools → Network tab
2. Click admin action button
3. Check POST /api/admin/moderate request
4. Look for errors in response
5. Check backend logs: `npm start` output

### If dashboard doesn't load:
1. Verify admin auth token
2. Check `/api/admin/cases` API call
3. Verify MongoDB connection
4. Check backend logs for errors

### Useful Backend Commands:
```bash
# Clear all reports
db.reports.deleteMany({})

# Clear all cases
db.moderationcases.deleteMany({})

# Clear audit logs
db.auditlogs.deleteMany({})

# Get opportunity details
db.opportunities.findOne({ title: /FRAUDULENT/ })

# Count reports for an opportunity
db.reports.countDocuments({ targetId: ObjectId("<OPP_ID>") })
```

