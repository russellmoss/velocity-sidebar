# n8n Complete Setup Guide
## Both Workflows: Lead List & Message Sent Logging

This guide walks you through setting up **both** n8n workflows needed for the SGA Velocity Sidebar extension:
1. **Lead List Workflow** - Fetches leads from Salesforce (GET webhook)
2. **Message Sent Logging Workflow** - Updates Salesforce when a message is sent (POST webhook)

---

## Overview

### Workflow 1: Lead List (GET)
**Purpose:** Fetch leads from Salesforce to display in the extension

**Flow:**
1. Extension sends GET request: `?email=sga@savvywealth.com`
2. n8n queries Salesforce for leads owned by that SGA
3. Returns JSON array of Lead records

### Workflow 2: Message Sent Logging (POST)
**Purpose:** Update Salesforce Lead when user marks message as sent

**Flow:**
1. Extension sends POST request with activity data
2. n8n updates Salesforce Lead record
3. Sets `Prospecting_Step_LinkedIn__c = TRUE` (checkbox checked)

---

## Part 1: Lead List Workflow (GET)

### Step 1: Create New n8n Workflow

1. **Log into n8n**
   - Go to your n8n instance (e.g., `https://your-n8n-instance.com`)
   - Log in with your credentials

2. **Create New Workflow**
   - Click "Workflows" in the left sidebar
   - Click "+ Add workflow" or the "+" button
   - Name it: **"SGA Velocity - Lead List"**

### Step 2: Add Webhook Node

1. **Add Webhook Node**
   - Click the "+" button to add a node
   - Search for "Webhook"
   - Select "Webhook" node

