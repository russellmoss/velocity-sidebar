# Salesforce Link Feature - Cursor.ai Agentic Implementation Plan

## 📋 Overview

**Feature:** Add a clickable Salesforce icon to the SGA Velocity Sidebar that opens the lead's Salesforce record.

**Files to Modify:**
1. `src/types/index.ts` - Add helper functions
2. `src/sidepanel/index.html` - Add Salesforce icon element
3. `src/sidepanel/main.ts` - Wire up the functionality

**Salesforce URL Pattern:**
- Lead: `https://savvywealth.lightning.force.com/lightning/r/Lead/{Id}/view`
- Opportunity: `https://savvywealth.lightning.force.com/lightning/r/Opportunity/{Id}/view`

---

## 🚦 Pre-Flight Gate

Before starting, run this command to verify project structure:

```bash
test -f src/types/index.ts && test -f src/sidepanel/index.html && test -f src/sidepanel/main.ts && echo "✅ READY TO START" || echo "❌ MISSING FILES - DO NOT PROCEED"
```

**Gate Criteria:** Must see `✅ READY TO START` before proceeding.

---

## Step 1: Add Salesforce URL Helper Functions

### 📝 Cursor Prompt

```
In src/types/index.ts, add Salesforce URL helper constants and functions.

Find the comment line that says:
// -----------------------------------------------------------------------------
// Salesforce Lead Record (EXACT FIELD NAMES)
// -----------------------------------------------------------------------------

Add the following code block ABOVE that line (before the SalesforceLead interface).

Do NOT modify any existing code. Only ADD this new section.
```

### 📄 Code to Add

```typescript
// -----------------------------------------------------------------------------
// Salesforce URL Constants & Helpers
// -----------------------------------------------------------------------------

/** Salesforce Lightning base URL for Savvy Wealth org */
export const SALESFORCE_BASE_URL = 'https://savvywealth.lightning.force.com/lightning/r';

/** Salesforce object types with their ID prefixes */
export const SALESFORCE_OBJECT_PREFIXES = {
  LEAD: '00Q',
  OPPORTUNITY: '006',
  CONTACT: '003',
  ACCOUNT: '001',
} as const;

/** 
 * Determines the Salesforce object type from an ID prefix
 * @param id - The 18-character Salesforce record ID
 * @returns The object type name (Lead, Opportunity, Contact, Account) or 'Unknown'
 */
export function getSalesforceObjectType(id: string): string {
  if (!id || id.length < 3) return 'Unknown';
  const prefix = id.substring(0, 3);
  
  switch (prefix) {
    case SALESFORCE_OBJECT_PREFIXES.LEAD:
      return 'Lead';
    case SALESFORCE_OBJECT_PREFIXES.OPPORTUNITY:
      return 'Opportunity';
    case SALESFORCE_OBJECT_PREFIXES.CONTACT:
      return 'Contact';
    case SALESFORCE_OBJECT_PREFIXES.ACCOUNT:
      return 'Account';
    default:
      return 'Unknown';
  }
}

/**
 * Generates a Salesforce Lightning URL for a record
 * @param id - The 18-character Salesforce record ID
 * @returns The full Salesforce Lightning URL or null if ID is invalid
 */
export function getSalesforceUrl(id: string): string | null {
  if (!id || id.length < 15) return null;
  
  const objectType = getSalesforceObjectType(id);
  if (objectType === 'Unknown') {
    // Fallback: assume Lead if prefix is unrecognized (99% are leads)
    return `${SALESFORCE_BASE_URL}/Lead/${id}/view`;
  }
  
  return `${SALESFORCE_BASE_URL}/${objectType}/${id}/view`;
}

```

### ✅ Step 1 Gate - MUST PASS BEFORE STEP 2

```bash
# Run TypeScript compiler to check for errors
npx tsc --noEmit src/types/index.ts

# Verify the functions exist
grep -q "export function getSalesforceUrl" src/types/index.ts && \
grep -q "export function getSalesforceObjectType" src/types/index.ts && \
grep -q "SALESFORCE_BASE_URL" src/types/index.ts && \
echo "✅ STEP 1 COMPLETE - PROCEED TO STEP 2" || echo "❌ STEP 1 FAILED - FIX BEFORE PROCEEDING"
```

**Gate Criteria:**
- [ ] No TypeScript errors from `tsc --noEmit`
- [ ] All three grep checks pass
- [ ] See `✅ STEP 1 COMPLETE`

---

## Step 2: Add Salesforce Icon to HTML

### 📝 Cursor Prompt

