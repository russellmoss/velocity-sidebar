Here is the updated, accurate documentation reflecting your exact n8n configuration, including the specific "Smart Query" code and Code node logic you are using.

-----

# n8n Salesforce Webhook Documentation

**System:** SGA Velocity Sidebar Integration  
**Version:** 1.1 (Smart Query & List Support)  
**Author:** RevOps Engineering

## 1\. Executive Summary

This n8n workflow acts as the secure API layer between the Chrome Extension and Salesforce. It replaces static lists with a **dynamic, role-aware query engine**.

When a user clicks "Sync" in the extension:

1.  The extension sends the user's **Email** to n8n.
2.  n8n identifies if the user is an **Admin** (view all) or an **SGA** (view own).
3.  n8n executes a raw SOQL query against Salesforce API v58.0 via an HTTP Request.
4.  n8n formats the response into a safe JSON object containing the lead list.

-----

## 2\. Architecture Diagram

```mermaid
graph LR
    A[Chrome Extension] -- GET /webhook?email=user@... --> B(n8n Webhook Node)
    B --> C{HTTP Request Node}
    C -- "Execute Smart Query (IIFE)" --> D[Salesforce OAuth2 API]
    D -- Raw JSON Response --> E[Code Node]
    E -- "Run Once for All Items" --> F{Format: { leads: [...] }}
    F --> A
```

-----

## 3\. Workflow Configuration

### Node 1: Webhook (Trigger)

  * **Method:** `GET`
  * **Authentication:** None (Public endpoint).
  * **Parameters:** Expects `email` query parameter (e.g., `?email=russell.moss@savvywealth.com`).
  * **Respond:** `When Last Node Finishes`.

### Node 2: HTTP Request (The Engine)

This node executes the raw SOQL query logic.

  * **Method:** `GET`
  * **URL:** `https://savvywealth.my.salesforce.com/services/data/v58.0/query`
  * **Authentication:** `Salesforce OAuth2 API` (Predefined Credential).
  * **Specify Query Parameters:** `Using Fields Below`.
  * **Query Parameter Name:** `q`
  * **Query Parameter Value:** (See "The Smart Query Logic" section below).

### Node 3: Code Node (Safety Layer)

  * **Mode:** `Run Once for All Items` (Crucial setting to process the full dataset as one batch).
  * **Purpose:** Extracts the `records` array from the Salesforce response and wraps it in a standard JSON object. This prevents n8n from erroring out if 0 leads are found.

**The Code:**

```javascript
// Get the records array (or empty if none found)
const records = items[0].json.records || [];

// Return a single JSON object containing the array. 
// This satisfies the Webhook node's need for at least 1 item.
return [
  {
    json: {
      leads: records
    }
  }
];
```

-----

## 4\. The "Smart Query" Logic

The core intelligence lives inside the **HTTP Request** node's `q` parameter. It uses a JavaScript Self-Executing Function (IIFE) to dynamically build the SOQL string based on the incoming email.

**Exact Implementation:**

```javascript
{{
(() => {
  // 1. ADMIN LIST: Add emails here
  const adminEmails = ['russell.moss@savvywealth.com'];
  
  // 2. GET CURRENT USER EMAIL
  const userEmail = $('Webhook').item.json.query.email;

  // 3. DEFINE QUERY PARTS
  const select = "SELECT Id, FirstName, LastName, Company, Title, Savvy_Lead_Score__c, LinkedIn_Profile_Apollo__c, Status, Prospecting_Step_LinkedIn__c, Lead_List_Name__c, Owner.Name";
  const where = "Prospecting_Step_LinkedIn__c = false AND Status IN ('New', 'Contacting') AND LinkedIn_Profile_Apollo__c != null";
  const order = "ORDER BY Savvy_Lead_Score__c DESC NULLS LAST LIMIT 200";

  // 4. RETURN THE CORRECT QUERY
  if (adminEmails.includes(userEmail)) {
    // Admin View: Show ALL leads
    return select + " FROM Lead WHERE " + where + " " + order;
  } else {
    // SGA View: Show ONLY their leads
    return select + " FROM Lead WHERE OwnerId IN (SELECT Id FROM User WHERE Email = '" + userEmail + "') AND " + where + " " + order;
  }
})()
}}
```

-----

## 5\. Data Schema (Response)

The extension receives a JSON object with a single key `leads`, containing an array of records.

### Field Mapping

| Field | Type | Description |
| :--- | :--- | :--- |
| `Id` | String | Salesforce Lead ID. |
| `FirstName` | String | Used for message personalization. |
| `LastName` | String | Display purposes. |
| `Company` | String | Display purposes. |
| `Title` | String | Job title. |
| `Savvy_Lead_Score__c` | Number | Sorting priority (High to Low). |
| `LinkedIn_Profile_Apollo__c` | URL | The link the extension opens. |
| `Status` | String | `New` or `Contacting`. |
| `Prospecting_Step_LinkedIn__c` | Boolean | Always `false` (filtered by query). |
| **`Lead_List_Name__c`** | String | **Crucial for UI Filtering.** The name of the Salesforce List. |
| `Owner.Name` | String | Who owns the lead (visible in Admin view). |

**Example Response:**

```json
{
  "leads": [
    {
      "Id": "00QVS00000Ebv5v2AB",
      "FirstName": "Aaron",
      "Lead_List_Name__c": "2025-11 Lead List - Lead Scoringv3",
      "Owner": { "Name": "Helen Kamens" },
      ...
    }
  ]
}
```

-----

## 6\. Frontend Integration (Extension)

Since n8n returns a raw list of 200 leads (which may contain mixed lists for Admins), the Extension must handle the organization:

1.  **Sync:** Extension calls n8n Production URL with `?email=...`.
2.  **Receive:** Gets the `{ leads: [...] }` object.
3.  **Process:**
      * Iterates through the leads to extract unique `Lead_List_Name__c` values.
      * Populates a "List Filter" dropdown in the UI.
4.  **Display:**
      * Defaults to "All Lists" (or the first available list).
      * Filtering happens locally in the extension (hiding leads that don't match the selected list).
      * The "Next/Prev" navigation skips over hidden leads.

-----

## 7\. Troubleshooting

| Issue | Cause | Fix |
| :--- | :--- | :--- |
| **Returns `{"leads": []}`** | No leads match criteria (Status, Owner, or LinkedIn flag). | Check Salesforce: verify Lead Status is 'New'/'Contacting' and `Prospecting_Step_LinkedIn__c` is unchecked. |
| **Admins see 0 leads** | Admin email missing from logic. | Update the `adminEmails` array in the HTTP Request node code to include the new admin. |
| **Error: "No item to return"** | Code Node logic missing or configured wrong. | Ensure Code Node returns `[{ json: { leads: records } }]` and handles empty arrays correctly. |
| **SGA sees wrong leads** | SGA email logic failure. | Ensure the `else` block in the Smart Query correctly inserts the `OwnerId` subquery using `userEmail`. |