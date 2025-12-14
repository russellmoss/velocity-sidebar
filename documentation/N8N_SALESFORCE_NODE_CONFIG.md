# n8n Salesforce Node Configuration - Exact Steps

## Step 1: Select Resource

In the Salesforce node, you'll see a dropdown for **Resource**. 

**Select: `Search`**

*(Not "Lead" - we need the Search resource to use SOQL queries)*

## Step 2: Select Operation/Action

After selecting "Search" as the Resource, you'll see the Operation dropdown.

**Select: `Query`**

This is the action that allows you to run SOQL queries.

## Step 3: Configure the Query

Now you'll see a field for the SOQL query. Paste this:

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
- The `{{ $json.query.email }}` part gets the email from the webhook URL parameter
- This query finds Leads owned by the user with that email
- Only returns leads that haven't been sent to yet (`Prospecting_Step_LinkedIn__c = false`)
- Only leads with LinkedIn profiles

## Step 4: Connect Your Salesforce Account

1. **If you haven't connected Salesforce:**
   - Click "Create New Credential" or the credential dropdown
   - Choose authentication method:
     - **OAuth2** (recommended) - most secure
     - **Access Token** - simpler but less secure
   - Follow the prompts to connect your Salesforce account
   - You'll need:
     - Salesforce domain (e.g., `yourcompany.salesforce.com`)
     - Environment (Production or Sandbox)

2. **If you already have credentials:**
   - Select them from the dropdown

## Step 5: Save the Node

- Click "Save" or the checkmark to save the Salesforce node

## Step 6: Test the Workflow

1. **Make sure workflow is Active** (toggle in top-right)

2. **Test in browser:**
   ```
   https://russellmoss87.app.n8n.cloud/webhook-test/025534f6-dde0-4036-b4b9-ed76d284e1c2?email=your-email@savvywealth.com
   ```

3. **Check the response:**
   - Should return JSON array of Lead records
   - Each record should have: Id, FirstName, LastName, Company, etc.

## Alternative: If "Search" Resource Doesn't Work

If for some reason "Search" → "Query" doesn't work in your n8n version, you can try:

**Option 2: Lead → Get Many**
- Resource: `Lead`
- Operation: `Get Many`
- But this has limitations - you can't use complex SOQL queries
- You'd need to filter in a separate node

**Option 3: Use Code Node**
- If Search doesn't work, you can use a "Code" node to make a Salesforce API call directly
- But Search → Query should work for most n8n versions

## Troubleshooting

### "Search" Resource Not Available
- Make sure you're using a recent version of n8n
- The Search resource should be available in the Salesforce node
- If not, check n8n documentation or update n8n

### Query Syntax Error
- Make sure all field names match your Salesforce exactly
- Check that custom fields have `__c` suffix
- Verify the `{{ $json.query.email }}` syntax is correct for your n8n version

### No Results Returned
- Check that you have leads matching the criteria
- Verify the email parameter is being passed correctly
- Test the query directly in Salesforce to make sure it works

## Summary

**Exact Configuration:**
1. Resource: **`Search`**
2. Operation: **`Query`**
3. Query Field: Paste the SOQL query above
4. Credentials: Connect your Salesforce account
5. Save and test!

