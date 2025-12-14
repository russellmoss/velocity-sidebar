# Webhook Setup Guide - n8n & Zapier

This guide walks you through setting up the n8n webhook (for fetching leads) and Zapier webhook (for logging activity) for the SGA Velocity Sidebar extension.

---

## Part 1: n8n Webhook Setup (Fetching Leads from Salesforce)

### Overview
The n8n workflow will:
1. Receive a GET request with `?email=sga@savvywealth.com`
2. Query Salesforce for leads owned by that SGA
3. Return a JSON array of Lead records

### Step-by-Step Setup

#### Step 1: Create New n8n Workflow

1. **Log into n8n**
   - Go to your n8n instance (e.g., `https://your-n8n-instance.com`)
   - Log in with your credentials

2. **Create New Workflow**
   - Click "Workflows" in the left sidebar
   - Click "+ Add workflow" or the "+" button
   - Name it: "SGA Velocity - Fetch Leads"

#### Step 2: Add Webhook Node

1. **Add Webhook Node**
   - Click the "+" button to add a node
   - Search for "Webhook"
   - Select "Webhook" node

2. **Configure Webhook**
   - **HTTP Method**: Select `GET`
   - **Path**: Enter `/sga-leads` (or any path you prefer)
   - **Response Mode**: Select "Last Node" (we'll return data from the last node)
   - **Options**:
     - ✅ Enable "Respond to Webhook" (if available)
   
3. **Get Webhook URL**
   - After saving, n8n will show you the webhook URL
   - Copy this URL - it will look like:
     ```
     https://your-n8n-instance.com/webhook/sga-leads
     ```
   - **Save this URL** - you'll need it for the extension settings

#### Step 3: Add Salesforce Node

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
   - **Operation**: Select `Query`
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
       Prospecting_Step_LinkedIn__c
     FROM Lead
     WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '{{ $json.query.email }}')
       AND Prospecting_Step_LinkedIn__c = false
       AND Status IN ('New', 'Contacting')
       AND LinkedIn_Profile_Apollo__c != null
     ORDER BY Savvy_Lead_Score__c DESC NULLS LAST
     LIMIT 200
     ```
   
   **Important Notes:**
   - `{{ $json.query.email }}` gets the email from the webhook query parameter
   - Adjust the `Status` values if your Salesforce uses different status names
   - Adjust the `LIMIT` if you need more/fewer leads

#### Step 4: Connect Nodes

1. **Link Webhook to Salesforce**
   - Drag from the Webhook node output to the Salesforce node input
   - The connection should show a line between them

#### Step 5: Test the Workflow

1. **Activate Workflow**
   - Click the "Active" toggle in the top-right to activate the workflow
   - n8n will show the webhook URL again - copy it

2. **Test in Browser**
   - Open a new browser tab
   - Navigate to: `https://your-n8n-instance.com/webhook/sga-leads?email=your-email@savvywealth.com`
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
         "Prospecting_Step_LinkedIn__c": false
       },
       ...
     ]
     ```

#### Step 6: Add to Extension

1. **Open Extension Settings**
   - Open the SGA Velocity Sidebar extension
   - Click the gear icon (⚙️) in the bottom-right

2. **Enter n8n Webhook URL**
   - Paste your n8n webhook URL into "n8n Webhook URL" field
   - Example: `https://your-n8n-instance.com/webhook/sga-leads`

3. **Test Connection**
   - Click "Test Connection" button
   - Should see "n8n connection OK" message

4. **Save Settings**
   - Click "Save Settings"

---

## Part 2: Zapier Webhook Setup (Logging Activity to Salesforce)

### Overview
The Zapier workflow will:
1. Receive a POST request with activity data
2. Update the Salesforce Lead's `Prospecting_Step_LinkedIn__c` field to `TRUE`

### Step-by-Step Setup

#### Step 1: Create New Zap

1. **Log into Zapier**
   - Go to `https://zapier.com`
   - Log in with your account

2. **Create New Zap**
   - Click "Create Zap" button (top-left)
   - Name it: "SGA Velocity - Log LinkedIn Activity"

#### Step 2: Set Up Trigger (Webhook)

1. **Choose Trigger**
   - Search for "Webhooks by Zapier"
   - Select "Webhooks by Zapier"

2. **Choose Event**
   - Select "Catch Hook"
   - Click "Continue"

3. **Get Webhook URL**
   - Zapier will generate a webhook URL
   - It will look like:
     ```
     https://hooks.zapier.com/hooks/catch/1234567/abcdefg/
     ```
   - **Copy this URL immediately** - you'll need it for the extension
   - Click "Continue"

4. **Test the Webhook**
   - Zapier will show you a test page
   - You can send a test POST request, or skip for now
   - Click "Continue"

#### Step 3: Set Up Action (Salesforce)

1. **Choose Action**
   - Search for "Salesforce"
   - Select "Salesforce"

2. **Choose Event**
   - Select "Update Record"
   - Click "Continue"