```
In src/sidepanel/index.html, add a Salesforce link icon next to the LinkedIn icon.

Find this exact HTML block in the lead card section:

<div class="flex gap-2 items-center">
  <!-- Lead Score Badge -->
  <span id="lead-score" class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium hidden">
    Score: 85
  </span>
  <a id="linkedin-link" href="#" target="_blank" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Open LinkedIn Profile">

Replace that entire <div class="flex gap-2 items-center"> block with the new code that includes both the Salesforce link and the LinkedIn link.

The Salesforce link should appear BEFORE the LinkedIn link.
```

### 📄 Code to Replace With

Find and replace the `<div class="flex gap-2 items-center">` block that contains `lead-score` and `linkedin-link`:

```html
<div class="flex gap-2 items-center">
  <!-- Lead Score Badge -->
  <span id="lead-score" class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium hidden">
    Score: 85
  </span>
  <!-- Salesforce Link -->
  <a id="salesforce-link" href="#" target="_blank" class="p-2 hover:bg-gray-100 rounded-lg transition-colors hidden" title="Open Salesforce Record">
    <svg class="w-5 h-5" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
      <path fill="#00A1E0" d="M20.012 10.83c1.476-1.528 3.53-2.475 5.806-2.475 2.972 0 5.627 1.627 7.013 4.035a9.635 9.635 0 0 1 4.078-.903c5.377 0 9.736 4.396 9.736 9.817 0 5.422-4.359 9.818-9.736 9.818-.622 0-1.23-.058-1.82-.17a7.584 7.584 0 0 1-6.62 3.876 7.543 7.543 0 0 1-4.256-1.312 8.853 8.853 0 0 1-7.343 3.9c-4.441 0-8.156-3.268-8.799-7.55a8.31 8.31 0 0 1-1.442.128C2.93 29.994 0 27.032 0 23.395c0-2.987 1.977-5.511 4.693-6.324a7.848 7.848 0 0 1-.204-1.748c0-4.396 3.569-7.96 7.972-7.96 2.665 0 5.022 1.307 6.474 3.316l.077.151z"/>
    </svg>
  </a>
  <!-- LinkedIn Link -->
  <a id="linkedin-link" href="#" target="_blank" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Open LinkedIn Profile">
    <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
    </svg>
  </a>
</div>
```

### ✅ Step 2 Gate - MUST PASS BEFORE STEP 3

```bash
# Verify Salesforce link element exists
grep -q 'id="salesforce-link"' src/sidepanel/index.html && \
grep -q '#00A1E0' src/sidepanel/index.html && \
grep -q 'Open Salesforce Record' src/sidepanel/index.html && \
echo "✅ STEP 2 COMPLETE - PROCEED TO STEP 3" || echo "❌ STEP 2 FAILED - FIX BEFORE PROCEEDING"
```

**Gate Criteria:**
- [ ] `id="salesforce-link"` exists in HTML
- [ ] Salesforce blue color `#00A1E0` exists
- [ ] Title text "Open Salesforce Record" exists
- [ ] See `✅ STEP 2 COMPLETE`

---

## Step 3: Import getSalesforceUrl in main.ts

### 📝 Cursor Prompt

```
In src/sidepanel/main.ts, add an import for the getSalesforceUrl function.

Find the imports at the top of the file. There should be existing imports from '../types'.

Add a NEW import statement for getSalesforceUrl as a runtime function (not a type).

If there's already an import from '../types', add getSalesforceUrl to it.
If imports only use "import type", add a separate "import { getSalesforceUrl } from '../types';" line.
```

### 📄 Code to Add

Add this import near the top of the file (after any existing imports from '../types'):

```typescript
import { getSalesforceUrl } from '../types';
```

**Important:** This is a runtime function import, NOT a type import. Do not add it to an `import type { ... }` statement.

### ✅ Step 3 Gate - MUST PASS BEFORE STEP 4

```bash
# Verify import exists and TypeScript compiles
grep -q "import.*getSalesforceUrl.*from.*'../types'" src/sidepanel/main.ts && \
npx tsc --noEmit src/sidepanel/main.ts 2>/dev/null && \
echo "✅ STEP 3 COMPLETE - PROCEED TO STEP 4" || echo "❌ STEP 3 FAILED - FIX BEFORE PROCEEDING"
```

**Gate Criteria:**
- [ ] Import statement for `getSalesforceUrl` exists
- [ ] No TypeScript compilation errors
- [ ] See `✅ STEP 3 COMPLETE`

---

## Step 4: Add salesforceLink to DOM Elements

### 📝 Cursor Prompt

