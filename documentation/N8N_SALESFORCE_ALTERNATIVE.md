# n8n Salesforce Node - Alternative Configuration

Since "Search" resource isn't available, here are your options:

## Option 1: Use HTTP Request Node (Recommended)

Instead of the Salesforce node, use an HTTP Request node to call Salesforce API directly with SOQL.

### Step 1: Add HTTP Request Node

1. **Add HTTP Request Node** (not Salesforce node)
   - Click "+" after Webhook node
   - Search for "HTTP Request"
   - Select "HTTP Request" node

### Step 2: Configure HTTP Request

1. **Method**: `GET`

2. **URL**: 
   ```
   https://{{ $json.salesforceDomain }}/services/data/v57.0/query/
   ```
   Or hardcode your domain:
   ```
   https://yourcompany.salesforce.com/services/data/v57.0/query/
   ```

3. **Authentication**: 
   - Select "OAuth2" or "Header Auth"
   - For OAuth2: Connect Salesforce OAuth
   - For Header Auth: Use `Authorization: Bearer {{ $json.accessToken }}`

4. **Query Parameters**:
   - Add parameter:
     - **Name**: `q`
     - **Value**: 
       ```sql
       SELECT Id, FirstName, LastName, Company, Title, Savvy_Lead_Score__c, LinkedIn_Profile_Apollo__c, Status, Prospecting_Step_LinkedIn__c FROM Lead WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '{{ $json.query.email }}') AND Prospecting_Step_LinkedIn__c = false AND Status IN ('New', 'Contacting') AND LinkedIn_Profile_Apollo__c != null ORDER BY Savvy_Lead_Score__c DESC NULLS LAST LIMIT 200
       ```
   - Note: This needs to be URL-encoded, but n8n usually handles this

5. **Headers**:
   - Add header:
     - **Name**: `Content-Type`
     - **Value**: `application/json`

### Step 3: Handle Response

The Salesforce API returns:
```json
{
  "records": [
    { "Id": "...", "FirstName": "...", ... },
    ...
  ]
}
```

You might need a "Code" node after HTTP Request to extract just the records array:
```javascript
return items.map(item => ({
  json: item.json.records
}));
```

---

## Option 2: Use Lead → Get Many (Limited)

If you want to use the Salesforce node, use "Lead" → "Get Many", but it has limitations.

### Step 1: Configure Salesforce Node

1. **Resource**: `Lead`
2. **Operation**: `Get Many`

### Step 2: Limitations

- **Can't use complex SOQL** - only basic filtering
- **Can't use subqueries** like `WHERE OwnerId IN (SELECT...)`
- You'll need to filter in a separate node

### Step 3: Workaround with Code Node

1. **Get All Leads** (or filter by basic criteria)
2. **Add Code Node** to filter:
   ```javascript
   const email = $input.item.json.query.email;
   
   // This won't work perfectly because we can't query by Owner Email directly
   // You'd need to get all leads and filter, which is inefficient
   
   return items.filter(item => {
     // Filter logic here
   });
   ```

**This is NOT recommended** - it's inefficient and won't work well.

---

## Option 3: Use Lead → Get Many + Filter Node

1. **Salesforce Node**:
   - Resource: `Lead`
   - Operation: `Get Many`
   - Add filters (limited):
     - `Prospecting_Step_LinkedIn__c` = `false`
     - `Status` IN `['New', 'Contacting']`
     - `LinkedIn_Profile_Apollo__c` IS NOT NULL

2. **Add Filter Node** after Salesforce:
   - Filter by Owner Email (but you'll need to get User info first)
   - This gets complicated quickly

**This is also NOT recommended.**

---

## Recommended Solution: HTTP Request Node

**Use Option 1 (HTTP Request)** - it's the most flexible and allows full SOQL queries.

### Complete Setup with HTTP Request:

1. **Webhook Node** (already done) ✓

2. **HTTP Request Node**:
   - Method: `GET`
   - URL: `https://yourcompany.salesforce.com/services/data/v57.0/query/`
   - Authentication: OAuth2 (Salesforce)
   - Query Parameter `q`: Your full SOQL query

3. **Code Node** (optional, to format response):
   ```javascript
   return items.map(item => ({
     json: item.json.records || item.json
   }));
   ```

4. **Connect nodes**: Webhook → HTTP Request → (Code) → Response

---

## Which Option Should You Use?

**Use Option 1 (HTTP Request)** if:
- ✅ You need full SOQL query support
- ✅ You want the exact query from the guide
- ✅ You're comfortable with API calls

**Use Option 2/3 (Salesforce Node)** if:
- ⚠️ You prefer using n8n's built-in nodes
- ⚠️ You can work around the limitations
- ⚠️ You don't need the Owner Email filter (or can filter differently)

**I recommend Option 1** for the best results.

