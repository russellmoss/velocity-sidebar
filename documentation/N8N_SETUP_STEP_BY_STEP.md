# n8n GET Webhook Setup - Step by Step

Based on your current webhook configuration, here's how to complete the setup:

## Current Configuration
- **Webhook URL**: `https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2`
- **HTTP Method**: GET ✓
- **Path**: `025534f6-dde0-4036-b4b9-ed76d284e1c2`
- **Respond**: Immediately ✓

## Step 1: Configure Webhook Node Settings

### In the Webhook Node:

1. **Keep Current Settings:**
   - ✅ HTTP Method: GET (already set)
   - ✅ Respond: Immediately (already set - this is correct)

2. **Add Response Header (Important!):**
   - In the webhook node settings, look for "Response" or "Response Headers" section
   - Add a response header:
     - **Name**: `Content-Type`
     - **Value**: `application/json`
   - This ensures the extension receives JSON properly

3. **Save the Webhook Node**
   - Click "Save" or the checkmark

## Step 2: Add Salesforce Node

1. **Add New Node After Webhook**
   - Click the "+" button after your Webhook node
   - Search for "Salesforce"
   - Select "Salesforce" node

2. **Connect to Salesforce**
   - If you haven't connected Salesforce before:
     - Click "Create New Credential" or "Add Credential"
     - Choose authentication method (OAuth2 is recommended)
     - Enter your Salesforce credentials:
       - **Environment**: Production or Sandbox
       - **Domain**: Your Salesforce domain
     - Complete OAuth flow if needed
   - If you have existing credentials: Select them from dropdown

3. **Configure Salesforce Query**
   - **Resource**: Select `Lead`
   - **Operation**: Select `Query`
   - **Query**: Paste this SOQL query:
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

   **Important**: The `{{ $json.query.email }}` part gets the email from the URL query parameter (`?email=...`)

4. **Save Salesforce Node**

## Step 3: Connect the Nodes

1. **Link Webhook to Salesforce**
   - Drag from the Webhook node output (right side) to the Salesforce node input (left side)
   - Or click the connection point and select the Salesforce node

2. **Verify Connection**
   - You should see a line connecting the two nodes

## Step 4: Configure Response

Since you have "Respond: Immediately" selected, n8n will return the output from the last node (Salesforce). This should work automatically, but verify:

1. **Check Response Format**
   - The Salesforce node should output an array of Lead records
   - n8n will automatically return this as JSON

2. **If Response Doesn't Work:**
   - You might need to add a "Respond to Webhook" node after Salesforce
   - But with "Respond: Immediately", it should work without it

## Step 5: Test the Webhook

1. **Activate the Workflow**
   - Click the "Active" toggle in the top-right corner of n8n
   - The workflow must be active for the webhook to work

2. **Test in Browser**
   - Open a new browser tab
   - Navigate to:
     ```
     https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2?email=your-email@savvywealth.com
     ```
   - Replace `your-email@savvywealth.com` with an actual SGA email from your Salesforce

3. **Expected Response**
   - You should see JSON data like:
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

4. **If You Get an Error:**
   - Check n8n execution history (click on the workflow, then "Executions")
   - Look for error messages
   - Common issues:
     - Salesforce connection not working
     - SOQL query syntax error
     - No leads matching the criteria

## Step 6: Add to Extension

1. **Copy Your Webhook URL**
   - Your webhook URL is:
     ```
     https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2
     ```

2. **Open Extension Settings**
   - Open the SGA Velocity Sidebar extension
   - Click the gear icon (⚙️) in the bottom-right

3. **Enter Webhook URL**
   - Paste the URL into "n8n Webhook URL" field:
     ```
     https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2
     ```

4. **Test Connection**
   - Click "Test Connection" button
   - Should see "n8n connection OK" message

5. **Save Settings**
   - Click "Save Settings"

## Troubleshooting

### No Data Returned
- **Check Salesforce Query**: Verify the email parameter is being used correctly
- **Check Lead Criteria**: Make sure you have leads that match:
  - Owned by the user with that email
  - `Prospecting_Step_LinkedIn__c = false`
  - `Status IN ('New', 'Contacting')`
  - Has `LinkedIn_Profile_Apollo__c` value

### Wrong Response Format
- The extension expects a JSON array directly
- If n8n wraps it in an object, you might need to add a "Code" node to extract the array
- Example Code node:
  ```javascript
   return items.map(item => item.json);
  ```

### Webhook Not Responding
- Make sure the workflow is **Active** (toggle in top-right)
- Check n8n execution history for errors
- Verify the webhook URL is correct

### CORS Errors
- If you see CORS errors in the browser console, you might need to:
  - Add CORS headers in n8n webhook response
  - Or configure n8n instance to allow CORS

## Quick Checklist

- [ ] Webhook node configured with GET method
- [ ] "Respond: Immediately" enabled
- [ ] Content-Type header set to `application/json`
- [ ] Salesforce node added and connected
- [ ] SOQL query configured with `{{ $json.query.email }}`
- [ ] Workflow is **Active**
- [ ] Tested in browser with `?email=...` parameter
- [ ] Webhook URL added to extension settings
- [ ] Test connection successful in extension

## Your Webhook URL for Extension

```
https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2
```

Copy this URL and paste it into the extension settings!