```
In src/sidepanel/main.ts, add the salesforceLink element to the elements object.

Find the elements object that contains DOM element references. Look for:
  linkedinLink: document.getElementById('linkedin-link') as HTMLAnchorElement,

Add a new line IMMEDIATELY AFTER linkedinLink for salesforceLink:
  salesforceLink: document.getElementById('salesforce-link') as HTMLAnchorElement,
```

### 📄 Code to Add

Find the `elements` object (around line 20-60) and add this line after `linkedinLink`:

```typescript
  salesforceLink: document.getElementById('salesforce-link') as HTMLAnchorElement,
```

**Context Example:**
```typescript
const elements = {
  // ... other elements ...
  linkedinLink: document.getElementById('linkedin-link') as HTMLAnchorElement,
  salesforceLink: document.getElementById('salesforce-link') as HTMLAnchorElement,  // ADD THIS LINE
  alreadySentBadge: document.getElementById('already-sent-badge') as HTMLDivElement,
  // ... more elements ...
};
```

### ✅ Step 4 Gate - MUST PASS BEFORE STEP 5

```bash
# Verify salesforceLink is in elements object
grep -q "salesforceLink.*getElementById.*salesforce-link" src/sidepanel/main.ts && \
npx tsc --noEmit src/sidepanel/main.ts 2>/dev/null && \
echo "✅ STEP 4 COMPLETE - PROCEED TO STEP 5" || echo "❌ STEP 4 FAILED - FIX BEFORE PROCEEDING"
```

**Gate Criteria:**
- [ ] `salesforceLink` element reference exists
- [ ] No TypeScript compilation errors
- [ ] See `✅ STEP 4 COMPLETE`

---

## Step 5: Add Salesforce Link Logic to updateLeadUI

### 📝 Cursor Prompt

```
In src/sidepanel/main.ts, add logic to update the Salesforce link when displaying a lead.

Find the updateLeadUI function. Inside it, find the LinkedIn link handling code:

  // LinkedIn link
  const linkedinUrl = lead.linkedInUrl || lead.LinkedIn_Profile_Apollo__c;
  if (linkedinUrl) {
    elements.linkedinLink.href = linkedinUrl;
    elements.linkedinLink.classList.remove('hidden');
  } else {
    elements.linkedinLink.classList.add('hidden');
  }

Add the Salesforce link logic block IMMEDIATELY AFTER the LinkedIn link block (before any other code like "Already sent badge").
```

### 📄 Code to Add

Add this block directly after the LinkedIn link handling code:

```typescript
  // Salesforce link
  const salesforceUrl = getSalesforceUrl(lead.Id);
  if (salesforceUrl) {
    elements.salesforceLink.href = salesforceUrl;
    elements.salesforceLink.classList.remove('hidden');
  } else {
    elements.salesforceLink.classList.add('hidden');
  }
```

**Full Context:**
```typescript
  // LinkedIn link
  const linkedinUrl = lead.linkedInUrl || lead.LinkedIn_Profile_Apollo__c;
  if (linkedinUrl) {
    elements.linkedinLink.href = linkedinUrl;
    elements.linkedinLink.classList.remove('hidden');
  } else {
    elements.linkedinLink.classList.add('hidden');
  }

  // Salesforce link
  const salesforceUrl = getSalesforceUrl(lead.Id);
  if (salesforceUrl) {
    elements.salesforceLink.href = salesforceUrl;
    elements.salesforceLink.classList.remove('hidden');
  } else {
    elements.salesforceLink.classList.add('hidden');
  }

  // Already sent badge
  elements.alreadySentBadge.classList.toggle('hidden', !lead.Prospecting_Step_LinkedIn__c);
```

### ✅ Step 5 Gate - MUST PASS BEFORE STEP 6

```bash
# Verify Salesforce link logic exists and compiles
grep -q "getSalesforceUrl(lead.Id)" src/sidepanel/main.ts && \
grep -q "elements.salesforceLink.href" src/sidepanel/main.ts && \
npx tsc --noEmit src/sidepanel/main.ts 2>/dev/null && \
echo "✅ STEP 5 COMPLETE - PROCEED TO STEP 6" || echo "❌ STEP 5 FAILED - FIX BEFORE PROCEEDING"
```

**Gate Criteria:**
- [ ] `getSalesforceUrl(lead.Id)` call exists
- [ ] `elements.salesforceLink.href` assignment exists
- [ ] No TypeScript compilation errors
- [ ] See `✅ STEP 5 COMPLETE`

---

## Step 6: Final Build and Validation

### 📝 Cursor Prompt

```
Build the project and verify there are no errors.

Run: npm run build

If there are any errors, fix them before proceeding.
```

### ✅ Step 6 Gate - FINAL VALIDATION

