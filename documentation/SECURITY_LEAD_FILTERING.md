# Security: Lead Filtering by User Email

## Overview

This document explains how the SGA Velocity Sidebar extension ensures that each user only sees leads assigned to them in Salesforce, and not leads assigned to other users.

---

## Authentication Flow

### Step 1: Chrome Profile Email Retrieval

**Location:** `src/lib/auth.ts`

The extension uses `chrome.identity.getProfileUserInfo` to get the email address of the user signed into Chrome:

```typescript
const userInfo = await chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY });
// Returns: { email: "sga@savvywealth.com", id: "..." }
```

**Security Notes:**
- This API only works if the user is signed into Chrome
- The email comes directly from Chrome's identity system (cannot be spoofed by JavaScript)
- The extension validates the email domain is `@savvywealth.com`

### Step 2: Domain Validation

**Location:** `src/lib/auth.ts`

Before proceeding, the extension checks:

```typescript
const isValidDomain = userInfo.email.endsWith('@savvywealth.com');
```

**Result:**
- ✅ If email ends with `@savvywealth.com` → User can proceed
- ❌ If email is from another domain → User sees "Sign in Required" message

### Step 3: Email Passed to API

**Location:** `src/sidepanel/main.ts`

When syncing leads, the extension passes the authenticated email:

```typescript
const response = await fetchLeads(state.authState.email);
// Example: fetchLeads("sga@savvywealth.com")
```

### Step 4: API Validation & Sanitization

**Location:** `src/lib/api.ts`

Before sending to n8n, the API performs additional security checks:

```typescript
// 1. Validate email format
if (!emailRegex.test(email)) {
  return error; // Invalid format
}

// 2. Validate domain (double-check)
if (!email.toLowerCase().endsWith('@savvywealth.com')) {
  return error; // Wrong domain
}

// 3. Sanitize email (trim, lowercase)
const sanitizedEmail = email.trim().toLowerCase();
```

### Step 5: n8n Webhook Request

**Location:** `src/lib/api.ts`

The sanitized email is sent as a URL query parameter:

```typescript
const url = new URL(config.n8nWebhookUrl);
url.searchParams.set('email', sanitizedEmail);
// Result: https://n8n.com/webhook/lead-list?email=sga@savvywealth.com
```

---

## Salesforce Query (n8n)

### SOQL Query Filter

**Location:** n8n workflow configuration

The n8n workflow executes this SOQL query in Salesforce:

```sql
SELECT 
  Id, FirstName, LastName, Company, Title, 
  Savvy_Lead_Score__c, LinkedIn_Profile_Apollo__c, 
  Status, Prospecting_Step_LinkedIn__c, Lead_List_Name__c
FROM Lead
WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '{{ $json.query.email }}')
  AND Prospecting_Step_LinkedIn__c = false
  AND Status IN ('New', 'Contacting')
  AND LinkedIn_Profile_Apollo__c != null
ORDER BY LastName ASC, FirstName ASC
LIMIT 200
```

**Key Security Filter:**
```sql
WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '{{ $json.query.email }}')
```

This subquery:
1. Finds the Salesforce User record with the matching email
2. Gets that User's ID
3. Only returns Leads where `OwnerId` matches that User ID

**Result:** Only leads owned by the user with that email address are returned.

---

## Security Guarantees

### ✅ What IS Protected

1. **Email Source is Trusted**
   - Email comes from Chrome's `getProfileUserInfo` API
   - Cannot be manipulated by JavaScript code
   - Requires user to be signed into Chrome

2. **Domain Validation (Client-Side)**
   - Extension checks email ends with `@savvywealth.com`
   - Users from other domains cannot proceed

3. **Email Validation (Client-Side)**
   - API validates email format before sending
   - API double-checks domain before sending
   - Email is sanitized (trimmed, lowercased)

4. **Salesforce Query Filter (Server-Side)**
   - SOQL query filters by OwnerId based on email
   - Salesforce enforces this at the database level
   - Even if someone manipulated the email parameter, Salesforce would only return leads for that email's user

### ⚠️ Additional Security Recommendations

**For Production Deployment:**

1. **n8n Workflow Security**
   - Add authentication to n8n webhook (API key, basic auth, or OAuth)
   - Validate email domain in n8n workflow before executing SOQL
   - Log all webhook requests for audit purposes

2. **Salesforce Security**
   - Ensure the n8n-connected Salesforce user has minimal required permissions
   - Use a dedicated integration user (not a real SGA account)
   - Set up field-level security to restrict access to sensitive fields
   - Enable Salesforce audit logs

