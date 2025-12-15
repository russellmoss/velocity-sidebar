// =============================================================================
// LINKEDIN PROFILE SCRAPER v3.1
// Content script that extracts profile data from LinkedIn pages
// Uses MutationObserver for reliable React hydration detection
// =============================================================================

import type { LinkedInProfile, ProfileScrapedMessage } from '../types';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const DEBUG = true;
const HYDRATION_TIMEOUT = 10000;
const MIN_HYDRATION_DELAY = 1500;

// Track if we've already opened the message composer on this page load
let messageComposerOpened = false;
let lastProfileUrl = '';

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[LinkedIn Scraper]', ...args);
}

// -----------------------------------------------------------------------------
// Main Entry Point
// -----------------------------------------------------------------------------

function init(): void {
  log('Initializing scraper v3.1...');

  // Initialize tracking variables
  const currentUrl = window.location.href;
  lastProfileUrl = currentUrl.split('?')[0];
  messageComposerOpened = false;

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

function isProfilePage(): boolean {
  const url = window.location.href;
  return (
    url.includes('linkedin.com/in/') ||
    url.includes('linkedin.com/talent/') ||
    url.includes('linkedin.com/recruiter/')
  );
}

// -----------------------------------------------------------------------------
// Hydration Detection (MutationObserver)
// -----------------------------------------------------------------------------

function waitForHydration(): Promise<void> {
  return new Promise((resolve) => {
    log('Waiting for page hydration...');
    const startTime = Date.now();

    if (isPageHydrated()) {
      log('Page already hydrated');
      setTimeout(resolve, MIN_HYDRATION_DELAY);
      return;
    }

    const observer = new MutationObserver((mutations, obs) => {
      if (isPageHydrated()) {
        log('Page hydration detected');
        obs.disconnect();
        setTimeout(resolve, MIN_HYDRATION_DELAY);
        return;
      }

      if (Date.now() - startTime > HYDRATION_TIMEOUT) {
        log('Hydration timeout, proceeding anyway');
        obs.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      log('Fallback timeout reached');
      resolve();
    }, HYDRATION_TIMEOUT);
  });
}

function isPageHydrated(): boolean {
  const indicators = [
    'section.artdeco-card.pv-top-card',
    'h1.text-heading-xlarge',
    '#experience',
    '.pv-top-card-profile-picture',
  ];
  return indicators.some((sel) => document.querySelector(sel) !== null);
}

// -----------------------------------------------------------------------------
// SPA Navigation Detection
// -----------------------------------------------------------------------------

function observeNavigation(): void {
  let lastUrl = window.location.href;

  const urlObserver = new MutationObserver(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      log('URL changed:', currentUrl);
      const previousUrl = lastUrl;
      lastUrl = currentUrl;
      
      // Only reset message composer flag if we've navigated to a different profile
      // (not just a query parameter change like ?rightRail=composer)
      const currentProfileUrl = currentUrl.split('?')[0];
      const previousProfileUrl = previousUrl.split('?')[0];
      
      if (currentProfileUrl !== previousProfileUrl) {
        // Different profile - reset flag
        messageComposerOpened = false;
        lastProfileUrl = currentProfileUrl;
        log('Navigated to different profile, resetting message composer flag');
      } else {
        // Same profile, just query params changed (e.g., rightRail=composer added)
        // Don't reset flag - if composer opened, keep it marked as opened
        if (currentUrl.includes('rightRail=composer') && !previousUrl.includes('rightRail=composer')) {
          log('Message composer opened (URL changed to include rightRail=composer), marking as opened');
          messageComposerOpened = true;
        }
      }

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
        // Reset message composer flag only if profile URL changed
        const currentUrl = window.location.href;
        const profileUrl = currentUrl.split('?')[0];
        if (lastProfileUrl !== profileUrl) {
          messageComposerOpened = false;
          lastProfileUrl = profileUrl;
          log('Popstate navigation to different profile, resetting message composer flag');
        }
        
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

// -----------------------------------------------------------------------------
// Scraping Logic
// -----------------------------------------------------------------------------

function scrapeAndSend(): void {
  log('Scraping profile...');
  const profile = scrapeProfile();

  if (profile) {
    log('Scraped profile:', profile.fullName);
    sendProfileToServiceWorker(profile);
  } else {
    log('Failed to scrape profile');
  }
}

function scrapeProfile(): LinkedInProfile | null {
  try {
    const profileUrl = window.location.href.split('?')[0];
    const { firstName, lastName, fullName, accreditations } = extractName();

    if (!firstName) {
      log('Could not extract name');
      return null;
    }

    const headline = extractHeadline();
    const { title, company } = extractCurrentPosition();
    const location = extractLocation();

    return {
      firstName,
      lastName,
      fullName,
      headline,
      company,
      title,
      location,
      profileUrl,
      accreditations,
      scrapedAt: Date.now(),
    };
  } catch (error) {
    console.error('[LinkedIn Scraper] Error:', error);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Name Extraction with Accreditations Parsing
// -----------------------------------------------------------------------------

function extractName(): {
  firstName: string;
  lastName: string;
  fullName: string;
  accreditations: string[];
} {
  let rawName = '';

  // Method 1: Page title
  const title = document.title;
  if (title) {
    const match = title.match(/^([^-|]+)/);
    if (match) rawName = match[1].trim();
  }

  // Method 2: Profile heading
  if (!rawName) {
    const nameEl = document.querySelector('h1.text-heading-xlarge');
    if (nameEl) rawName = nameEl.textContent?.trim() || '';
  }

  return parseName(rawName);
}

function parseName(rawName: string): {
  firstName: string;
  lastName: string;
  fullName: string;
  accreditations: string[];
} {
  const accreditationPatterns = [
    'CFP®', 'CFP', 'CFA', 'CPA', 'ChFC®', 'ChFC', 'CLU®', 'CLU',
    'CIMA®', 'CIMA', 'CPWA®', 'CPWA', 'AIF®', 'AIF', 'CRPC®', 'CRPC',
    'RICP®', 'RICP', 'WMCP®', 'WMCP', 'CAP®', 'CAP', 'CEPA®', 'CEPA',
    'CWS®', 'CWS', 'AWMA®', 'AWMA', 'SE-AWMA™', 'SE-AWMA',
    'MBA', 'PhD', 'JD', 'CKA®', 'CKA',
  ];

  const accreditations: string[] = [];
  let cleanName = rawName;

  for (const cred of accreditationPatterns) {
    const regex = new RegExp(`[,\\s]+${cred.replace(/[®™]/g, '[®™]?')}`, 'gi');
    if (regex.test(cleanName)) {
      const match = cleanName.match(regex);
      if (match) {
        const credMatch = match[0].replace(/^[,\s]+/, '').trim();
        if (!accreditations.includes(credMatch)) {
          accreditations.push(credMatch);
        }
      }
      cleanName = cleanName.replace(regex, '');
    }
  }

  cleanName = cleanName.replace(/\s+/g, ' ').trim().replace(/,$/, '').trim();

  const parts = cleanName.split(' ');
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ') || '';

  return {
    firstName,
    lastName,
    fullName: cleanName,
    accreditations: accreditations.slice(0, 6),
  };
}

// -----------------------------------------------------------------------------
// Field Extraction
// -----------------------------------------------------------------------------

function extractHeadline(): string | undefined {
  const headlineEl = document.querySelector('.text-body-medium.break-words');
  if (headlineEl) return headlineEl.textContent?.trim();

  const altHeadline = document.querySelector('[data-generated-suggestion-target]');
  if (altHeadline) return altHeadline.textContent?.trim();

  return undefined;
}

function extractCurrentPosition(): { title?: string; company?: string } {
  let title: string | undefined;
  let company: string | undefined;

  const experienceSection = document.querySelector('#experience');
  if (experienceSection) {
    const firstExperience = experienceSection.querySelector('.artdeco-list__item');
    if (firstExperience) {
      const titleEl = firstExperience.querySelector('.hoverable-link-text.t-bold span[aria-hidden="true"]');
      if (titleEl) title = titleEl.textContent?.trim();

      const companyEl = firstExperience.querySelector('span.t-14.t-normal span[aria-hidden="true"]');
      if (companyEl) company = cleanCompanyName(companyEl.textContent?.trim() || '');
    }
  }

  if (!title || !company) {
    const topCard = document.querySelector('section.artdeco-card.pv-top-card');
    if (topCard) {
      const positionText = topCard.querySelector('.text-body-small.inline.t-black--light');
      if (positionText && !company) {
        const text = positionText.textContent?.trim() || '';
        if (text.includes(' at ')) {
          const parts = text.split(' at ');
          if (!title) title = parts[0]?.trim();
          company = cleanCompanyName(parts[1]?.trim() || '');
        } else {
          company = cleanCompanyName(text);
        }
      }
    }
  }

  return { title, company };
}

function cleanCompanyName(name: string): string {
  if (!name) return '';
  let cleaned = name.replace(/\s*·\s*(Full-time|Part-time|Contract|Internship|Freelance|Self-employed)$/i, '');
  cleaned = cleaned.replace(/[.,]+$/, '');
  return cleaned.trim();
}

function extractLocation(): string | undefined {
  const locationEl = document.querySelector('span.text-body-small.inline.t-black--light.break-words');
  if (locationEl) return locationEl.textContent?.trim();

  const altLocation = document.querySelector('.pv-top-card--list-bullet .text-body-small');
  if (altLocation) return altLocation.textContent?.trim();

  return undefined;
}

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
      scrapedAt: Date.now(),
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

// -----------------------------------------------------------------------------
// Auto-Open Message Composer
// -----------------------------------------------------------------------------

/**
 * Automatically clicks the "Message" button on Recruiter profiles if enabled.
 * The button is identified by the envelope icon inside it.
 * 
 * Prevents double-opening by:
 * 1. Checking if URL already has rightRail=composer (composer already open)
 * 2. Tracking if we've already opened on this page load
 * 
 * DOM Structure:
 * <button ...>
 *   <li-icon type="envelope-icon" ...>
 *     <svg>...</svg>
 *   </li-icon>
 *   <span>Message</span>
 * </button>
 */
/**
 * Check if message composer is already open (either in URL or DOM)
 * 
 * Uses actual LinkedIn Recruiter DOM structure:
 * - Main container: .profile__right-rail-composer or .profile__right-rail-message-composer
 * - Composer view: [data-view-name="messaging-composer"]
 * - Header: #messaging-composer-header (contains "Compose Message")
 * - Editor: .rich-text-editor__editor-elem
 */
function isMessageComposerOpen(): boolean {
  // Strategy 1: Check URL for rightRail=composer parameter (fastest check)
  if (window.location.href.includes('rightRail=composer')) {
    return true;
  }
  
  // Strategy 2: Check for main composer container (most reliable - actual LinkedIn class)
  const composerContainer = document.querySelector('.profile__right-rail-composer, .profile__right-rail-message-composer');
  if (composerContainer) {
    // Check if it's visible (not hidden)
    const style = window.getComputedStyle(composerContainer);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      return true;
    }
  }
  
  // Strategy 3: Check for messaging composer view (data attribute - stable)
  const composerView = document.querySelector('[data-view-name="messaging-composer"]');
  if (composerView) {
    const style = window.getComputedStyle(composerView);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      return true;
    }
  }
  
  // Strategy 4: Check for composer header (specific ID - very reliable)
  const composerHeader = document.getElementById('messaging-composer-header');
  if (composerHeader && composerHeader.textContent?.includes('Compose Message')) {
    const style = window.getComputedStyle(composerHeader);
    if (style.display !== 'none' && style.visibility !== 'hidden') {
      return true;
    }
  }
  
  // Strategy 5: Check for rich text editor (fallback - editor is always present when open)
  const editorContainer = document.querySelector('.rich-text-editor__editor-elem');
  if (editorContainer) {
    // Check if it's within the composer container (not just any editor on page)
    const withinComposer = editorContainer.closest('.profile__right-rail-composer, .profile__right-rail-message-composer');
    if (withinComposer) {
      const style = window.getComputedStyle(withinComposer);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        return true;
      }
    }
  }
  
  return false;
}

async function handleAutoOpenMessageComposer(): Promise<void> {
  // Check if we're on a Recruiter profile
  if (!isRecruiterProfilePage()) {
    return;
  }

  const currentUrl = window.location.href;
  const profileUrl = currentUrl.split('?')[0]; // URL without query params

  // Reset flag if we've navigated to a different profile (different base URL)
  if (lastProfileUrl !== profileUrl) {
    messageComposerOpened = false;
    lastProfileUrl = profileUrl;
  }

  // Check if composer is already open (URL or DOM check)
  if (isMessageComposerOpen()) {
    log('Message composer already open (detected in URL or DOM), skipping');
    messageComposerOpened = true; // Mark as opened so we don't try again
    return;
  }

  // Check if we've already opened on this page load
  if (messageComposerOpened) {
    log('Message composer already opened on this page load, skipping');
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

  // Double-check composer isn't open before clicking (URL might have changed)
  if (isMessageComposerOpen()) {
    log('Message composer opened while waiting, skipping click');
    messageComposerOpened = true;
    return;
  }

  // Find the Message button by its icon
  const messageButton = findMessageButton();

  if (messageButton) {
    log('Found Message button, clicking...');
    
    // Mark as opened IMMEDIATELY before clicking to prevent race conditions
    // This prevents the navigation observer from triggering another open
    messageComposerOpened = true;
    
    // Small delay to ensure button is interactive
    await new Promise(resolve => setTimeout(resolve, 200));
    
    try {
      messageButton.click();
      
      // Wait a moment for URL to update after click
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Verify it opened (URL should now have rightRail=composer)
      if (isMessageComposerOpen()) {
        console.log('[SGA Velocity] ✉️ Auto-opened message composer');
      } else {
        log('Message composer may not have opened after click');
        // Reset flag if it didn't actually open (allows retry on next navigation)
        messageComposerOpened = false;
      }
    } catch (error) {
      console.error('[SGA Velocity] Failed to click Message button:', error);
      // Reset flag on error to allow retry
      messageComposerOpened = false;
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

// -----------------------------------------------------------------------------
// Communication
// -----------------------------------------------------------------------------

function sendProfileToServiceWorker(profile: LinkedInProfile): void {
  try {
    // Check if extension context is still valid
    if (!chrome.runtime?.id) {
      log('Extension context invalidated, skipping message send');
      return;
    }

    const message: ProfileScrapedMessage = {
      type: 'PROFILE_SCRAPED',
      payload: profile,
    };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        const errorMsg = chrome.runtime.lastError.message || '';
        // Silently ignore context invalidated errors (extension was reloaded)
        if (errorMsg.includes('Extension context invalidated') || 
            errorMsg.includes('message port closed')) {
          log('Extension context invalidated (extension reloaded), ignoring');
          return;
        }
        log('Error sending message:', errorMsg);
      } else {
        log('Profile sent to service worker:', response);
      }
    });
  } catch (error) {
    // Catch any synchronous errors
    if (error instanceof Error && 
        (error.message.includes('Extension context invalidated') ||
         error.message.includes('message port closed'))) {
      log('Extension context invalidated (extension reloaded), ignoring');
      return;
    }
    console.error('[LinkedIn Scraper] Error sending profile:', error);
  }
}

// -----------------------------------------------------------------------------
// Initialize
// -----------------------------------------------------------------------------

init();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && isProfilePage()) {
    log('Tab became visible, re-scraping...');
    setTimeout(() => {
      waitForHydration().then(() => scrapeAndSend());
    }, 500);
  }
});
