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

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[LinkedIn Scraper]', ...args);
}

// -----------------------------------------------------------------------------
// Main Entry Point
// -----------------------------------------------------------------------------

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
