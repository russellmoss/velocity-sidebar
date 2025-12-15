# Recruiter Redirect Implementation Guide v1.0
## "The Bounce" - Automated Public-to-Recruiter Profile Redirection

**Feature Overview:** Automatically redirect users from public LinkedIn profiles (`/in/`) to LinkedIn Recruiter profiles (`/talent/profile/`) by scraping the hidden Member ID (Entity URN) from the DOM.

**Compatibility:** Works independently or alongside Flux Capacitor mode.

---

## Table of Contents

1. [Pre-Implementation Checklist](#phase-0-pre-implementation-checklist)
2. [Phase 1: Update Storage Layer](#phase-1-update-storage-layer)
3. [Phase 2: Implement Recruiter ID Scraper](#phase-2-implement-recruiter-id-scraper)
4. [Phase 3: Implement Redirect Logic](#phase-3-implement-redirect-logic)
5. [Phase 4: Update Settings UI](#phase-4-update-settings-ui)
6. [Phase 5: Integration with Flux Capacitor](#phase-5-integration-with-flux-capacitor)
7. [Phase 6: Build and Test](#phase-6-build-and-test)
8. [Phase 7: Future Enhancement - Write-Back](#phase-7-future-enhancement---write-back)
9. [Rollback Instructions](#rollback-instructions)

---

## Phase 0: Pre-Implementation Checklist

### Step 0.1: Verify Project Structure

**Cursor Prompt:**
```text
Run these verification commands to ensure the project structure is correct before we begin implementing the Recruiter Redirect feature:
```

```bash
# Verify required files exist
echo "=== Verifying Project Structure ==="
test -f src/types/index.ts && echo "✓ types/index.ts exists" || echo "✗ MISSING: types/index.ts"
test -f src/lib/storage.ts && echo "✓ lib/storage.ts exists" || echo "✗ MISSING: lib/storage.ts"
test -f src/content/linkedin-scraper.ts && echo "✓ linkedin-scraper.ts exists" || echo "✗ MISSING: linkedin-scraper.ts"
test -f src/sidepanel/main.ts && echo "✓ sidepanel/main.ts exists" || echo "✗ MISSING: sidepanel/main.ts"
test -f src/sidepanel/index.html && echo "✓ sidepanel/index.html exists" || echo "✗ MISSING: sidepanel/index.html"
test -f public/manifest.json && echo "✓ manifest.json exists" || echo "✗ MISSING: manifest.json"

# Verify TypeScript compiles
echo ""
echo "=== Verifying TypeScript Compilation ==="
npx tsc --noEmit && echo "✓ TypeScript compiles without errors" || echo "✗ TypeScript compilation errors found"

# Verify lint passes
echo ""
echo "=== Verifying Linting ==="
npm run lint 2>/dev/null && echo "✓ Linting passes" || echo "⚠ Linting warnings/errors (may be okay)"
```

**Gate:** All required files must exist and TypeScript must compile before proceeding.

### Note on Line Numbers
All line numbers in this guide are approximate. Code locations may shift as the codebase evolves. Use function/interface names and code search to locate exact positions.

### Step 0.2: Create Backups

**Cursor Prompt:**
```text
Create backup copies of all files we'll be modifying for the Recruiter Redirect feature:
```

```bash
# Create backups with .recruiter suffix
cp src/lib/storage.ts src/lib/storage.ts.backup.recruiter
cp src/content/linkedin-scraper.ts src/content/linkedin-scraper.ts.backup.recruiter
cp src/sidepanel/main.ts src/sidepanel/main.ts.backup.recruiter
cp src/sidepanel/index.html src/sidepanel/index.html.backup.recruiter

echo "✓ Backups created with .backup.recruiter suffix"
ls -la src/lib/*.backup.recruiter
ls -la src/content/*.backup.recruiter
ls -la src/sidepanel/*.backup.recruiter
```

---

## Phase 1: Update Storage Layer

### Step 1.1: Add Recruiter Redirect Setting to AppSettings Interface

**Cursor Prompt:**
```text
In `src/lib/storage.ts`, update the AppSettings interface to include the new `recruiterRedirectEnabled` boolean setting.

Find the existing AppSettings interface (search for "export interface AppSettings"):
```

**Find this code:**
```typescript
export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
  fluxCapacitorEnabled: boolean;  // Power-user mode for high-velocity outreach
}
```

**Replace with:**
```typescript
export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
  fluxCapacitorEnabled: boolean;  // Power-user mode for high-velocity outreach
  recruiterRedirectEnabled: boolean;  // Auto-redirect public profiles to LinkedIn Recruiter
}
```

### Step 1.2: Update DEFAULT_SETTINGS

**Cursor Prompt:**
```text
In `src/lib/storage.ts`, update the DEFAULT_SETTINGS constant to include the default value for `recruiterRedirectEnabled`.

Find the DEFAULT_SETTINGS constant (search for "const DEFAULT_SETTINGS"):
```

**Find this code:**
```typescript
const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true,
  fluxCapacitorEnabled: false  // Disabled by default - power users opt-in
};
```

**Replace with:**
```typescript
const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true,
  fluxCapacitorEnabled: false,  // Disabled by default - power users opt-in
  recruiterRedirectEnabled: false  // Disabled by default - requires LinkedIn Recruiter access
};
```

### Step 1.3: Verify Storage Changes

**Cursor Prompt:**
```text
Verify the storage changes compile correctly:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/lib/storage.ts && echo "✓ Storage layer compiles"

# Verify the new setting is present
grep -q "recruiterRedirectEnabled" src/lib/storage.ts && echo "✓ recruiterRedirectEnabled found in interface"
grep -q "recruiterRedirectEnabled: false" src/lib/storage.ts && echo "✓ Default value set to false"
```

**Gate:** Both grep commands must return success before proceeding.

---

## Phase 2: Implement Recruiter ID Scraper

### Step 2.1: Add Recruiter ID Finder Function

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, add a new function called `findRecruiterId()` that scans the DOM for the hidden Recruiter Member ID (Entity URN).

Add this function BEFORE the `scrapeProfile()` function (search for "function scrapeProfile"):
```

**Add this new function:**
```typescript
// -----------------------------------------------------------------------------
// Recruiter ID Extraction ("The Dragnet")
// -----------------------------------------------------------------------------

/**
 * Scans the DOM for the hidden Recruiter Member ID (Entity URN).
 * Validated Pattern: IDs start with "ACo" and are alphanumeric + underscores/dashes.
 * 
 * Strategy:
 * 1. Primary: Scan anchor tags with profileUrn/miniProfileUrn in href
 * 2. Secondary: Look for "View in Recruiter" button
 * 3. Fallback: Search page source for urn:li:fs_miniProfile pattern
 */
function findRecruiterId(): string | null {
  // The "Gold Pattern" - Entity URNs start with "ACo" followed by alphanumeric chars
  // Pattern explicitly stops at commas, which is critical because some URNs appear as "(ACo...,3)"
  const idPattern = /(ACo[a-zA-Z0-9_-]+)/;

  log('Searching for Recruiter ID...');

  // Method 1: Scan specific anchor tags (High reliability)
  // These contain profileUrn or miniProfileUrn parameters
  const candidateLinks = document.querySelectorAll('a[href*="profileUrn"], a[href*="miniProfileUrn"]');
  
  for (const link of candidateLinks) {
    const href = link.getAttribute('href');
    if (!href) continue;

    // Decode URL to handle "urn%3Ali" formats (URL-encoded colons)
    const decodedHref = decodeURIComponent(href);
    const match = decodedHref.match(idPattern);

    if (match && match[1]) {
      log('Found Recruiter ID via anchor scan:', match[1]);
      return match[1];
    }
  }

  // Method 2: Check for explicit "View in Recruiter" button
  const recruiterBtn = document.querySelector('a[href*="/talent/profile/"]');
  if (recruiterBtn) {
    const href = recruiterBtn.getAttribute('href');
    const match = href?.match(idPattern);
    if (match && match[1]) {
      log('Found Recruiter ID via Recruiter button:', match[1]);
      return match[1];
    }
  }

  // Method 3: Fallback - Search page source for miniProfile URN pattern
  // This handles cases where links haven't fully hydrated
  const sourcePattern = /urn:li:fs_miniProfile:(ACo[a-zA-Z0-9_-]+)/;
  
  // Search in code blocks first (often contains JSON data)
  const codeBlocks = document.querySelectorAll('code');
  for (const code of codeBlocks) {
    const text = code.textContent || '';
    const match = text.match(sourcePattern);
    if (match && match[1]) {
      log('Found Recruiter ID via code block:', match[1]);
      return match[1];
    }
  }

  // Last resort: Search entire body HTML (slower but comprehensive)
  const bodyMatch = document.body.innerHTML.match(sourcePattern);
  if (bodyMatch && bodyMatch[1]) {
    log('Found Recruiter ID via body HTML scan:', match[1]);
    return bodyMatch[1];
  }

  log('Could not find Recruiter ID on this profile');
  return null;
}

/**
 * Check if the current page is a public LinkedIn profile (not already Recruiter)
 */
function isPublicProfilePage(): boolean {
  const url = window.location.href;
  return url.includes('linkedin.com/in/') && !url.includes('/talent/') && !url.includes('/recruiter/');
}

/**
 * Build the LinkedIn Recruiter URL from a Member ID
 */
function buildRecruiterUrl(recruiterId: string): string {
  // trk parameter is optional but helps LinkedIn track navigation source
  return `https://www.linkedin.com/talent/profile/${recruiterId}?trk=FLAGSHIP_VIEW_IN_RECRUITER`;
}
```

### Step 2.2: Verify Recruiter ID Scraper Compiles

**Cursor Prompt:**
```text
Verify the new Recruiter ID scraper functions compile correctly:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/content/linkedin-scraper.ts && echo "✓ LinkedIn scraper compiles"

# Verify new functions exist
grep -q "function findRecruiterId" src/content/linkedin-scraper.ts && echo "✓ findRecruiterId function exists"
grep -q "function isPublicProfilePage" src/content/linkedin-scraper.ts && echo "✓ isPublicProfilePage function exists"
grep -q "function buildRecruiterUrl" src/content/linkedin-scraper.ts && echo "✓ buildRecruiterUrl function exists"

# Verify the ID pattern is correct
grep -q "ACo\[a-zA-Z0-9_-\]+" src/content/linkedin-scraper.ts && echo "✓ Correct ACo pattern found"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 3: Implement Redirect Logic

### Step 3.1: Add Redirect Handler Function

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, add the `handleRecruiterRedirect()` function that orchestrates the redirect logic.

Add this function AFTER the Recruiter ID extraction functions (after `buildRecruiterUrl`):
```

**Add this new function:**
```typescript
// -----------------------------------------------------------------------------
// Recruiter Redirect Handler ("The Bounce")
// -----------------------------------------------------------------------------

/**
 * Main handler for Recruiter redirect functionality.
 * Called on page load to check settings and perform redirect if enabled.
 * 
 * Flow:
 * 1. Verify we're on a public profile (not already on Recruiter)
 * 2. Check if Recruiter Redirect is enabled in settings
 * 3. Execute the "Dragnet" scraper to find Recruiter ID
 * 4. Redirect to Recruiter profile if ID found
 */
async function handleRecruiterRedirect(): Promise<boolean> {
  // 1. Verify we are on a public profile (not already Recruiter/Talent)
  if (!isPublicProfilePage()) {
    log('Not a public profile page, skipping redirect');
    return false;
  }

  // 2. Check User Preference (Default to false to prevent surprise behavior)
  try {
    // Note: Using direct storage access here for content script simplicity
    // Alternative: Import getSettings from '../lib/storage' if preferred
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    
    if (!settings.recruiterRedirectEnabled) {
      log('Recruiter redirect disabled in settings');
      return false;
    }
  } catch (error) {
    log('Error reading settings:', error);
    return false;
  }

  // 3. Attempt Scrape using "The Dragnet"
  const recruiterId = findRecruiterId();

  if (recruiterId) {
    // 4. Construct URL and Redirect
    const targetUrl = buildRecruiterUrl(recruiterId);
    
    // Visual feedback in console
    log(`⚡ Redirecting to Recruiter profile: ${recruiterId}`);
    console.log(`[SGA Velocity] Redirecting to Recruiter ID: ${recruiterId}`);
    
    // 5. Execute Redirect (replace prevents back button returning to public profile)
    window.location.replace(targetUrl);
    return true;
  } else {
    console.warn('[SGA Velocity] Could not find Recruiter ID on this profile. Staying on public profile.');
    return false;
  }
}

/**
 * Initialize Recruiter redirect check after page hydration.
 * Integrates with existing MutationObserver-based hydration detection.
 */
async function initRecruiterRedirect(): Promise<void> {
  // Only attempt redirect on public profile pages
  if (!isPublicProfilePage()) {
    return;
  }

  log('Checking for Recruiter redirect opportunity...');
  
  // Wait a bit for DOM to stabilize after hydration
  // This gives anchor tags time to populate with profileUrn data
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const didRedirect = await handleRecruiterRedirect();
  
  if (!didRedirect) {
    log('No redirect performed, continuing with normal scrape');
  }
}
```

### Step 3.2: Integrate Redirect into Main Init Flow

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, modify the existing `init()` function to call `initRecruiterRedirect()` BEFORE the normal scraping flow.

Find the existing init() function (search for "function init()"):
```

**Find this code:**
```typescript
function init(): void {
  log('Initializing scraper v3.1...');

  if (!isProfilePage()) {
    log('Not a profile page, waiting for navigation...');
    observeNavigation();
    return;
  }

  waitForHydration().then(() => scrapeAndSend());
  observeNavigation();
}
```

**Replace with:**
```typescript
function init(): void {
  log('Initializing scraper v3.1...');

  if (!isProfilePage()) {
    log('Not a profile page, waiting for navigation...');
    observeNavigation();
    return;
  }

  waitForHydration().then(async () => {
    // Check for Recruiter redirect FIRST (if enabled)
    // This happens before scraping to avoid unnecessary work
    await initRecruiterRedirect();
    
    // If we're still on this page (didn't redirect), proceed with normal scraping
    // Note: If redirect happened, this code won't execute due to page navigation
    scrapeAndSend();
  });
  
  observeNavigation();
}
```

### Step 3.3: Update Navigation Observer for Redirect

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, update the `observeNavigation()` function to also trigger redirect check on SPA navigation.

Find the existing observeNavigation() function (search for "function observeNavigation()"):
```

**Find this code:**
```typescript
function observeNavigation(): void {
  let lastUrl = window.location.href;

  const urlObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      log('URL changed:', currentUrl);
      lastUrl = currentUrl;

      if (isProfilePage()) {
        waitForHydration().then(() => scrapeAndSend());
      }
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (isProfilePage()) {
        waitForHydration().then(() => scrapeAndSend());
      }
    }, 500);
  });
}
```

**Replace with:**
```typescript
function observeNavigation(): void {
  let lastUrl = window.location.href;

  const urlObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      log('URL changed:', currentUrl);
      lastUrl = currentUrl;

      if (isProfilePage()) {
        waitForHydration().then(async () => {
          // Check for Recruiter redirect FIRST
          await initRecruiterRedirect();
          // If still here, do normal scraping
          scrapeAndSend();
        });
      }
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (isProfilePage()) {
        waitForHydration().then(async () => {
          await initRecruiterRedirect();
          scrapeAndSend();
        });
      }
    }, 500);
  });
}
```

### Step 3.4: Verify Redirect Logic Compiles

**Cursor Prompt:**
```text
Verify all redirect logic compiles correctly:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/content/linkedin-scraper.ts && echo "✓ LinkedIn scraper with redirect compiles"

# Verify new functions exist
grep -q "async function handleRecruiterRedirect" src/content/linkedin-scraper.ts && echo "✓ handleRecruiterRedirect function exists"
grep -q "async function initRecruiterRedirect" src/content/linkedin-scraper.ts && echo "✓ initRecruiterRedirect function exists"

# Verify redirect is called in init
grep -q "initRecruiterRedirect()" src/content/linkedin-scraper.ts && echo "✓ initRecruiterRedirect called in init flow"

# Verify window.location.replace usage
grep -q "window.location.replace" src/content/linkedin-scraper.ts && echo "✓ Uses window.location.replace for redirect"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 4: Update Settings UI

### Step 4.1: Add Recruiter Redirect Toggle to Settings Modal

**Cursor Prompt:**
```text
In `src/sidepanel/index.html`, add a new toggle for "Recruiter Redirect Mode" in the settings modal.

Find the Flux Capacitor settings section in the settings modal (should be after the Auto-Advance toggle):
```

**Find this HTML block (inside the settings modal):**
```html
<!-- The Flux Capacitor -->
<div class="border-t pt-4 mt-4">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-lg">⚡</span>
      <label class="text-sm font-semibold text-gray-800">The Flux Capacitor</label>
    </div>
    <input type="checkbox" id="flux-capacitor-toggle" class="w-4 h-4 text-savvy-green rounded">
  </div>
  <p class="text-xs text-gray-500 mb-2">Power-user mode for high-velocity outreach:</p>
  <ul class="text-xs text-gray-500 space-y-1 ml-4">
    <li>• ← → arrows go directly to LinkedIn profile</li>
    <li>• Same window navigation (no new tabs)</li>
    <li>• Auto-copies message to clipboard</li>
    <li>• <kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">S</kbd> marks as sent</li>
  </ul>
</div>
```

**Add this NEW section AFTER the Flux Capacitor section (still inside settings modal):**
```html
<!-- Recruiter Redirect ("The Bounce") -->
<div class="border-t pt-4 mt-4">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-lg">🎯</span>
      <label class="text-sm font-semibold text-gray-800">Recruiter Mode</label>
    </div>
    <input type="checkbox" id="recruiter-redirect-toggle" class="w-4 h-4 text-savvy-green rounded">
  </div>
  <p class="text-xs text-gray-500 mb-2">Auto-redirect to LinkedIn Recruiter profiles:</p>
  <ul class="text-xs text-gray-500 space-y-1 ml-4">
    <li>• Public profiles → Recruiter profiles</li>
    <li>• Automatic Entity URN extraction</li>
    <li>• Works with Flux Capacitor mode</li>
    <li>• Requires LinkedIn Recruiter access</li>
  </ul>
  <p class="text-xs text-amber-600 mt-2">⚠️ Only enable if you have LinkedIn Recruiter license</p>
</div>
```

### Step 4.2: Add Recruiter Mode Indicator to Header

**Cursor Prompt:**
```text
In `src/sidepanel/index.html`, add a visual indicator next to the Flux indicator in the header.

Find the Flux indicator in the header area:
```

**Find this HTML:**
```html
<span id="flux-indicator" class="hidden ml-2 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-semibold animate-pulse">
  ⚡ FLUX
</span>
```

**Add this NEW indicator AFTER the flux-indicator:**
```html
<span id="recruiter-indicator" class="hidden ml-2 text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-semibold">
  🎯 RECRUITER
</span>
```

### Step 4.3: Add DOM Element References in main.ts

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, add references to the new Recruiter Redirect DOM elements in the `elements` object.

Find the elements object (search for "const elements = {"):
```

**Find and add to the elements object (after fluxIndicator):**
```typescript
// Add these two new element references to the elements object:
recruiterRedirectToggle: document.getElementById('recruiter-redirect-toggle') as HTMLInputElement,
recruiterIndicator: document.getElementById('recruiter-indicator') as HTMLSpanElement,
```

**The full elements object should now include:**
```typescript
const elements = {
  // ... existing elements ...
  fluxCapacitorToggle: document.getElementById('flux-capacitor-toggle') as HTMLInputElement,
  fluxIndicator: document.getElementById('flux-indicator') as HTMLSpanElement,
  recruiterRedirectToggle: document.getElementById('recruiter-redirect-toggle') as HTMLInputElement,
  recruiterIndicator: document.getElementById('recruiter-indicator') as HTMLSpanElement,
  // ... rest of elements ...
};
```

### Step 4.4: Add Recruiter Indicator Helper Function

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, add a helper function to update the Recruiter indicator visibility.

Find the `updateFluxIndicator` function and add the new function right after it:
```

**Find this function:**
```typescript
/**
 * Update the Flux Capacitor indicator visibility
 */
function updateFluxIndicator(enabled: boolean): void {
  if (elements.fluxIndicator) {
    if (enabled) {
      elements.fluxIndicator.classList.remove('hidden');
    } else {
      elements.fluxIndicator.classList.add('hidden');
    }
  }
}
```

**Add this NEW function immediately after:**
```typescript
/**
 * Update the Recruiter Mode indicator visibility
 */
function updateRecruiterIndicator(enabled: boolean): void {
  if (elements.recruiterIndicator) {
    if (enabled) {
      elements.recruiterIndicator.classList.remove('hidden');
    } else {
      elements.recruiterIndicator.classList.add('hidden');
    }
  }
}
```

### Step 4.5: Update Settings Modal Population

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `openSettings()` function to populate the Recruiter Redirect toggle.

Find the openSettings function and update it:
```

**Find this code in openSettings():**
```typescript
// Populate current values
elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
elements.fluxCapacitorToggle.checked = settings.fluxCapacitorEnabled;
```

**Replace with:**
```typescript
// Populate current values
elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
elements.fluxCapacitorToggle.checked = settings.fluxCapacitorEnabled;
elements.recruiterRedirectToggle.checked = settings.recruiterRedirectEnabled;
```

### Step 4.6: Update Settings Save Handler

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `handleSaveSettings()` function to save the Recruiter Redirect setting.

Find the handleSaveSettings function:
```

**Find this code in handleSaveSettings():**
```typescript
const newSettings: AppSettings = {
  ...currentSettings,
  n8nWebhookUrl: elements.webhookUrlInput.value.trim(),
  n8nLoggingWebhookUrl: elements.loggingWebhookUrlInput.value.trim(),
  autoAdvanceOnSend: elements.autoAdvanceToggle.checked,
  fluxCapacitorEnabled: elements.fluxCapacitorToggle.checked,
};
```

**Replace with:**
```typescript
const newSettings: AppSettings = {
  ...currentSettings,
  n8nWebhookUrl: elements.webhookUrlInput.value.trim(),
  n8nLoggingWebhookUrl: elements.loggingWebhookUrlInput.value.trim(),
  autoAdvanceOnSend: elements.autoAdvanceToggle.checked,
  fluxCapacitorEnabled: elements.fluxCapacitorToggle.checked,
  recruiterRedirectEnabled: elements.recruiterRedirectToggle.checked,
};
```

**Also find and update the indicator calls at the end of handleSaveSettings():**
```typescript
// Update indicators
updateFluxIndicator(newSettings.fluxCapacitorEnabled);
updateRecruiterIndicator(newSettings.recruiterRedirectEnabled);
```

### Step 4.7: Update Init Function to Show Indicator

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `init()` function to initialize the Recruiter indicator.

Find this code near the end of the init() function (search for "Initialize Flux Capacitor indicator"):
```

**Find this code:**
```typescript
// 9. Initialize Flux Capacitor indicator
const settings = await getSettings();
updateFluxIndicator(settings.fluxCapacitorEnabled);
```

**Replace with:**
```typescript
// 9. Initialize mode indicators
const settings = await getSettings();
updateFluxIndicator(settings.fluxCapacitorEnabled);
updateRecruiterIndicator(settings.recruiterRedirectEnabled);
```

### Step 4.8: Verify UI Changes

**Cursor Prompt:**
```text
Verify all UI changes compile and the new elements exist:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/sidepanel/main.ts && echo "✓ Main.ts compiles"

# Verify new toggle exists in HTML
grep -q "recruiter-redirect-toggle" src/sidepanel/index.html && echo "✓ Recruiter toggle in HTML"
grep -q "recruiter-indicator" src/sidepanel/index.html && echo "✓ Recruiter indicator in HTML"

# Verify element references in main.ts
grep -q "recruiterRedirectToggle" src/sidepanel/main.ts && echo "✓ recruiterRedirectToggle element reference"
grep -q "recruiterIndicator" src/sidepanel/main.ts && echo "✓ recruiterIndicator element reference"

# Verify helper function exists
grep -q "updateRecruiterIndicator" src/sidepanel/main.ts && echo "✓ updateRecruiterIndicator function exists"

# Verify setting is saved
grep -q "recruiterRedirectEnabled: elements.recruiterRedirectToggle.checked" src/sidepanel/main.ts && echo "✓ Setting saved in handleSaveSettings"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 5: Integration with Flux Capacitor

### Step 5.1: Verify No Conflicts

**Cursor Prompt:**
```text
Verify that Recruiter Redirect and Flux Capacitor can work together without conflicts.

The integration is designed to be conflict-free because:
1. Recruiter Redirect runs in the CONTENT SCRIPT when a page loads
2. Flux Capacitor runs in the SIDEPANEL when navigating between leads

Flow when BOTH are enabled:
1. User clicks Next in sidebar (Flux Capacitor enabled)
2. Flux navigates to linkedin.com/in/username (public profile)
3. Content script loads on the public profile page
4. Content script detects Recruiter Redirect is enabled
5. Content script finds the Recruiter ID
6. Content script redirects to /talent/profile/ACo...
7. User lands on Recruiter profile (1-2 second delay is expected)

No code changes needed - this is verification only.
```

```bash
echo "=== Verifying Flux + Recruiter Integration ==="

# Verify content script handles redirect before scrape
grep -A 5 "waitForHydration().then" src/content/linkedin-scraper.ts | grep -q "initRecruiterRedirect" && \
  echo "✓ Redirect check happens before scrape"

# Verify sidepanel navigates to public URL (Flux behavior unchanged)
grep -q "linkedInUrl || lead.LinkedIn_Profile_Apollo__c" src/sidepanel/main.ts && \
  echo "✓ Flux still navigates to public LinkedIn URL"

# Verify settings are independent
grep -q "fluxCapacitorEnabled" src/lib/storage.ts && \
grep -q "recruiterRedirectEnabled" src/lib/storage.ts && \
  echo "✓ Settings are independent (can enable both)"

echo ""
echo "Integration verified. Both modes can be enabled simultaneously."
echo "Expected behavior: Flux navigates to public → Content script bounces to Recruiter"
```

### Step 5.2: Add User Guidance in Settings UI

**Cursor Prompt:**
```text
Add a helpful note in the settings UI about using both modes together.

In `src/sidepanel/index.html`, update the Recruiter Mode section to mention Flux compatibility:
```

**This is already included in the HTML we added in Step 4.1:**
```html
<li>• Works with Flux Capacitor mode</li>
```

**No additional changes needed. The UI already indicates compatibility.**

---

## Phase 6: Build and Test

### Step 6.1: Full Build

**Cursor Prompt:**
```text
Build the extension and verify no errors:
```

```bash
# Clean build
npm run build

# Verify build output exists
test -d dist && echo "✓ dist/ folder created"
test -f dist/manifest.json && echo "✓ manifest.json in dist/"
test -f dist/content/linkedin-scraper.js && echo "✓ linkedin-scraper.js built"
test -f dist/sidepanel/main.js && echo "✓ main.js built"

# Check for TypeScript errors in build log
echo ""
echo "Build complete. Check above for any errors."
```

### Step 6.2: Reload Extension in Chrome

```text
Manual steps to reload the extension:

1. Open chrome://extensions/
2. Find "SGA Velocity Sidebar"
3. Click the refresh icon (↻) to reload
4. If errors, click "Errors" button to see details
```

### Step 6.3: Test Checklist

**Cursor Prompt:**
```text
Use this test checklist to verify the Recruiter Redirect feature works correctly.
```

**Settings Tests:**
- [ ] Open settings modal (⚙️ icon)
- [ ] Recruiter Mode toggle is visible (🎯 icon)
- [ ] Toggle can be enabled/disabled
- [ ] Settings save successfully (toast appears)
- [ ] Recruiter indicator (🎯 RECRUITER) appears in header when enabled
- [ ] Indicator hides when disabled

**Redirect Tests (Recruiter Mode ON):**
- [ ] Navigate to `linkedin.com/in/any-profile/`
- [ ] Page automatically redirects to `/talent/profile/ACo...`
- [ ] Redirect happens within 1-3 seconds
- [ ] Console shows: `[SGA Velocity] Redirecting to Recruiter ID: ACo...`
- [ ] Back button does NOT return to public profile (uses replace)

**Redirect Tests (Recruiter Mode OFF):**
- [ ] Navigate to `linkedin.com/in/any-profile/`
- [ ] Page stays on public profile (no redirect)
- [ ] Console shows: `Recruiter redirect disabled in settings`

**Edge Cases:**
- [ ] Already on Recruiter page (`/talent/profile/`) → No redirect attempt
- [ ] Profile with no extractable ID → Console warning, stays on public profile
- [ ] Non-profile page → No redirect logic runs

**Flux Capacitor + Recruiter Mode (BOTH ON):**
- [ ] Press → arrow to navigate to next lead
- [ ] Sidepanel navigates to public LinkedIn profile
- [ ] Content script immediately redirects to Recruiter profile
- [ ] Total time from arrow press to Recruiter page: 2-4 seconds
- [ ] Message was auto-copied (Flux feature)

**Error Handling:**
- [ ] Extension context invalidated (reload extension) → No errors thrown
- [ ] Storage read fails → Graceful fallback, no redirect
- [ ] Chrome console has no unhandled errors

---

## Phase 7: Future Enhancement - Write-Back

### Step 7.1: Design Document for Write-Back Feature

**Note:** This is a FUTURE enhancement. Do not implement yet.

**Purpose:** Cache discovered Recruiter URLs back to Salesforce to skip the "bounce" on future visits.

**Proposed Flow:**
1. Recruiter redirect occurs successfully
2. Content script on Recruiter page sends message to service worker
3. Service worker posts to n8n logging webhook with recruiter URL
4. n8n workflow updates Lead record's `Recruiter_Profile_URL__c` field
5. On next visit, extension checks Salesforce first
6. If Recruiter URL exists, navigate directly (skip public profile)

**Implementation would require:**
- New Salesforce field: `Recruiter_Profile_URL__c`
- n8n workflow update for write-back
- Lead data structure update to include recruiter URL
- Logic in Flux Capacitor to use Recruiter URL when available

**Do NOT implement this phase yet. Wait for team approval and Salesforce schema changes.**

---

## Rollback Instructions

If something goes wrong, restore from backups:

```bash
# Restore all backups
cp src/lib/storage.ts.backup.recruiter src/lib/storage.ts
cp src/content/linkedin-scraper.ts.backup.recruiter src/content/linkedin-scraper.ts
cp src/sidepanel/main.ts.backup.recruiter src/sidepanel/main.ts
cp src/sidepanel/index.html.backup.recruiter src/sidepanel/index.html

# Rebuild
npm run build

echo "✓ Rollback complete"
```

---

## Complete Code Summary

### Files Modified

| File | Changes |
|------|---------|
| `src/lib/storage.ts` | Added `recruiterRedirectEnabled` to `AppSettings` interface and `DEFAULT_SETTINGS` |
| `src/content/linkedin-scraper.ts` | Added `findRecruiterId()`, `isPublicProfilePage()`, `buildRecruiterUrl()`, `handleRecruiterRedirect()`, `initRecruiterRedirect()`. Updated `init()` and `observeNavigation()` |
| `src/sidepanel/index.html` | Added Recruiter Mode toggle section and header indicator |
| `src/sidepanel/main.ts` | Added element references, `updateRecruiterIndicator()`, updated settings handlers |

### New Functions Added

```typescript
// linkedin-scraper.ts
function findRecruiterId(): string | null { /* Dragnet scraper */ }
function isPublicProfilePage(): boolean { /* URL check */ }
function buildRecruiterUrl(recruiterId: string): string { /* URL builder */ }
async function handleRecruiterRedirect(): Promise<boolean> { /* Main handler */ }
async function initRecruiterRedirect(): Promise<void> { /* Init wrapper */ }

// main.ts
function updateRecruiterIndicator(enabled: boolean): void { /* UI helper */ }
```

### Settings Changes

```typescript
// New setting added
interface AppSettings {
  // ... existing ...
  recruiterRedirectEnabled: boolean;  // NEW
}

// Default value
const DEFAULT_SETTINGS = {
  // ... existing ...
  recruiterRedirectEnabled: false  // NEW - opt-in required
};
```

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.1 | Dec 2024 | Fixed function name references (`openSettings()`), added storage access note, added line number disclaimer |
| 1.0 | Dec 2024 | Initial Recruiter Redirect implementation guide |

---

*"The only way to do great work is to love what you do." - But also to automate the boring parts.*