```bash
# Full build validation
npm run build && \
test -f dist/sidepanel/index.html && \
grep -q "salesforce-link" dist/sidepanel/index.html && \
echo "✅ BUILD SUCCESSFUL - FEATURE COMPLETE" || echo "❌ BUILD FAILED - FIX ERRORS"
```

**Gate Criteria:**
- [ ] `npm run build` completes with no errors
- [ ] `dist/sidepanel/index.html` exists
- [ ] Salesforce link element is in the built HTML
- [ ] See `✅ BUILD SUCCESSFUL`

---

## 🎯 Final Verification Checklist

Run all checks at once:

```bash
echo "=== FINAL VERIFICATION ===" && \
echo "" && \
echo "1. Checking types..." && \
grep -q "export function getSalesforceUrl" src/types/index.ts && echo "   ✅ getSalesforceUrl function exists" || echo "   ❌ MISSING: getSalesforceUrl function" && \
echo "" && \
echo "2. Checking HTML..." && \
grep -q 'id="salesforce-link"' src/sidepanel/index.html && echo "   ✅ Salesforce link element exists" || echo "   ❌ MISSING: Salesforce link element" && \
echo "" && \
echo "3. Checking main.ts imports..." && \
grep -q "import.*getSalesforceUrl" src/sidepanel/main.ts && echo "   ✅ getSalesforceUrl imported" || echo "   ❌ MISSING: getSalesforceUrl import" && \
echo "" && \
echo "4. Checking main.ts elements..." && \
grep -q "salesforceLink.*getElementById" src/sidepanel/main.ts && echo "   ✅ salesforceLink element reference exists" || echo "   ❌ MISSING: salesforceLink element reference" && \
echo "" && \
echo "5. Checking main.ts logic..." && \
grep -q "getSalesforceUrl(lead.Id)" src/sidepanel/main.ts && echo "   ✅ Salesforce URL logic exists" || echo "   ❌ MISSING: Salesforce URL logic" && \
echo "" && \
echo "6. Running TypeScript check..." && \
npx tsc --noEmit 2>/dev/null && echo "   ✅ No TypeScript errors" || echo "   ❌ TypeScript errors found" && \
echo "" && \
echo "7. Running build..." && \
npm run build 2>/dev/null && echo "   ✅ Build successful" || echo "   ❌ Build failed" && \
echo "" && \
echo "=== VERIFICATION COMPLETE ==="
```

---

## 🔧 Troubleshooting

### If TypeScript errors occur:

**Error: Cannot find name 'getSalesforceUrl'**
```
Fix: Ensure the import statement is correct:
import { getSalesforceUrl } from '../types';
```

**Error: Property 'salesforceLink' does not exist**
```
Fix: Ensure salesforceLink is added to the elements object:
salesforceLink: document.getElementById('salesforce-link') as HTMLAnchorElement,
```

**Error: Module has no exported member 'getSalesforceUrl'**
```
Fix: Ensure the function is exported in src/types/index.ts:
export function getSalesforceUrl(id: string): string | null {
```

### If HTML element not found at runtime:

```typescript
// Add null check for safety
if (elements.salesforceLink) {
  const salesforceUrl = getSalesforceUrl(lead.Id);
  if (salesforceUrl) {
    elements.salesforceLink.href = salesforceUrl;
    elements.salesforceLink.classList.remove('hidden');
  } else {
    elements.salesforceLink.classList.add('hidden');
  }
}
```

---

## 📁 Summary of Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/types/index.ts` | ADD | `SALESFORCE_BASE_URL` constant |
| `src/types/index.ts` | ADD | `SALESFORCE_OBJECT_PREFIXES` constant |
| `src/types/index.ts` | ADD | `getSalesforceObjectType()` function |
| `src/types/index.ts` | ADD | `getSalesforceUrl()` function |
| `src/sidepanel/index.html` | MODIFY | Add `<a id="salesforce-link">` element |
| `src/sidepanel/main.ts` | ADD | Import `getSalesforceUrl` |
| `src/sidepanel/main.ts` | MODIFY | Add `salesforceLink` to elements object |
| `src/sidepanel/main.ts` | MODIFY | Add Salesforce URL logic in `updateLeadUI()` |

---

## 🚀 After Completion

1. **Reload Extension:** Go to `chrome://extensions/` and click refresh on the extension
2. **Test:** Open the sidebar, navigate to a lead, verify the Salesforce icon appears
3. **Click Test:** Click the icon and verify it opens the correct Salesforce record

**Expected URL format:**
```
https://savvywealth.lightning.force.com/lightning/r/Lead/00QVS00000QWEor2AH/view
```