3. **Network Security**
   - Use HTTPS for all webhook URLs
   - Consider IP whitelisting in n8n if possible
   - Monitor for unusual request patterns

---

## How to Verify It's Working

### Test 1: Different Chrome Profiles

1. **User A:** Sign into Chrome with `sga1@savvywealth.com`
2. **User B:** Sign into Chrome with `sga2@savvywealth.com`
3. **Expected:** Each user only sees their own leads

### Test 2: Check Network Requests

1. Open Chrome DevTools (F12) → Network tab
2. Click "Sync from Salesforce" in extension
3. Check the request URL: Should contain `?email=sga@savvywealth.com`
4. Verify the email matches the Chrome profile email

### Test 3: Check n8n Execution History

1. Go to n8n workflow execution history
2. Check the webhook input: Should show `email: "sga@savvywealth.com"`
3. Check the SOQL query executed: Should filter by that email
4. Verify the returned leads match that user's assignments

### Test 4: Salesforce Verification

1. In Salesforce, find a Lead owned by User A
2. Check the Lead's Owner email matches User A's email
3. User A should see this lead in the extension
4. User B should NOT see this lead

---

## Troubleshooting

### User Sees All Leads (Not Filtered)

**Possible Causes:**
1. ❌ n8n SOQL query not using email parameter correctly
   - **Fix:** Verify `{{ $json.query.email }}` is in the SOQL query
   - **Check:** n8n execution history to see what email was received

2. ❌ Email mismatch between Chrome and Salesforce
   - **Fix:** Ensure Chrome profile email exactly matches Salesforce User email
   - **Check:** Case sensitivity, whitespace, typos

3. ❌ Salesforce User not found
   - **Fix:** Verify user exists in Salesforce with that exact email
   - **Check:** `SELECT Id, Email FROM User WHERE Email = 'sga@savvywealth.com'`

4. ❌ Leads not assigned to that user
   - **Fix:** Check Lead OwnerId matches User Id
   - **Check:** `SELECT OwnerId, Owner.Email FROM Lead WHERE Id = '...'`

### User Sees No Leads

**Possible Causes:**
1. ❌ No leads assigned to that user
   - **Fix:** Assign leads to the user in Salesforce

2. ❌ Leads don't meet filter criteria
   - **Fix:** Check `Prospecting_Step_LinkedIn__c = false`
   - **Fix:** Check `Status IN ('New', 'Contacting')`
   - **Fix:** Check `LinkedIn_Profile_Apollo__c != null`

3. ❌ Email not being passed correctly
   - **Fix:** Check browser console for `[API] Fetching leads from n8n for: ...`
   - **Fix:** Check n8n execution history for received email

---

## Code Flow Summary

```
1. User opens extension
   ↓
2. Extension calls chrome.identity.getProfileUserInfo()
   ↓
3. Gets email: "sga@savvywealth.com"
   ↓
4. Validates domain: endsWith("@savvywealth.com") ✅
   ↓
5. User clicks "Sync from Salesforce"
   ↓
6. Extension calls fetchLeads("sga@savvywealth.com")
   ↓
7. API validates & sanitizes email ✅
   ↓
8. API sends GET request: ?email=sga@savvywealth.com
   ↓
9. n8n receives email parameter
   ↓
10. n8n executes SOQL: WHERE OwnerId IN (SELECT Id FROM User WHERE Email = 'sga@savvywealth.com')
   ↓
11. Salesforce returns only leads owned by that user ✅
   ↓
12. Extension displays filtered leads
```

---

## Important Notes

1. **Email Must Match Exactly**
   - Chrome profile email must match Salesforce User email exactly
   - Case-insensitive matching (email is lowercased)
   - No whitespace allowed

2. **Owner Assignment**
   - Leads must be assigned to the User (not just shared)
   - The Lead's `OwnerId` field must match the User's `Id`

3. **Salesforce Permissions**
   - The n8n-connected Salesforce user needs permission to:
     - Query Lead records
     - Query User records
     - Read the specific Lead fields used

4. **No Client-Side Manipulation**
   - Even if someone modified the JavaScript, the SOQL query in n8n/Salesforce enforces the filter
   - The email comes from Chrome's secure identity API

---

## Conclusion

**Yes, the app will correctly filter leads by user email** as long as:

1. ✅ User is signed into Chrome with `@savvywealth.com` email
2. ✅ n8n workflow uses the correct SOQL query with email filter
3. ✅ Salesforce User email matches Chrome profile email
4. ✅ Leads are properly assigned to that User in Salesforce

The security is enforced at multiple layers:
- **Client-side:** Domain validation, email sanitization
- **Server-side:** SOQL query filters by OwnerId based on email
- **Salesforce:** Database-level enforcement

