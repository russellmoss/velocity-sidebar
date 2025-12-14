# n8n Salesforce Leads Webhook - Complete Documentation

**System:** SGA Command Center - Lead Fetching API  
**Version:** 2.0 (Paginated)  
**Last Updated:** December 2025  
**Workflow ID:** `JhIH60jNpfincpG0`  
**Webhook ID:** `025534f6-dde0-4036-b4b9-ed76d284e1c2`

---

## 1. Executive Summary

This n8n workflow serves as the **secure API layer** between the SGA Velocity Chrome Extension (sidebar) and Salesforce. It dynamically fetches leads based on user role (Admin vs SGA) and handles **pagination** to retrieve ALL leads regardless of count (overcoming Salesforce's 2000-record-per-query limit).

### Key Features

| Feature | Description |
|---------|-------------|
| **Role-Based Access** | Admins see ALL leads; SGAs see only their assigned leads |
| **Automatic Pagination** | Loops through Salesforce's `queryMore` endpoint to fetch unlimited records |
| **List Extraction** | Returns unique `Lead_List_Name__c` values for frontend filtering |
| **Real-Time Sync** | Called on-demand when user clicks "Sync" in the Chrome extension |

---

## 2. Architecture Overview

### 2.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                        n8n SALESFORCE LEADS WORKFLOW                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [Chrome Extension]                                                         │
│         │                                                                   │
│         │ GET ?email=user@savvywealth.com                                   │
│         ▼                                                                   │
│  ┌─────────────┐    ┌───────────────────┐    ┌─────────────────────┐       │
│  │   Webhook   │───►│ Build Initial     │───►│    HTTP Request     │       │
│  │   (GET)     │    │ Query             │    │    (Salesforce)     │       │
│  └─────────────┘    └───────────────────┘    └──────────┬──────────┘       │
│                                                         │                   │
│                                                         ▼                   │
│                     ┌─────────────────────────────────────────────┐         │
│                     │         Process & Check for More            │         │
│                     │  • Accumulates records across pagination    │         │
│                     │  • Checks if more pages exist               │         │
│                     └──────────────────┬──────────────────────────┘         │
│                                        │                                    │
│                                        ▼                                    │
│                                 ┌─────────────┐                             │
│                                 │  IF Node    │                             │
│                                 │ done=false? │                             │
│                                 └──────┬──────┘                             │
│                                        │                                    │
│                          ┌─────────────┴─────────────┐                      │
│                          │                           │                      │
│                        TRUE                        FALSE                    │
│                          │                           │                      │
│                          ▼                           ▼                      │
│                 ┌─────────────────┐      ┌─────────────────────┐           │
│                 │  HTTP Request1  │      │  Format Final       │           │
│                 │  (queryMore)    │      │  Response           │           │
│                 └────────┬────────┘      └──────────┬──────────┘           │
│                          │                          │                       │
│                          │ (loops back)             │                       │
│                          ▼                          ▼                       │
│              [Process & Check for More]    [Return to Extension]           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Pagination Loop Explained

Salesforce limits SOQL queries to **2000 records** per request. When more records exist, Salesforce returns:

```json
{
  "done": false,
  "nextRecordsUrl": "/services/data/v58.0/query/01gxx00000xxxxx-2000",
  "records": [...]
}
```

Our workflow **loops** until `done: true`:

```
Initial Query (records 1-2000)
        ↓
    done: false? → YES → Fetch More (records 2001-4000)
        ↓                        ↓
    done: false? → YES → Fetch More (records 4001-6000)
        ↓                        ↓
    done: true? → YES → Return ALL 6000 records
```

---

## 3. Node-by-Node Documentation

### 3.1 Node 1: Webhook (Trigger)

**Purpose:** Entry point that receives requests from the Chrome extension.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.webhook` |
| **HTTP Method** | `GET` |
| **Path** | `025534f6-dde0-4036-b4b9-ed76d284e1c2` |
| **Response Mode** | `When Last Node Finishes` |
| **Response Headers** | `Content-Type: application/json` |

**Expected Input:**
```
GET /webhook/025534f6-dde0-4036-b4b9-ed76d284e1c2?email=user@savvywealth.com
```

**Output:**
```json
{
  "query": {
    "email": "user@savvywealth.com"
  },
  "headers": {...},
  "params": {...}
}
```

---

### 3.2 Node 2: Build Initial Query (Code)

**Purpose:** Determines user role (Admin vs SGA) and constructs the appropriate SOQL query.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Mode** | `Run Once for All Items` |

**Complete Code:**

```javascript
// Get user email from webhook
const userEmail = $input.first().json.query.email;

// Admin list - add your admin emails here
const adminEmails = [
  'russell.moss@savvywealth.com',
  'jed.entin@savvywealth.com'
];
const isAdmin = adminEmails.includes(userEmail);

// Build the SOQL query
const selectFields = [
  'Id',
  'FirstName', 
  'LastName',
  'Company',
  'Title',
  'Savvy_Lead_Score__c',
  'LinkedIn_Profile_Apollo__c',
  'Status',
  'Prospecting_Step_LinkedIn__c',
  'Lead_List_Name__c',
  'SGA_Owner_Name__c',
  'Owner.Name'
].join(', ');

const baseWhere = "Prospecting_Step_LinkedIn__c = false AND Status IN ('New', 'Contacting') AND LinkedIn_Profile_Apollo__c != null";

let query;
if (isAdmin) {
  // Admin: Get ALL leads
  query = `SELECT ${selectFields} FROM Lead WHERE ${baseWhere} ORDER BY Lead_List_Name__c, Savvy_Lead_Score__c DESC NULLS LAST`;
} else {
  // SGA: Get only their leads
  query = `SELECT ${selectFields} FROM Lead WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '${userEmail}') AND ${baseWhere} ORDER BY Lead_List_Name__c, Savvy_Lead_Score__c DESC NULLS LAST`;
}

return [{
  json: {
    query: query,
    userEmail: userEmail,
    isAdmin: isAdmin,
    allRecords: [],
    nextRecordsUrl: null
  }
}];
```

**Logic Breakdown:**

| User Type | Query Filter | Result |
|-----------|--------------|--------|
| **Admin** | No owner filter | ALL leads matching criteria |
| **SGA** | `OwnerId IN (SELECT Id FROM User WHERE Email = '...')` | Only leads owned by that SGA |

**Base Filter Criteria (applies to ALL users):**
- `Prospecting_Step_LinkedIn__c = false` — Not yet contacted on LinkedIn
- `Status IN ('New', 'Contacting')` — Active leads only
- `LinkedIn_Profile_Apollo__c != null` — Must have LinkedIn URL

**Output:**
```json
{
  "query": "SELECT Id, FirstName, ... FROM Lead WHERE ...",
  "userEmail": "russell.moss@savvywealth.com",
  "isAdmin": true,
  "allRecords": [],
  "nextRecordsUrl": null
}
```

---

### 3.3 Node 3: HTTP Request (Initial Salesforce Query)

**Purpose:** Executes the initial SOQL query against Salesforce API.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.httpRequest` |
| **Method** | `GET` |
| **URL** | `https://savvywealth.my.salesforce.com/services/data/v58.0/query` |
| **Authentication** | `Salesforce OAuth2 API` (Predefined Credential) |
| **Query Parameter** | `q` = `{{ $json.query }}` |

**Salesforce Response (when more records exist):**
```json
{
  "totalSize": 5432,
  "done": false,
  "nextRecordsUrl": "/services/data/v58.0/query/01gxx00000xxxxx-2000",
  "records": [
    { "Id": "00Q...", "FirstName": "John", ... },
    { "Id": "00Q...", "FirstName": "Jane", ... },
    // ... up to 2000 records
  ]
}
```

**Salesforce Response (when complete):**
```json
{
  "totalSize": 1500,
  "done": true,
  "records": [...]
}
```

---

### 3.4 Node 4: Process & Check for More (Code)

**Purpose:** Accumulates records from each pagination loop and checks if more pages exist.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Mode** | `Run Once for All Items` |

**Complete Code:**

```javascript
// Get the Salesforce response
const response = $input.first().json;

// Get userEmail and isAdmin from the initial query node (persists across loop)
const initialData = $('Build Initial Query').first().json;
const userEmail = initialData.userEmail;
const isAdmin = initialData.isAdmin;

// Try to get previous accumulated records
let previousRecords = [];
try {
  const prevData = $('Process & Check for More').first().json;
  previousRecords = prevData.allRecords || [];
} catch (e) {
  // First run - no previous data yet
  previousRecords = [];
}

// Get new records from this API call
const newRecords = response.records || [];

// Merge all records
const allRecords = [...previousRecords, ...newRecords];

return [{
  json: {
    allRecords: allRecords,
    done: response.done,
    nextRecordsUrl: response.nextRecordsUrl || null,
    totalSize: response.totalSize,
    fetchedSoFar: allRecords.length,
    userEmail: userEmail,
    isAdmin: isAdmin
  }
}];
```

**Logic Breakdown:**

1. **Get Salesforce Response** — The HTTP request returns records + pagination info
2. **Get Initial Data** — Retrieves `userEmail` and `isAdmin` from the first code node
3. **Get Previous Records** — On subsequent loops, retrieves accumulated records from previous iteration
4. **Merge Records** — Combines previous + new records into one array
5. **Return State** — Passes `done`, `nextRecordsUrl`, and accumulated records to IF node

**Output:**
```json
{
  "allRecords": [{...}, {...}, ...],  // Growing array
  "done": false,                       // or true when complete
  "nextRecordsUrl": "/services/data/v58.0/query/01g...",
  "totalSize": 5432,
  "fetchedSoFar": 2000,               // Increases each loop
  "userEmail": "russell.moss@savvywealth.com",
  "isAdmin": true
}
```

---

### 3.5 Node 5: IF (Pagination Decision)

**Purpose:** Determines whether to fetch more records or proceed to final response.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.if` |
| **Condition** | `{{ $json.done }}` equals `{{ false }}` |
| **Type Validation** | `Loose` (handles boolean/string comparison) |

**Branching Logic:**

| Condition | Branch | Next Node |
|-----------|--------|-----------|
| `done === false` | **TRUE** | HTTP Request1 (Fetch More) |
| `done === true` | **FALSE** | Format Final Response |

---

### 3.6 Node 6: HTTP Request1 (Fetch More - queryMore)

**Purpose:** Fetches the next page of results using Salesforce's `queryMore` endpoint.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.httpRequest` |
| **Method** | `GET` |
| **URL** | `https://savvywealth.my.salesforce.com{{ $json.nextRecordsUrl }}` |
| **Authentication** | `Salesforce OAuth2 API` (Predefined Credential) |

**Example URL Generated:**
```
https://savvywealth.my.salesforce.com/services/data/v58.0/query/01gxx00000xxxxx-2000
```

**Connection:** Output loops back to **"Process & Check for More"** node.

---

### 3.7 Node 7: Format Final Response (Code)

**Purpose:** Formats the final response for the Chrome extension, including unique list extraction.

| Setting | Value |
|---------|-------|
| **Type** | `n8n-nodes-base.code` |
| **Mode** | `Run Once for All Items` |

**Complete Code:**

```javascript
const data = $input.first().json;
const allRecords = data.allRecords || [];

// Get unique list names for the frontend
const uniqueLists = [...new Set(allRecords.map(r => r.Lead_List_Name__c).filter(Boolean))].sort();

return [{
  json: {
    leads: allRecords,
    totalCount: allRecords.length,
    lists: uniqueLists,
    isAdmin: data.isAdmin,
    userEmail: data.userEmail
  }
}];
```

**Logic Breakdown:**

1. **Get All Records** — Retrieves the fully accumulated records array
2. **Extract Unique Lists** — Creates a deduplicated, sorted array of all `Lead_List_Name__c` values
3. **Format Response** — Structures the final JSON for the frontend

**Final Output:**
```json
{
  "leads": [
    {
      "Id": "00QVS00000Ebv5v2AB",
      "FirstName": "Aaron",
      "LastName": "Smith",
      "Company": "Smith Financial",
      "Title": "Financial Advisor",
      "Savvy_Lead_Score__c": 85.5,
      "LinkedIn_Profile_Apollo__c": "https://linkedin.com/in/aaronsmith",
      "Status": "New",
      "Prospecting_Step_LinkedIn__c": false,
      "Lead_List_Name__c": "2025-11 Lead List - Lead Scoringv3",
      "SGA_Owner_Name__c": "Helen Kamens",
      "Owner": { "Name": "Helen Kamens" }
    },
    // ... all other leads
  ],
  "totalCount": 5432,
  "lists": [
    "2025 Russell Test",
    "2025-11 Lead List - Lead Scoringv3",
    "2025-12 High AUM Independents",
    // ... all unique list names
  ],
  "isAdmin": true,
  "userEmail": "russell.moss@savvywealth.com"
}
```

---

## 4. Node Connections

```json
{
  "Webhook": → "Build Initial Query",
  "Build Initial Query": → "HTTP Request",
  "HTTP Request": → "Process & Check for More",
  "Process & Check for More": → "If",
  "If": {
    "TRUE (done=false)": → "HTTP Request1",
    "FALSE (done=true)": → "Format Final Response"
  },
  "HTTP Request1": → "Process & Check for More"  // LOOP
}
```

---

## 5. Data Schema

### 5.1 Lead Fields Retrieved

| Field | API Name | Type | Description |
|-------|----------|------|-------------|
| ID | `Id` | String | Salesforce Lead ID |
| First Name | `FirstName` | String | For personalization |
| Last Name | `LastName` | String | Display name |
| Company | `Company` | String | Firm name |
| Title | `Title` | String | Job title |
| Lead Score | `Savvy_Lead_Score__c` | Number | Sorting priority |
| LinkedIn URL | `LinkedIn_Profile_Apollo__c` | URL | Profile link |
| Status | `Status` | Picklist | New, Contacting, etc. |
| LinkedIn Step | `Prospecting_Step_LinkedIn__c` | Boolean | Already contacted? |
| List Name | `Lead_List_Name__c` | String | **For filtering** |
| SGA Owner | `SGA_Owner_Name__c` | String | Assigned SGA name |
| Owner | `Owner.Name` | String | Owner's display name |

### 5.2 Response Schema

```typescript
interface WebhookResponse {
  leads: SalesforceLead[];   // Array of all leads
  totalCount: number;        // Total number of leads
  lists: string[];           // Unique list names (sorted)
  isAdmin: boolean;          // Whether user is admin
  userEmail: string;         // Requesting user's email
}
```

---

## 6. Adding New Admins

To add a new admin user, edit the **"Build Initial Query"** code node:

```javascript
// Admin list - add your admin emails here
const adminEmails = [
  'russell.moss@savvywealth.com',
  'jed.entin@savvywealth.com',
  'new.admin@savvywealth.com'  // ← Add new admin here
];
```

---

## 7. Adding New Lead Fields

To include additional Salesforce fields:

### Step 1: Update "Build Initial Query"

Add the field to the `selectFields` array:

```javascript
const selectFields = [
  'Id',
  'FirstName', 
  'LastName',
  // ... existing fields
  'New_Field__c'  // ← Add new field here
].join(', ');
```

### Step 2: Update Chrome Extension Types

Update the TypeScript interface in the extension to include the new field.

---

## 8. Testing

### 8.1 Test URLs

**Production Webhook:**
```
https://russellmoss87.app.n8n.cloud/webhook/025534f6-dde0-4036-b4b9-ed76d284e1c2?email=russell.moss@savvywealth.com
```

**Test Webhook (for debugging):**
```
https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2?email=russell.moss@savvywealth.com
```

### 8.2 Expected Results

| User | Expected Behavior |
|------|-------------------|
| `russell.moss@savvywealth.com` | `isAdmin: true`, sees ALL leads |
| `jed.entin@savvywealth.com` | `isAdmin: true`, sees ALL leads |
| `helen.kamens@savvywealth.com` | `isAdmin: false`, sees only her leads |
| `unknown@other.com` | `isAdmin: false`, sees 0 leads (no Salesforce match) |

### 8.3 Verifying Pagination

Watch the n8n execution log. You should see:

1. **HTTP Request** → Returns 2000 records, `done: false`
2. **IF** → TRUE branch (more records)
3. **HTTP Request1** → Returns next 2000 records
4. **Loop repeats** until `done: true`
5. **Format Final Response** → Returns ALL accumulated records

---

## 9. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `{"leads":[],"totalCount":0}` | Missing `?email=` parameter | Add email to URL query string |
| `isAdmin: false` for admin | Email not in admin list | Add email to `adminEmails` array |
| Only 2000 leads returned | Pagination loop not working | Check IF node condition and connections |
| Missing lists in dropdown | `Lead_List_Name__c` is null | Check Salesforce data for that field |
| Error: "Cannot read property..." | Missing node reference | Ensure all node names match exactly |
| Timeout on large datasets | Too many records | Consider adding LIMIT or caching |

---

## 10. Performance Considerations

### 10.1 Expected Timing

| Lead Count | Approximate Time |
|------------|------------------|
| 0-2,000 | 2-5 seconds |
| 2,001-4,000 | 4-8 seconds |
| 4,001-10,000 | 8-20 seconds |
| 10,000+ | 20+ seconds |

### 10.2 Optimization Options

If performance becomes an issue:

1. **Add Caching** — Cache results for 5-15 minutes
2. **Add LIMIT** — Cap at 10,000 records
3. **Filter Earlier** — Add more WHERE conditions
4. **Lazy Load Lists** — Fetch lists separately from leads

---

## 11. Complete Workflow JSON

For backup/import purposes, the complete workflow JSON is available in:
`Salesforce_Leads.json`

To import:
1. Open n8n
2. Click "..." menu → "Import from File"
3. Select the JSON file
4. Update credentials if needed

---

## 12. Related Documentation

| Document | Description |
|----------|-------------|
| `Virtual_SGA_Command_Center_Blueprint_v5.md` | Full system architecture |
| `sga_velocity_sidebar_v3.1_hybrid.md` | Chrome extension documentation |
| `src/lib/api.ts` | Frontend API integration code |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2025 | Initial webhook with LIMIT 200 |
| 2.0 | Dec 2025 | Added pagination loop for unlimited records |

---

*This document is confidential and intended for internal use at Savvy Wealth only.*