2. **Configure Webhook**
   - **HTTP Method**: Select `GET`
   - **Path**: Enter `/lead-list` (or any path you prefer)
   - **Response Mode**: Select "Last Node" (we'll return data from the last node)
   - **Options**:
     - ✅ Enable "Respond to Webhook" (if available)
   
3. **Get Webhook URL**
   - After saving, n8n will show you the webhook URL
   - Copy this URL - it will look like:
     ```
     https://your-n8n-instance.com/webhook/lead-list
     ```
   - **Save this URL** - you'll need it for the extension settings (as "Lead List Workflow URL")

### Step 3: Add Salesforce Node

1. **Add Salesforce Node**
   - Click "+" after the Webhook node
   - Search for "Salesforce"
   - Select "Salesforce" node

2. **Configure Salesforce Connection**
   - If you haven't connected Salesforce before:
     - Click "Create New Credential"
     - Enter your Salesforce credentials:
       - **Environment**: Production or Sandbox
       - **Domain**: Your Salesforce domain (e.g., `yourcompany.salesforce.com`)
       - **Access Token**: Or use OAuth2 flow
     - Click "Save" to create the credential
   - If you have an existing connection: Select it from the dropdown

3. **Configure Query**
   - **Resource**: Select `Lead`
   - **Operation**: Select `Query` (or "Search" if available)
   - **Query**: Enter this SOQL query:
     ```sql
     SELECT 
       Id, 
       FirstName, 
       LastName, 
       Company, 
       Title, 
       Savvy_Lead_Score__c,
       LinkedIn_Profile_Apollo__c, 
       Status, 
       Prospecting_Step_LinkedIn__c,
       Lead_List_Name__c,
       SGA_Self_List_name__c
     FROM Lead
     WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '{{ $json.query.email }}')
       AND Prospecting_Step_LinkedIn__c = false
       AND Status IN ('New', 'Contacting')
       AND LinkedIn_Profile_Apollo__c != null
     ORDER BY LastName ASC, FirstName ASC
     LIMIT 200
     ```
   
   **Important Notes:**
   - `{{ $json.query.email }}` gets the email from the webhook query parameter
   - Adjust the `Status` values if your Salesforce uses different status names
   - Adjust the `LIMIT` if you need more/fewer leads
   - The query includes both `Lead_List_Name__c` and `SGA_Self_List_name__c` for list filtering
   - The extension will show leads from either list field in the filter dropdown

### Step 4: Connect Nodes

1. **Link Webhook to Salesforce**
   - Drag from the Webhook node output to the Salesforce node input
   - The connection should show a line between them

### Step 5: Test the Workflow

1. **Activate Workflow**
   - Click the "Active" toggle in the top-right to activate the workflow
   - n8n will show the webhook URL again - copy it

2. **Test in Browser**
   - Open a new browser tab
   - Navigate to: `https://your-n8n-instance.com/webhook/lead-list?email=your-email@savvywealth.com`
   - Replace `your-email@savvywealth.com` with an actual SGA email
   - You should see JSON data with Lead records

3. **Verify Response Format**
   - The response should be a JSON array like:
     ```json
     [
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
         "SGA_Self_List_name__c": null
       },
       ...
     ]
     ```

---

## Part 2: Message Sent Logging Workflow (POST)

### Step 1: Create New n8n Workflow

1. **Create Another Workflow**
   - Click "Workflows" in the left sidebar
   - Click "+ Add workflow" or the "+" button
   - Name it: **"SGA Velocity - Message Sent Logging"**

### Step 2: Add Webhook Node

1. **Add Webhook Node**
   - Click the "+" button to add a node
   - Search for "Webhook"
   - Select "Webhook" node

2. **Configure Webhook**
   - **HTTP Method**: Select `POST`
   - **Path**: Enter `/message-sent` (or any path you prefer)
   - **Response Mode**: Select "Last Node"
   - **Options**:
     - ✅ Enable "Respond to Webhook" (if available)
   
3. **Get Webhook URL**
   - After saving, n8n will show you the webhook URL
   - Copy this URL - it will look like:
     ```
     https://your-n8n-instance.com/webhook/message-sent
     ```
   - **Save this URL** - you'll need it for the extension settings (as "Message Sent Logging URL")

### Step 3: Add Salesforce Node

1. **Add Salesforce Node**
   - Click "+" after the Webhook node
   - Search for "Salesforce"
   - Select "Salesforce" node

2. **Configure Salesforce Connection**
   - Use the same Salesforce connection from Workflow 1, or create a new one
   - Select your Salesforce account from the dropdown

3. **Configure Update Record**
   - **Resource**: Select `Lead`
   - **Operation**: Select `Update` (or "Update Record")
   
   **Record ID:**
   - Click in the "Record ID" field
   - In the dropdown, select: `{{ $json.body.leadId }}`
   - Or manually type: `{{ $json.body.leadId }}`
   - This gets the `leadId` from the POST request body

   **Fields to Update:**
   - Click "Show all fields" or search for: `Prospecting_Step_LinkedIn__c`
   - Find the field **"Prospecting_Step_LinkedIn__c"** (or "Prospecting Step LinkedIn")
   - Click in the field
   - Set the value to: **`True`** (boolean/checkbox)
     - You can either:
       - Select "True" from a dropdown if available
       - Type `True` (boolean)
       - Or use: `{{ $json.body.Prospecting_Step_LinkedIn__c }}` if you want to pass it (but we're setting it to True)

   **Important:** Make sure you're setting it to `True` (boolean), not the string `"True"`

4. **Optional: Map Additional Fields**
   - You can map other fields if you want to log additional data:
     - `sgaEmail` → Any custom field (e.g., `SGA_Email__c`)
     - `timestamp` → Any date field
     - `action` → Any text field
   - For now, we only need `Prospecting_Step_LinkedIn__c = True`

### Step 4: Connect Nodes

1. **Link Webhook to Salesforce**
   - Drag from the Webhook node output to the Salesforce node input
   - The connection should show a line between them

### Step 5: Test the Workflow

1. **Activate Workflow**
   - Click the "Active" toggle in the top-right to activate the workflow
   - n8n will show the webhook URL again - copy it

2. **Test with Postman or curl**
   - Send a POST request to your webhook URL:
     ```bash
     curl -X POST https://your-n8n-instance.com/webhook/message-sent \
       -H "Content-Type: application/json" \
       -d '{
         "leadId": "00Q5g00000ABC123",
         "sgaEmail": "test@savvywealth.com",
         "timestamp": "2025-12-19T10:30:00.000Z",
         "action": "linkedin_sent"
       }'
     ```
   - Replace `00Q5g00000ABC123` with a real Lead ID from Salesforce

3. **Verify in Salesforce**
   - Go to Salesforce
   - Find the Lead that was updated (using the Lead ID)
   - Verify that **`Prospecting_Step_LinkedIn__c`** checkbox is now **checked (TRUE)**

4. **Check n8n Execution**
   - Go to n8n workflow execution history
   - Verify the workflow ran successfully
   - Check for any errors

---

## Part 3: Add URLs to Extension

### Step 1: Open Extension Settings

1. **Open Extension**
   - Open the SGA Velocity Sidebar extension
   - Click the **gear icon (⚙️)** in the bottom-right corner

### Step 2: Enter Workflow URLs

1. **Lead List Workflow URL**
   - Find the **"Lead List Workflow URL"** field
   - Paste your Lead List webhook URL:
     ```
     https://your-n8n-instance.com/webhook/lead-list
     ```
   - Click **"Test Connection"** button
   - Should see **"Lead list connection OK"** message

2. **Message Sent Logging URL**
   - Find the **"Message Sent Logging URL"** field
   - Paste your Message Sent Logging webhook URL:
     ```
     https://your-n8n-instance.com/webhook/message-sent
     ```
   - Click **"Test Connection"** button
   - Should see **"Message logging connection OK"** message
   - **Note**: This sends a test payload - you might see a test record updated in Salesforce (you can ignore it)

### Step 3: Save Settings

1. **Save**
   - Click **"Save Settings"** button
   - The extension is now configured!

---

## Part 4: Testing the Full Flow

### Test Lead List Workflow

1. **Sync Leads**
   - Click "Sync from Salesforce" in the extension
   - Wait for leads to load
   - Verify leads appear in the extension

2. **Check n8n Execution**
   - Go to n8n workflow execution history for "Lead List" workflow
   - Verify it ran successfully
   - Check the response data

### Test Message Sent Logging Workflow

1. **Mark a Lead as Sent**
   - Select a lead in the extension
   - Click the **"✓ Sent"** button
   - You should see "Marked as sent!" toast message

2. **Verify in Salesforce**
   - Go to Salesforce
   - Find the Lead you just marked
   - Check that **`Prospecting_Step_LinkedIn__c`** is now **TRUE** (checkbox checked)

3. **Check n8n Execution**
   - Go to n8n workflow execution history for "Message Sent Logging" workflow
   - Verify it ran successfully
   - Check for any errors

---

## Part 5: Data Format Reference

### Lead List Workflow (GET)

**Request:**
```
GET https://your-n8n-instance.com/webhook/lead-list?email=sga@savvywealth.com
```

**Response:**
```json
[
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
    "SGA_Self_List_name__c": null
  }
]
```

### Message Sent Logging Workflow (POST)

**Request:**
```json
POST https://your-n8n-instance.com/webhook/message-sent
Content-Type: application/json

{
  "leadId": "00Q5g00000ABC123",
  "sgaEmail": "sga@savvywealth.com",
  "timestamp": "2025-12-19T10:30:00.000Z",
  "action": "linkedin_sent"
}
```

**n8n Receives:**
- Field: `leadId` → Access as `{{ $json.body.leadId }}`
- Field: `sgaEmail` → Access as `{{ $json.body.sgaEmail }}`
- Field: `timestamp` → Access as `{{ $json.body.timestamp }}`
- Field: `action` → Access as `{{ $json.body.action }}`

**Salesforce Update:**
- **Object**: Lead
- **Record ID**: `{{ $json.body.leadId }}`
- **Field**: `Prospecting_Step_LinkedIn__c`
- **Value**: `True` (boolean)

---

## Part 6: Troubleshooting

### Lead List Workflow Issues

**No leads returned:**
- ✅ Check the SOQL query syntax
- ✅ Verify the email parameter is being passed correctly (`{{ $json.query.email }}`)
- ✅ Check Salesforce permissions for the connected user
- ✅ Verify leads exist with the specified criteria
- ✅ Check that the workflow is **Active**

**Webhook not responding:**
- ✅ Make sure the workflow is **Active** (toggle in top-right)
- ✅ Check the webhook path matches your URL
- ✅ Verify n8n instance is accessible
- ✅ Check n8n execution history for errors

**Wrong data format:**
- ✅ Ensure Salesforce node returns raw query results
- ✅ Check that the response is a JSON array, not wrapped in an object
- ✅ Verify all required fields are in the SELECT statement

### Message Sent Logging Workflow Issues

**Webhook not receiving data:**
- ✅ Verify the webhook URL is correct in extension settings
- ✅ Check that the workflow is **Active** (toggle in top-right)
- ✅ Look at n8n's execution history to see incoming requests
- ✅ Check browser console for errors (F12 → Console)

**Salesforce update fails:**
- ✅ Verify the `leadId` field mapping is correct in n8n
  - Should be: `{{ $json.body.leadId }}`
- ✅ Check Salesforce permissions for the connected account
- ✅ Ensure the Lead ID format is correct (18 characters, starts with `00Q`)
- ✅ Verify `Prospecting_Step_LinkedIn__c` field exists in Salesforce
  - Go to Setup → Object Manager → Lead → Fields & Relationships
  - Search for "Prospecting Step LinkedIn"
- ✅ Check field-level security permissions
- ✅ Verify the field is a **Checkbox** type (not Text)

**Field Not Found Error:**
- ✅ Check the exact field API name in Salesforce
  - Go to: Setup → Object Manager → Lead → Fields & Relationships
  - Find the field and check the "Field Name" (API Name)
  - It should be exactly: `Prospecting_Step_LinkedIn__c`
- ✅ Make sure you're using the API name, not the label
- ✅ Verify the field is accessible to the n8n-connected user

**Test connection fails:**
- ✅ Verify the webhook URL is correct (no extra spaces)
- ✅ Check that the workflow is active (Turned On)
- ✅ Try the webhook URL in a browser (should show n8n test page for GET, or error for POST)
- ✅ Check n8n's execution history for the test request
- ✅ Verify CORS/network issues aren't blocking the request

---

## Quick Checklist

### Lead List Workflow
- [ ] Created n8n workflow "SGA Velocity - Lead List"
- [ ] Set up Webhook node (GET method, path: `/lead-list`)
- [ ] Set up Salesforce node (Query operation)
- [ ] Configured SOQL query with email parameter
- [ ] Connected nodes
- [ ] Activated workflow
- [ ] Tested in browser with real email
- [ ] Verified JSON array response
- [ ] Added URL to extension as "Lead List Workflow URL"
- [ ] Tested connection from extension

### Message Sent Logging Workflow
- [ ] Created n8n workflow "SGA Velocity - Message Sent Logging"
- [ ] Set up Webhook node (POST method, path: `/message-sent`)
- [ ] Set up Salesforce node (Update operation)
- [ ] Configured Record ID: `{{ $json.body.leadId }}`
- [ ] Configured Field: `Prospecting_Step_LinkedIn__c = True`
- [ ] Connected nodes
- [ ] Activated workflow
- [ ] Tested with Postman/curl with real Lead ID
- [ ] Verified update in Salesforce
- [ ] Added URL to extension as "Message Sent Logging URL"
- [ ] Tested connection from extension
- [ ] Tested marking a lead as sent
- [ ] Verified update in Salesforce

---

## Security Notes

- **Webhook URLs are secret** - don't share them publicly
- Consider adding authentication to n8n webhooks if available
- Restrict access to specific IPs if possible
- Monitor webhook usage in n8n dashboard
- Regularly check for unauthorized updates in Salesforce
- Validate input data in n8n workflows (email format, Lead ID format)

---

## Next Steps

After setup is complete:
1. Test both workflows with real data
2. Monitor n8n execution history for any errors
3. Check Salesforce to verify updates are happening
4. If issues arise, check the Troubleshooting section above

For additional help:
- Check n8n workflow execution history for error details
- Review Salesforce field permissions
- Check extension console logs (F12 → Console)
- Review n8n node configuration

---

## Alternative: Using HTTP Request Node (If Salesforce Node Not Available)

If the Salesforce node is not available in your n8n instance, you can use the HTTP Request node to directly call the Salesforce REST API.

### For Lead List Workflow:

1. **Replace Salesforce Node with HTTP Request Node**
   - Add "HTTP Request" node
   - **Method**: GET
   - **URL**: `https://your-instance.salesforce.com/services/data/v57.0/query/`
   - **Authentication**: OAuth2 or Basic Auth
   - **Query Parameters**:
     - `q`: Your SOQL query (URL encoded)

### For Message Sent Logging Workflow:

1. **Replace Salesforce Node with HTTP Request Node**
   - Add "HTTP Request" node
   - **Method**: PATCH
   - **URL**: `https://your-instance.salesforce.com/services/data/v57.0/sobjects/Lead/{{ $json.body.leadId }}`
   - **Authentication**: OAuth2 or Basic Auth
   - **Headers**:
     - `Content-Type`: `application/json`
   - **Body**:
     ```json
     {
       "Prospecting_Step_LinkedIn__c": true
     }
     ```

See `N8N_SALESFORCE_ALTERNATIVE.md` for more detailed instructions.

