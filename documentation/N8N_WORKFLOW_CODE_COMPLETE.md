# Complete n8n Workflow Code - All Nodes

This document provides the complete code for all nodes in your n8n workflow, updated to include `SGA_Self_List_name__c` support.

---

## Node 1: Build Initial Query

**Node Type:** Code (JavaScript)

**Purpose:** Builds the SOQL query based on user email and admin status.

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
  'SGA_Self_List_name__c',  // ← ADDED: Support for SGA self-assigned lists
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

**Key Changes:**
- ✅ Added `'SGA_Self_List_name__c'` to the `selectFields` array

---

## Node 2: Process & Check for More

**Node Type:** Code (JavaScript)

**Purpose:** Processes Salesforce API responses, accumulates records, and handles pagination.

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
    userEmail: userEmail,      // ← Persist for final node
    isAdmin: isAdmin           // ← Persist for final node
  }
}];
```

**Key Changes:**
- ✅ No changes needed - this node just accumulates records
- ✅ The `SGA_Self_List_name__c` field will be included automatically in the records from Salesforce

---

## Node 3: Process Final Response

**Node Type:** Code (JavaScript)

**Purpose:** Processes all accumulated records and extracts unique list names from both `Lead_List_Name__c` and `SGA_Self_List_name__c`.

**Complete Code:**

```javascript
const data = $input.first().json;
const allRecords = data.allRecords || [];

// Get unique list names from BOTH Lead_List_Name__c and SGA_Self_List_name__c
// This ensures the extension dropdown shows all available lists
const listNamesFromLeadList = allRecords
  .map(r => r.Lead_List_Name__c)
  .filter(Boolean); // Remove null/undefined

const listNamesFromSGAList = allRecords
  .map(r => r.SGA_Self_List_name__c)
  .filter(Boolean); // Remove null/undefined

// Combine both arrays and get unique values
const allListNames = [...new Set([...listNamesFromLeadList, ...listNamesFromSGAList])].sort();

return [{
  json: {
    leads: allRecords,
    totalCount: allRecords.length,
    lists: allListNames,  // ← Updated: Now includes lists from both fields
    isAdmin: data.isAdmin,
    userEmail: data.userEmail
  }
}];
```

**Key Changes:**
- ✅ Extracts unique list names from both `Lead_List_Name__c` and `SGA_Self_List_name__c`
- ✅ Combines both arrays and removes duplicates
- ✅ Returns sorted list of all unique list names

---

## Alternative: Single-Step Extraction (Simpler)

If you prefer a more concise version for Node 3:

```javascript
const data = $input.first().json;
const allRecords = data.allRecords || [];

// Get unique list names from BOTH fields in one pass
const uniqueLists = new Set();
allRecords.forEach(record => {
  if (record.Lead_List_Name__c) {
    uniqueLists.add(record.Lead_List_Name__c);
  }
  if (record.SGA_Self_List_name__c) {
    uniqueLists.add(record.SGA_Self_List_name__c);
  }
});

const sortedLists = Array.from(uniqueLists).sort();

return [{
  json: {
    leads: allRecords,
    totalCount: allRecords.length,
    lists: sortedLists,
    isAdmin: data.isAdmin,
    userEmail: data.userEmail
  }
}];
```

---

## Summary of Changes

### ✅ Node 1: Build Initial Query
- **Change:** Added `'SGA_Self_List_name__c'` to `selectFields` array
- **Why:** So Salesforce returns this field in the query results

### ✅ Node 2: Process & Check for More
- **Change:** None needed
- **Why:** This node just accumulates records - the field is already included from Node 1

### ✅ Node 3: Process Final Response
- **Change:** Extract unique lists from both `Lead_List_Name__c` AND `SGA_Self_List_name__c`
- **Why:** So the extension dropdown shows all available lists from both fields

---

## Testing

After updating your n8n workflow:

1. **Test with a lead that has `Lead_List_Name__c` set:**
   - Should appear in the dropdown
   - Should filter correctly when selected

2. **Test with a lead that has `SGA_Self_List_name__c` set:**
   - Should appear in the dropdown
   - Should filter correctly when selected

3. **Test with a lead that has both fields set:**
   - Both list names should appear in the dropdown
   - Selecting either list should show the lead

4. **Test with a lead that has neither field set:**
   - Should not appear in any list filter (only shows in "All Lists")

---

## Expected Response Format

After all nodes execute, the final response should look like:

```json
{
  "leads": [
    {
      "Id": "00Q5g00000ABC123",
      "FirstName": "John",
      "LastName": "Smith",
      "Company": "Acme Wealth",
      "Title": "Financial Advisor",
      "Savvy_Lead_Score__c": 85,
      "LinkedIn_Profile_Apollo__c": "https://linkedin.com/in/johnsmith",
      "Status": "New",
      "Prospecting_Step_LinkedIn__c": false,
      "Lead_List_Name__c": "Q1 2025 Prospects",
      "SGA_Self_List_name__c": "My Personal List",  // ← New field
      "SGA_Owner_Name__c": "Jane Doe",
      "Owner": {
        "Name": "Jane Doe"
      }
    }
  ],
  "totalCount": 1,
  "lists": [
    "My Personal List",      // ← From SGA_Self_List_name__c
    "Q1 2025 Prospects"       // ← From Lead_List_Name__c
  ],
  "isAdmin": false,
  "userEmail": "sga@savvywealth.com"
}
```

---

## Notes

- The extension will automatically handle leads with either field populated
- The list filter dropdown will show unique lists from both fields
- When filtering, leads match if EITHER field matches the selected list name
- Both fields can be `null` - those leads will only appear in "All Lists" view

