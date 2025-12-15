# Recruiter Redirect Implementation Guide v1.2
## "The Bounce" - Automated Public-to-Recruiter Profile Redirection

**Feature Overview:** Automatically redirect users from public LinkedIn profiles (`/in/`) to LinkedIn Recruiter profiles (`/talent/profile/`) by scraping the hidden Member ID (Entity URN) from the DOM.

**New in v1.2:** Recruiter Profile Scraper + Auto-Open Message Composer

**Compatibility:** Works independently or alongside Flux Capacitor mode.

---

## Table of Contents

1. [Pre-Implementation Checklist](#phase-0-pre-implementation-checklist)
2. [Phase 1: Update Storage Layer](#phase-1-update-storage-layer)
3. [Phase 2: Implement Recruiter ID Scraper](#phase-2-implement-recruiter-id-scraper)
4. [Phase 3: Implement Redirect Logic](#phase-3-implement-redirect-logic)
5. [**Phase 4: Recruiter Profile Scraper (NEW)**](#phase-4-recruiter-profile-scraper)
6. [**Phase 5: Auto-Open Message Composer (NEW)**](#phase-5-auto-open-message-composer)
7. [Phase 6: Update Settings UI](#phase-6-update-settings-ui)
8. [Phase 7: Integration with Flux Capacitor](#phase-7-integration-with-flux-capacitor)
9. [Phase 8: Build and Test](#phase-8-build-and-test)
10. [Phase 9: Future Enhancement - Write-Back](#phase-9-future-enhancement---write-back)
11. [Rollback Instructions](#rollback-instructions)

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

### Step 1.1: Add Recruiter Settings to AppSettings Interface

**Cursor Prompt:**
```text
In `src/lib/storage.ts`, update the AppSettings interface to include the new Recruiter settings:
- `recruiterRedirectEnabled` - Toggle for the redirect/bounce feature
- `autoOpenMessageComposer` - Auto-click the Message button after scraping

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
  autoOpenMessageComposer: boolean;  // Auto-click Message button on Recruiter profile
}
```

### Step 1.2: Update DEFAULT_SETTINGS

**Cursor Prompt:**
```text
In `src/lib/storage.ts`, update the DEFAULT_SETTINGS constant to include default values for both Recruiter settings.

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
  recruiterRedirectEnabled: false,  // Disabled by default - requires LinkedIn Recruiter access
  autoOpenMessageComposer: false  // Disabled by default - sub-feature of Recruiter Mode
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

# Verify the new settings are present
grep -q "recruiterRedirectEnabled" src/lib/storage.ts && echo "✓ recruiterRedirectEnabled found"
grep -q "autoOpenMessageComposer" src/lib/storage.ts && echo "✓ autoOpenMessageComposer found"
grep -q "recruiterRedirectEnabled: false" src/lib/storage.ts && echo "✓ recruiterRedirectEnabled default set"
grep -q "autoOpenMessageComposer: false" src/lib/storage.ts && echo "✓ autoOpenMessageComposer default set"
```

**Gate:** All grep commands must return success before proceeding.

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
    log('Found Recruiter ID via body HTML scan:', bodyMatch[1]);
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
 * Check if the current page is a LinkedIn Recruiter profile
 */
function isRecruiterProfilePage(): boolean {
  const url = window.location.href;
  return url.includes('linkedin.com/talent/profile/');
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
grep -q "function isRecruiterProfilePage" src/content/linkedin-scraper.ts && echo "✓ isRecruiterProfilePage function exists"
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
    // Note: Settings are stored in chrome.storage.local under 'settings' key
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

Find the existing init() function (search for "function init"):
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
    // Check for Recruiter redirect FIRST (if enabled and on public profile)
    // This happens before scraping to avoid unnecessary work
    if (isPublicProfilePage()) {
      await initRecruiterRedirect();
    }
    
    // If we're still on this page (didn't redirect), proceed with scraping
    // Note: If redirect happened, this code won't execute due to page navigation
    // Use appropriate scraper based on page type
    if (isRecruiterProfilePage()) {
      await scrapeRecruiterAndSend();
    } else {
      scrapeAndSend();
    }
  });
  
  observeNavigation();
}
```

### Step 3.3: Update Navigation Observer for Redirect

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, update the `observeNavigation()` function to also trigger redirect check on SPA navigation and use appropriate scraper.

Find the existing observeNavigation() function (search for "function observeNavigation"):
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
          // Check for Recruiter redirect on public profiles
          if (isPublicProfilePage()) {
            await initRecruiterRedirect();
          }
          // Use appropriate scraper based on page type
          if (isRecruiterProfilePage()) {
            await scrapeRecruiterAndSend();
          } else {
            scrapeAndSend();
          }
        });
      }
    }
  });

  urlObserver.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', () => {
    setTimeout(() => {
      if (isProfilePage()) {
        waitForHydration().then(async () => {
          if (isPublicProfilePage()) {
            await initRecruiterRedirect();
          }
          if (isRecruiterProfilePage()) {
            await scrapeRecruiterAndSend();
          } else {
            scrapeAndSend();
          }
        });
      }
    }, 500);
  });
}
```

### Step 3.4: Update isProfilePage to Include Recruiter Pages

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, verify the `isProfilePage()` function includes Recruiter pages.

Find the existing isProfilePage() function:
```

**Find this code:**
```typescript
function isProfilePage(): boolean {
  const url = window.location.href;
  return (
    url.includes('linkedin.com/in/') ||
    url.includes('linkedin.com/talent/') ||
    url.includes('linkedin.com/recruiter/')
  );
}
```

**This should already include `/talent/` - verify it does. If not, update it.**

### Step 3.5: Verify Redirect Logic Compiles

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

## Phase 4: Recruiter Profile Scraper

### Step 4.1: Add Recruiter-Specific Scraping Function

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, add a new function called `scrapeRecruiterProfile()` that extracts data from LinkedIn Recruiter pages using Recruiter-specific DOM selectors.

**Important Note on DOM Selectors:**
LinkedIn's DOM structure can change over time. This implementation includes multiple fallback strategies for each data field to ensure reliability:
- Each extraction function tries multiple selectors in priority order
- Primary selectors use LinkedIn's class names (may change)
- Fallback selectors use data-test attributes (more stable)
- Final fallbacks use semantic patterns (text content, structure)
- All functions gracefully return null if extraction fails (no crashes)

If LinkedIn updates their UI, you may need to adjust selectors, but the fallback structure will minimize breakage.

Add this function AFTER the existing `scrapeProfile()` function:
```

**Add this new function:**
```typescript
// -----------------------------------------------------------------------------
// Recruiter Profile Scraping
// -----------------------------------------------------------------------------

/**
 * Scrapes profile data from LinkedIn Recruiter pages (/talent/profile/...)
 * Uses completely different DOM selectors than public profiles.
 * 
 * Recruiter DOM is structured differently:
 * - Name + Accreditations combined in title/lockup
 * - Location has leading bullet point
 * - Education uses data-test attributes
 * - Employment in subtitle lockup
 */
function scrapeRecruiterProfile(): LinkedInProfile | null {
  try {
    log('Scraping Recruiter profile...');

    // Extract name and accreditations (often combined)
    const { fullName, firstName, lastName, accreditations } = extractRecruiterNameAndAccreditations();
    
    if (!fullName) {
      log('Could not extract name from Recruiter profile');
      return null;
    }

    // Extract other fields
    const headline = extractRecruiterHeadline();
    const location = extractRecruiterLocation();
    const company = extractRecruiterCompany();
    const education = extractRecruiterEducation();

    const profile: LinkedInProfile = {
      fullName,
      firstName,
      lastName,
      headline: headline || undefined,
      location: location || undefined,
      company: company || undefined,
      accreditations: accreditations.length > 0 ? accreditations : undefined,
      profileUrl: window.location.href.split('?')[0],
    };

    log('Recruiter profile scraped:', profile);
    return profile;

  } catch (error) {
    console.error('[LinkedIn Scraper] Error scraping Recruiter profile:', error);
    return null;
  }
}

/**
 * Extract name and accreditations from Recruiter profile.
 * In Recruiter, these are often combined: "John Smith, CFP®, CFA"
 * 
 * Fallback Strategy:
 * 1. Primary: .artdeco-entity-lockup__title element (LinkedIn class - may change)
 * 2. Fallback: Page <title> tag (always present, more stable)
 * 
 * Both sources are parsed to separate name from accreditations using comma delimiter.
 */
function extractRecruiterNameAndAccreditations(): {
  fullName: string;
  firstName: string;
  lastName: string;
  accreditations: string[];
} {
  let rawText = '';

  // Strategy 1: Try the lockup title element (primary - most reliable when available)
  const lockupTitle = document.querySelector('.artdeco-entity-lockup__title');
  if (lockupTitle) {
    rawText = lockupTitle.textContent?.trim() || '';
    log('Found name in lockup title:', rawText);
  }

  // Strategy 2: Fallback to page title (always present, more stable)
  // This ensures we can extract name even if LinkedIn changes their class names
  if (!rawText) {
    const pageTitle = document.querySelector('title');
    if (pageTitle) {
      // Remove " | LinkedIn Recruiter" suffix if present
      rawText = pageTitle.textContent?.replace(/\s*\|.*$/, '').trim() || '';
      log('Found name in page title (fallback):', rawText);
    }
  }

  if (!rawText) {
    // Both strategies failed - return empty (graceful degradation)
    return { fullName: '', firstName: '', lastName: '', accreditations: [] };
  }

  // Parse name and accreditations
  // Pattern: "Megan (Spain) Manzi, CFP®" or "John Smith, CFA, CFP®"
  const parts = rawText.split(',').map(p => p.trim());
  
  // First part is always the name
  const fullName = parts[0] || '';
  
  // Remaining parts are accreditations
  const accreditations = parts.slice(1).filter(p => p.length > 0);

  // Split full name into first/last
  const { firstName, lastName } = splitName(fullName);

  return { fullName, firstName, lastName, accreditations };
}

/**
 * Split a full name into first and last name components.
 * Handles parenthetical nicknames: "Megan (Spain) Manzi" -> First: "Megan", Last: "Manzi"
 */
function splitName(fullName: string): { firstName: string; lastName: string } {
  // Remove parenthetical content for splitting purposes
  const cleanedName = fullName.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  const nameParts = cleanedName.split(/\s+/);
  
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  }
  
  // First word is first name, last word is last name
  const firstName = nameParts[0];
  const lastName = nameParts[nameParts.length - 1];
  
  return { firstName, lastName };
}

/**
 * Extract headline/title from Recruiter profile.
 * 
 * Fallback Strategy:
 * 1. Primary: .artdeco-entity-lockup__subtitle (LinkedIn class - may change)
 * 2. Fallback: [data-test-latest-position] (data-test attribute - more stable)
 * 
 * If both fail, returns null (graceful degradation)
 */
function extractRecruiterHeadline(): string | null {
  // Strategy 1: Try subtitle lockup (primary selector)
  const subtitle = document.querySelector('.artdeco-entity-lockup__subtitle');
  if (subtitle) {
    const text = subtitle.textContent?.trim();
    if (text) {
      log('Found headline in subtitle:', text);
      return text;
    }
  }

  // Strategy 2: Fallback to data-test attribute (more stable)
  const position = document.querySelector('[data-test-latest-position]');
  if (position) {
    const text = position.textContent?.trim();
    if (text) {
      log('Found headline in latest position:', text);
      return text;
    }
  }

  // No fallback found - return null (won't crash)
  return null;
}

/**
 * Extract location from Recruiter profile.
 * Location often has a leading bullet point that needs removal.
 * 
 * Fallback Strategy:
 * 1. Primary: .text-highlighter__text or [data-test-text-highlighter-text-only] (handles bullet prefix)
 * 2. Fallback: [data-test-location] (data-test attribute - more stable)
 * 
 * DOM Example: <span class="text-highlighter__text"> · Birmingham, Alabama, United States</span>
 */
function extractRecruiterLocation(): string | null {
  // Strategy 1: Primary selector - text-highlighter element (handles bullet prefix)
  const highlighter = document.querySelector('.text-highlighter__text, [data-test-text-highlighter-text-only]');
  if (highlighter) {
    let text = highlighter.textContent?.trim() || '';
    
    // Remove leading bullet point/dot if present
    text = text.replace(/^[·•]\s*/, '').trim();
    
    if (text) {
      log('Found location:', text);
      return text;
    }
  }

  // Strategy 2: Fallback to data-test attribute (more stable if LinkedIn changes classes)
  const metaLocation = document.querySelector('[data-test-location]');
  if (metaLocation) {
    const text = metaLocation.textContent?.trim();
    if (text) {
      log('Found location in metadata:', text);
      return text;
    }
  }

  // No fallback found - return null (graceful degradation)
  return null;
}

/**
 * Extract current company from Recruiter profile.
 * 
 * Fallback Strategy:
 * 1. Primary: [data-test-current-company] or [data-test-latest-company] (data-test - most stable)
 * 2. Fallback: Parse "Title at Company" pattern from subtitle (semantic extraction)
 * 
 * This dual-strategy approach ensures we can extract company even if LinkedIn changes their structure.
 */
function extractRecruiterCompany(): string | null {
  // Strategy 1: Primary - data-test attributes (most stable, LinkedIn's official test attributes)
  const companyEl = document.querySelector('[data-test-current-company], [data-test-latest-company]');
  if (companyEl) {
    const text = companyEl.textContent?.trim();
    if (text) {
      log('Found company:', text);
      return text;
    }
  }

  // Strategy 2: Fallback - Parse from subtitle text pattern (semantic extraction)
  // Handles cases like "Financial Advisor at Acme Wealth" -> extracts "Acme Wealth"
  const subtitle = document.querySelector('.artdeco-entity-lockup__subtitle');
  if (subtitle) {
    const text = subtitle.textContent?.trim() || '';
    const atMatch = text.match(/\bat\s+(.+)$/i);
    if (atMatch && atMatch[1]) {
      log('Found company from subtitle pattern:', atMatch[1]);
      return atMatch[1].trim();
    }
  }

  // No fallback found - return null (graceful degradation)
  return null;
}

/**
 * Extract education from Recruiter profile.
 * 
 * Fallback Strategy:
 * 1. Primary: [data-test-latest-education] (direct data-test attribute - most stable)
 * 2. Fallback: Search within .artdeco-entity-lockup__caption (nested structure)
 * 
 * Note: Education is extracted but not stored in LinkedInProfile interface (for future use).
 * 
 * DOM Example: <span data-test-latest-education>Auburn University</span>
 */
function extractRecruiterEducation(): string | null {
  // Strategy 1: Primary - direct data-test attribute (most reliable)
  const education = document.querySelector('[data-test-latest-education]');
  if (education) {
    const text = education.textContent?.trim();
    if (text) {
      log('Found education:', text);
      return text;
    }
  }

  // Strategy 2: Fallback - search within caption lockup (handles nested structures)
  const caption = document.querySelector('.artdeco-entity-lockup__caption');
  if (caption) {
    const eduSpan = caption.querySelector('[data-test-latest-education]');
    if (eduSpan) {
      const text = eduSpan.textContent?.trim();
      if (text) {
        log('Found education in caption:', text);
        return text;
      }
    }
  }

  // No fallback found - return null (graceful degradation)
  return null;
}
```

### Step 4.2: Add scrapeRecruiterAndSend Function

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, add a wrapper function that scrapes the Recruiter profile and sends it to the service worker.

Add this function AFTER `scrapeRecruiterProfile()`:
```

**Add this new function:**
```typescript
/**
 * Scrape Recruiter profile and send to service worker.
 * Also handles auto-open message composer if enabled.
 */
async function scrapeRecruiterAndSend(): Promise<void> {
  log('Scraping Recruiter profile and sending...');
  
  const profile = scrapeRecruiterProfile();

  if (profile) {
    log('Recruiter profile scraped:', profile.fullName);
    sendProfileToServiceWorker(profile);
    
    // Check if auto-open message composer is enabled
    await handleAutoOpenMessageComposer();
  } else {
    log('Failed to scrape Recruiter profile');
  }
}
```

### Step 4.3: Verify Recruiter Scraper Compiles

**Cursor Prompt:**
```text
Verify the Recruiter scraper functions compile correctly:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/content/linkedin-scraper.ts && echo "✓ LinkedIn scraper with Recruiter support compiles"

# Verify new functions exist
grep -q "function scrapeRecruiterProfile" src/content/linkedin-scraper.ts && echo "✓ scrapeRecruiterProfile function exists"
grep -q "function extractRecruiterNameAndAccreditations" src/content/linkedin-scraper.ts && echo "✓ extractRecruiterNameAndAccreditations exists"
grep -q "function extractRecruiterLocation" src/content/linkedin-scraper.ts && echo "✓ extractRecruiterLocation exists"
grep -q "function extractRecruiterCompany" src/content/linkedin-scraper.ts && echo "✓ extractRecruiterCompany exists"
grep -q "function extractRecruiterEducation" src/content/linkedin-scraper.ts && echo "✓ extractRecruiterEducation exists"
grep -q "async function scrapeRecruiterAndSend" src/content/linkedin-scraper.ts && echo "✓ scrapeRecruiterAndSend exists"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 5: Auto-Open Message Composer

### Step 5.1: Add Auto-Open Message Composer Function

**Cursor Prompt:**
```text
In `src/content/linkedin-scraper.ts`, add a function that automatically clicks the Message button on Recruiter profiles when the setting is enabled.

**Important Note on Message Button Detection:**
The Message button detection uses a 3-level fallback strategy to handle LinkedIn UI changes:
1. Primary: Find envelope icon, navigate to parent button (most reliable)
2. Fallback: Semantic search for buttons with "Message" text + icon
3. Fallback: Use data-test attributes or aria-labels (most stable)

This ensures the button is found even if LinkedIn changes their component structure, class names, or DOM hierarchy. If all strategies fail, the function logs a warning but doesn't crash.

Add this function AFTER `scrapeRecruiterAndSend()`:
```

**Add this new function:**
```typescript
// -----------------------------------------------------------------------------
// Auto-Open Message Composer
// -----------------------------------------------------------------------------

/**
 * Automatically clicks the "Message" button on Recruiter profiles if enabled.
 * The button is identified by the envelope icon inside it.
 * 
 * DOM Structure:
 * <button ...>
 *   <li-icon type="envelope-icon" ...>
 *     <svg>...</svg>
 *   </li-icon>
 *   <span>Message</span>
 * </button>
 */
async function handleAutoOpenMessageComposer(): Promise<void> {
  // Check if we're on a Recruiter profile
  if (!isRecruiterProfilePage()) {
    return;
  }

  // Check user preference
  try {
    const result = await chrome.storage.local.get(['settings']);
    const settings = result.settings || {};
    
    if (!settings.autoOpenMessageComposer) {
      log('Auto-open message composer disabled');
      return;
    }
  } catch (error) {
    log('Error reading settings for auto-open:', error);
    return;
  }

  log('Auto-open message composer enabled, searching for Message button...');

  // Wait a moment for the button to render (Recruiter pages can be slow)
  await new Promise(resolve => setTimeout(resolve, 800));

  // Find the Message button by its icon
  const messageButton = findMessageButton();

  if (messageButton) {
    log('Found Message button, clicking...');
    
    // Small delay to ensure button is interactive
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      messageButton.click();
      console.log('[SGA Velocity] ✉️ Auto-opened message composer');
    } catch (error) {
      console.error('[SGA Velocity] Failed to click Message button:', error);
    }
  } else {
    log('Message button not found on this page');
  }
}

/**
 * Find the Message button on Recruiter profile.
 * 
 * Fallback Strategy (3 levels):
 * 1. Primary: Find envelope icon, navigate to parent button (most reliable)
 * 2. Fallback: Search all buttons for "Message" text + icon (semantic search)
 * 3. Fallback: Use data-test attributes or aria-labels (accessibility attributes)
 * 
 * This multi-strategy approach ensures the button is found even if LinkedIn changes:
 * - Icon component structure
 * - Button class names
 * - DOM hierarchy
 */
function findMessageButton(): HTMLElement | null {
  // Strategy 1: Find button containing envelope icon (most reliable - icon is stable)
  const envelopeIcon = document.querySelector('li-icon[type="envelope-icon"]');
  if (envelopeIcon) {
    // Navigate up to the button element (handles any DOM structure)
    const button = envelopeIcon.closest('button');
    if (button) {
      log('Found Message button via envelope icon');
      return button as HTMLElement;
    }
  }

  // Strategy 2: Semantic search - find button with "Message" text and icon
  // This works even if icon structure changes
  const buttons = document.querySelectorAll('button');
  for (const button of buttons) {
    const text = button.textContent?.toLowerCase() || '';
    const hasIcon = button.querySelector('li-icon[type="envelope-icon"], svg');
    
    if (text.includes('message') && hasIcon) {
      log('Found Message button via text + icon search');
      return button as HTMLElement;
    }
  }

  // Strategy 3: Fallback to data-test attributes or aria-labels (accessibility - most stable)
  // These are less likely to change as they're used for testing/accessibility
  const actionButton = document.querySelector(
    'button[data-test-message-button], ' +
    'button.profile-actions__message, ' +
    'button[aria-label*="Message"]'
  );
  if (actionButton) {
    log('Found Message button via data-test/aria-label');
    return actionButton as HTMLElement;
  }

  // All strategies failed - return null (won't crash, will log warning)
  return null;
}

/**
 * Alternative: Use MutationObserver to wait for Message button if not immediately available.
 * Call this if findMessageButton() returns null and you want to retry.
 */
function waitForMessageButton(timeoutMs: number = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // Check immediately
    const button = findMessageButton();
    if (button) {
      resolve(button);
      return;
    }

    // Set up observer
    const observer = new MutationObserver(() => {
      const btn = findMessageButton();
      if (btn) {
        observer.disconnect();
        resolve(btn);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}
```

### Step 5.2: Verify Auto-Open Functions Compile

**Cursor Prompt:**
```text
Verify the auto-open message composer functions compile correctly:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/content/linkedin-scraper.ts && echo "✓ LinkedIn scraper with auto-open compiles"

# Verify new functions exist
grep -q "async function handleAutoOpenMessageComposer" src/content/linkedin-scraper.ts && echo "✓ handleAutoOpenMessageComposer function exists"
grep -q "function findMessageButton" src/content/linkedin-scraper.ts && echo "✓ findMessageButton function exists"
grep -q "function waitForMessageButton" src/content/linkedin-scraper.ts && echo "✓ waitForMessageButton function exists"

# Verify envelope icon selector
grep -q "envelope-icon" src/content/linkedin-scraper.ts && echo "✓ Envelope icon selector present"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 6: Update Settings UI

### Step 6.1: Add Recruiter Mode Section to Settings Modal

**Cursor Prompt:**
```text
In `src/sidepanel/index.html`, add a new "Recruiter Mode" section to the settings modal with both toggles:
- Recruiter Redirect (The Bounce)
- Auto-Open Message Composer (sub-option)

Find the Flux Capacitor settings section in the settings modal and add the Recruiter section AFTER it:
```

**Add this NEW section AFTER the Flux Capacitor section:**
```html
<!-- Recruiter Mode ("The Bounce") -->
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
    <li>• Scrapes Recruiter-specific data</li>
    <li>• Works with Flux Capacitor mode</li>
  </ul>
  <p class="text-xs text-amber-600 mt-2 mb-3">⚠️ Requires LinkedIn Recruiter license</p>
  
  <!-- Sub-option: Auto-Open Message Composer -->
  <div class="ml-6 border-l-2 border-gray-200 pl-3 mt-3">
    <div class="flex items-center justify-between mb-1">
      <div class="flex items-center gap-2">
        <span class="text-sm">✉️</span>
        <label class="text-xs font-medium text-gray-700">Auto-Open Message Composer</label>
      </div>
      <input type="checkbox" id="auto-open-message-toggle" class="w-3 h-3 text-savvy-green rounded">
    </div>
    <p class="text-xs text-gray-400">Automatically opens the message dialog after scraping</p>
  </div>
</div>
```

### Step 6.2: Add Recruiter Mode Indicator to Header

**Cursor Prompt:**
```text
In `src/sidepanel/index.html`, add a visual indicator next to the Flux indicator in the header.

Find the Flux indicator in the header area and add the Recruiter indicator AFTER it:
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

### Step 6.3: Add DOM Element References in main.ts

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, add references to the new Recruiter Mode DOM elements in the `elements` object.

Find the elements object and add the new element references:
```

**Add these element references to the elements object:**
```typescript
// Add these new element references (after fluxIndicator):
recruiterRedirectToggle: document.getElementById('recruiter-redirect-toggle') as HTMLInputElement,
autoOpenMessageToggle: document.getElementById('auto-open-message-toggle') as HTMLInputElement,
recruiterIndicator: document.getElementById('recruiter-indicator') as HTMLSpanElement,
```

### Step 6.4: Add Recruiter Indicator Helper Function

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, add a helper function to update the Recruiter indicator visibility.

Find the `updateFluxIndicator` function and add the new function right after it:
```

**Add this NEW function after updateFluxIndicator:**
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

### Step 6.5: Update Settings Modal Population (openSettings function)

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `openSettings()` function to populate the Recruiter toggles.

Find the openSettings function and update the toggle population section:
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
elements.autoOpenMessageToggle.checked = settings.autoOpenMessageComposer;

// Auto-open is only relevant when Recruiter mode is enabled
elements.autoOpenMessageToggle.disabled = !settings.recruiterRedirectEnabled;
```

### Step 6.6: Add Toggle Dependency Logic

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, add an event listener to enable/disable the auto-open toggle based on Recruiter mode.

Add this in the setupEventListeners() function or after the openSettings() function:
```

**Add this event listener (in setupEventListeners or inline in openSettings):**
```typescript
// Add recruiter mode toggle dependency
elements.recruiterRedirectToggle.addEventListener('change', () => {
  elements.autoOpenMessageToggle.disabled = !elements.recruiterRedirectToggle.checked;
  // If disabling recruiter mode, also disable auto-open
  if (!elements.recruiterRedirectToggle.checked) {
    elements.autoOpenMessageToggle.checked = false;
  }
});
```

### Step 6.7: Update Settings Save Handler

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `handleSaveSettings()` function to save both Recruiter settings.

Find the handleSaveSettings function and update the newSettings object:
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
  autoOpenMessageComposer: elements.autoOpenMessageToggle.checked,
};
```

**Also find and update the indicator calls at the end of handleSaveSettings():**
```typescript
// Update indicators
updateFluxIndicator(newSettings.fluxCapacitorEnabled);
updateRecruiterIndicator(newSettings.recruiterRedirectEnabled);
```

### Step 6.8: Update Init Function to Show Indicators

**Cursor Prompt:**
```text
In `src/sidepanel/main.ts`, update the `init()` function to initialize the Recruiter indicator.

Find the indicator initialization code in init():
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

### Step 6.9: Verify UI Changes

**Cursor Prompt:**
```text
Verify all UI changes compile and the new elements exist:
```

```bash
# Verify TypeScript compiles
npx tsc --noEmit src/sidepanel/main.ts && echo "✓ Main.ts compiles"

# Verify new toggles exist in HTML
grep -q "recruiter-redirect-toggle" src/sidepanel/index.html && echo "✓ Recruiter toggle in HTML"
grep -q "auto-open-message-toggle" src/sidepanel/index.html && echo "✓ Auto-open toggle in HTML"
grep -q "recruiter-indicator" src/sidepanel/index.html && echo "✓ Recruiter indicator in HTML"

# Verify element references in main.ts
grep -q "recruiterRedirectToggle" src/sidepanel/main.ts && echo "✓ recruiterRedirectToggle element reference"
grep -q "autoOpenMessageToggle" src/sidepanel/main.ts && echo "✓ autoOpenMessageToggle element reference"
grep -q "recruiterIndicator" src/sidepanel/main.ts && echo "✓ recruiterIndicator element reference"

# Verify helper function exists
grep -q "updateRecruiterIndicator" src/sidepanel/main.ts && echo "✓ updateRecruiterIndicator function exists"

# Verify both settings are saved
grep -q "recruiterRedirectEnabled: elements.recruiterRedirectToggle.checked" src/sidepanel/main.ts && echo "✓ recruiterRedirectEnabled saved"
grep -q "autoOpenMessageComposer: elements.autoOpenMessageToggle.checked" src/sidepanel/main.ts && echo "✓ autoOpenMessageComposer saved"
```

**Gate:** All commands must succeed before proceeding.

---

## Phase 7: Integration with Flux Capacitor

### Step 7.1: Verify No Conflicts

**Cursor Prompt:**
```text
Verify that Recruiter Mode, Auto-Open Message, and Flux Capacitor can work together without conflicts.

The integration is designed to be conflict-free because:
1. Recruiter Redirect runs in the CONTENT SCRIPT when a page loads
2. Flux Capacitor runs in the SIDEPANEL when navigating between leads
3. Auto-Open Message runs AFTER scraping completes on Recruiter pages

Flow when ALL are enabled:
1. User clicks Next in sidebar (Flux Capacitor enabled)
2. Flux navigates to linkedin.com/in/username (public profile)
3. Content script loads on the public profile page
4. Content script detects Recruiter Redirect is enabled
5. Content script finds the Recruiter ID → Redirects to /talent/profile/ACo...
6. Content script loads on Recruiter profile
7. Content script scrapes Recruiter-specific data
8. Content script auto-clicks Message button (if enabled)
9. User sees message composer ready for paste!

No code changes needed - this is verification only.
```

```bash
echo "=== Verifying Full Integration ==="

# Verify content script handles redirect before scrape
grep -A 5 "waitForHydration().then" src/content/linkedin-scraper.ts | grep -q "initRecruiterRedirect" && \
  echo "✓ Redirect check happens before scrape"

# Verify Recruiter scraper is called on Recruiter pages
grep -q "scrapeRecruiterAndSend()" src/content/linkedin-scraper.ts && \
  echo "✓ Recruiter scraper called on Recruiter pages"

# Verify auto-open is called after Recruiter scrape
grep -q "handleAutoOpenMessageComposer()" src/content/linkedin-scraper.ts && \
  echo "✓ Auto-open called after Recruiter scrape"

# Verify settings are independent
grep -q "fluxCapacitorEnabled" src/lib/storage.ts && \
grep -q "recruiterRedirectEnabled" src/lib/storage.ts && \
grep -q "autoOpenMessageComposer" src/lib/storage.ts && \
  echo "✓ All settings are independent"

echo ""
echo "Integration verified. All modes can work simultaneously."
echo "Expected flow: Flux nav → Public profile → Bounce → Recruiter → Scrape → Auto-open message"
```

---

## Phase 8: Build and Test

### Step 8.1: Full Build

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

### Step 8.2: Reload Extension in Chrome

```text
Manual steps to reload the extension:

1. Open chrome://extensions/
2. Find "SGA Velocity Sidebar"
3. Click the refresh icon (↻) to reload
4. If errors, click "Errors" button to see details
```

### Step 8.3: Test Checklist

**Cursor Prompt:**
```text
Use this comprehensive test checklist to verify all Recruiter features work correctly.
```

**Settings Tests:**
- [ ] Open settings modal (⚙️ icon)
- [ ] Recruiter Mode toggle is visible (🎯 icon)
- [ ] Auto-Open Message Composer toggle is visible (✉️ icon)
- [ ] Auto-Open toggle is DISABLED when Recruiter Mode is OFF
- [ ] Auto-Open toggle is ENABLED when Recruiter Mode is ON
- [ ] Disabling Recruiter Mode also unchecks Auto-Open
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

**Recruiter Scraping Tests:**
- [ ] On Recruiter profile, sidebar shows scraped data
- [ ] Name is correctly extracted (without accreditations)
- [ ] Accreditations (CFP®, CFA, etc.) are extracted separately
- [ ] Location is extracted (without leading bullet)
- [ ] Education is extracted
- [ ] Company is extracted (if available)

**Auto-Open Message Tests (Recruiter Mode + Auto-Open ON):**
- [ ] Navigate to Recruiter profile
- [ ] Wait 1-2 seconds after page loads
- [ ] Message composer automatically opens
- [ ] Console shows: `[SGA Velocity] ✉️ Auto-opened message composer`
- [ ] Message is ready to paste from clipboard (if Flux copied it)

**Auto-Open Message Tests (Auto-Open OFF):**
- [ ] Navigate to Recruiter profile
- [ ] Message composer does NOT auto-open
- [ ] Console shows: `Auto-open message composer disabled`

**Full Flow Test (Flux + Recruiter + Auto-Open ALL ON):**
- [ ] Press → arrow to navigate to next lead
- [ ] Flux copies message to clipboard
- [ ] Browser navigates to public LinkedIn profile
- [ ] Content script redirects to Recruiter profile
- [ ] Recruiter profile loads
- [ ] Data is scraped and sent to sidebar
- [ ] Message composer auto-opens
- [ ] User can immediately Ctrl+V to paste message
- [ ] Total time from arrow press to ready-to-paste: 3-5 seconds

**Edge Cases:**
- [ ] Already on Recruiter page (`/talent/profile/`) → No redirect, just scrape
- [ ] Profile with no Message button → Console warning, no crash
- [ ] Profile with no extractable ID → Console warning, stays on public profile
- [ ] Non-profile page → No redirect/scrape logic runs
- [ ] Recruiter page without accreditations → Name extracted correctly

**Error Handling:**
- [ ] Extension context invalidated (reload extension) → No errors thrown
- [ ] Storage read fails → Graceful fallback, no redirect/auto-open
- [ ] Message button click fails → Error logged, no crash
- [ ] Chrome console has no unhandled errors

---

## Phase 9: Future Enhancement - Write-Back

### Step 9.1: Design Document for Write-Back Feature

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
| `src/lib/storage.ts` | Added `recruiterRedirectEnabled` and `autoOpenMessageComposer` to `AppSettings` interface and `DEFAULT_SETTINGS` |
| `src/content/linkedin-scraper.ts` | Added Recruiter ID scraper, redirect logic, Recruiter profile scraper, auto-open message functions |
| `src/sidepanel/index.html` | Added Recruiter Mode toggle section with Auto-Open sub-option, header indicator |
| `src/sidepanel/main.ts` | Added element references, `updateRecruiterIndicator()`, toggle dependency logic, updated settings handlers |

### New Functions Added

```typescript
// linkedin-scraper.ts - Recruiter ID & Redirect
function findRecruiterId(): string | null
function isPublicProfilePage(): boolean
function isRecruiterProfilePage(): boolean
function buildRecruiterUrl(recruiterId: string): string
async function handleRecruiterRedirect(): Promise<boolean>
async function initRecruiterRedirect(): Promise<void>

// linkedin-scraper.ts - Recruiter Scraping
function scrapeRecruiterProfile(): LinkedInProfile | null
function extractRecruiterNameAndAccreditations(): { fullName, firstName, lastName, accreditations }
function splitName(fullName: string): { firstName, lastName }
function extractRecruiterHeadline(): string | null
function extractRecruiterLocation(): string | null
function extractRecruiterCompany(): string | null
function extractRecruiterEducation(): string | null
async function scrapeRecruiterAndSend(): Promise<void>

// linkedin-scraper.ts - Auto-Open Message
async function handleAutoOpenMessageComposer(): Promise<void>
function findMessageButton(): HTMLElement | null
function waitForMessageButton(timeoutMs?: number): Promise<HTMLElement | null>

// main.ts
function updateRecruiterIndicator(enabled: boolean): void
```

### Settings Changes

```typescript
// Two new settings added
interface AppSettings {
  // ... existing ...
  recruiterRedirectEnabled: boolean;  // NEW - The Bounce
  autoOpenMessageComposer: boolean;   // NEW - Auto-click Message button
}

// Default values
const DEFAULT_SETTINGS = {
  // ... existing ...
  recruiterRedirectEnabled: false,  // NEW - opt-in required
  autoOpenMessageComposer: false    // NEW - sub-feature of Recruiter Mode
};
```

### DOM Selectors Used (Recruiter)

| Data | Primary Selector | Fallback Selector | Stability | Notes |
|------|-----------------|-------------------|-----------|-------|
| Name + Accreditations | `.artdeco-entity-lockup__title` | `<title>` tag | 🟡 Medium → 🟢 High | Split by comma, handles nicknames |
| Location | `.text-highlighter__text` | `[data-test-location]` | 🟡 Medium → 🟢 High | Removes leading `· ` bullet |
| Education | `[data-test-latest-education]` | Nested in caption | 🟢 High | Data-test attributes are stable |
| Company | `[data-test-current-company]` | Parse subtitle "at Company" | 🟢 High → 🟡 Medium | Semantic extraction fallback |
| Headline | `.artdeco-entity-lockup__subtitle` | `[data-test-latest-position]` | 🟡 Medium → 🟢 High | Current position/title |
| Message Button | `li-icon[type="envelope-icon"]` → parent | Text + icon search, aria-label | 🟡 Medium → 🟢 High | 3-level fallback strategy |

**Selector Stability Guide:**
- 🟢 **High Stability**: Data-test attributes, aria-labels, semantic HTML (`<title>`)
- 🟡 **Medium Stability**: LinkedIn class names (`.artdeco-*`, `.text-highlighter-*`)

**Fallback Philosophy:**
Each extraction function uses a primary selector (fastest/most specific) with at least one fallback (more stable). If all selectors fail, the function returns `null` gracefully - the extension continues working, just without that specific data field.

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.2.1 | Dec 2024 | Added comprehensive DOM selector fallback documentation, stability notes, and fallback strategy explanations |
| 1.2 | Dec 2024 | Added Recruiter Profile Scraper (Phase 4), Auto-Open Message Composer (Phase 5), expanded settings UI |
| 1.1 | Dec 2024 | Fixed function name references, added storage access note, added line number disclaimer |
| 1.0 | Dec 2024 | Initial Recruiter Redirect implementation guide |

---

*"The only way to do great work is to love what you do." - But also to automate the boring parts.*