3. **Connect Salesforce Account**
   - If you haven't connected Salesforce:
     - Click "Sign in to Salesforce"
     - Enter your Salesforce credentials
     - Authorize Zapier to access Salesforce
     - Click "Yes, Continue"
   - If you have an existing connection: Select it

4. **Configure Update Record**
   - **Object Type**: Select `Lead`
   - **Record ID**: 
     - Click in the field
     - Select "Custom" from the dropdown
     - Enter: `{{1__leadId}}` 
     - (This gets the `leadId` from the webhook payload)
   
   - **Fields to Update**: Click "Show all fields" or search for:
     - **Prospecting_Step_LinkedIn__c**: 
       - Set to: `True` (checkbox)
       - Or: `{{1__Prospecting_Step_LinkedIn__c}}` if you want to use the payload value

5. **Map Additional Fields (Optional)**
   - You can map other fields if needed:
     - `sgaEmail` → Any custom field
     - `timestamp` → Any date field
     - `action` → Any text field

#### Step 4: Test the Zap

1. **Test the Action**
   - Click "Test" button
   - Zapier will try to update a Salesforce record
   - **Important**: Make sure the `leadId` in your test matches a real Lead ID
   - Check the results - should show "Success"

2. **Verify in Salesforce**
   - Go to Salesforce
   - Find the Lead that was updated
   - Verify `Prospecting_Step_LinkedIn__c` is now `TRUE`

#### Step 5: Turn On the Zap

1. **Activate Zap**
   - Click "Turn on Zap" button (top-right)
   - Confirm activation
   - The Zap is now live and waiting for webhook calls

#### Step 6: Add to Extension

1. **Open Extension Settings**
   - Open the SGA Velocity Sidebar extension
   - Click the gear icon (⚙️)

2. **Enter Zapier Webhook URL**
   - Paste your Zapier webhook URL into "Zapier Webhook URL" field
   - Example: `https://hooks.zapier.com/hooks/catch/1234567/abcdefg/`

3. **Test Connection**
   - Click "Test Connection" button
   - Should see "Zapier connection OK" message
   - Note: This sends a test payload - you might see a test record in Salesforce

4. **Save Settings**
   - Click "Save Settings"

---

## Part 3: Understanding the Data Flow

### n8n Webhook (GET Request)

**Request:**
```
GET https://your-n8n-instance.com/webhook/sga-leads?email=sga@savvywealth.com
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
    "Prospecting_Step_LinkedIn__c": false
  }
]
```

### Zapier Webhook (POST Request)

**Request:**
```json
{
  "leadId": "00Q5g00000ABC123",
  "sgaEmail": "sga@savvywealth.com",
  "timestamp": "2025-12-19T10:30:00.000Z",
  "action": "linkedin_sent"
}
```

**Result:**
- Salesforce Lead with ID `00Q5g00000ABC123` gets updated:
  - `Prospecting_Step_LinkedIn__c` = `TRUE`

---

## Part 4: Troubleshooting

### n8n Issues

**No leads returned:**
- Check the SOQL query syntax
- Verify the email parameter is being passed correctly
- Check Salesforce permissions for the connected user
- Verify leads exist with the specified criteria

**Webhook not responding:**
- Make sure the workflow is **Active** (toggle in top-right)
- Check the webhook path matches your URL
- Verify n8n instance is accessible

**Wrong data format:**
- Ensure Salesforce node returns raw query results
- Check that the response is a JSON array, not wrapped in an object

### Zapier Issues

**Webhook not receiving data:**
- Verify the webhook URL is correct
- Check that the Zap is **Turned On**
- Look at Zapier's webhook history to see incoming requests

**Salesforce update fails:**
- Verify the `leadId` field mapping is correct
- Check Salesforce permissions for the connected account
- Ensure the Lead ID format is correct (18 characters)
- Verify `Prospecting_Step_LinkedIn__c` field exists and is accessible

**Test connection fails:**
- The extension sends a test payload - check Zapier's webhook history
- Verify the Zap is active
- Check that the webhook URL is accessible

---

## Part 5: Security Considerations

### n8n Webhook
- Consider adding authentication (API key, basic auth)
- Restrict access to specific IPs if possible
- Validate the email parameter to prevent injection

### Zapier Webhook
- Webhook URLs are secret - don't share publicly
- Consider using Zapier's webhook authentication options
- Monitor webhook usage in Zapier dashboard

---

## Quick Reference

### n8n Webhook URL Format
```
https://your-n8n-instance.com/webhook/sga-leads
```

### Zapier Webhook URL Format
```
https://hooks.zapier.com/hooks/catch/[NUMBERS]/[LETTERS]/
```

### Extension Settings
1. Open extension → Click gear icon (⚙️)
2. Paste n8n URL → Test Connection
3. Paste Zapier URL → Test Connection
4. Click "Save Settings"

---

## Next Steps

After setting up both webhooks:
1. Test the extension sync functionality
2. Test marking a lead as sent
3. Verify updates appear in Salesforce
4. Monitor for any errors in n8n/Zapier logs

For issues, check:
- n8n workflow execution history
- Zapier task history
- Extension console logs (see TESTING_GUIDE.md)

