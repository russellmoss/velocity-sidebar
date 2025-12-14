# SGA Velocity Sidebar v3.1 - Hybrid Salesforce Architecture

## Implementation Plan for Cursor.ai

**Version:** 3.1 - Hybrid Architecture (Simplified Auth)  
**Date:** December 2025  
**Author:** RevOps Engineering  
**Previous Version:** v2 (CSV-based) → **DEPRECATED**

---

## Executive Summary

This document provides a complete, step-by-step implementation plan for building the **SGA Velocity Sidebar** Chrome Extension with direct Salesforce integration.

### What Changed from v2 → v3.1

| Removed (v2) | Added (v3.1) |
|--------------|--------------|
| `src/lib/csv-parser.ts` | `src/lib/api.ts` |
| File input in `index.html` | "Sync Leads" button + status |
| "Import CSV" logic | Auto-fetch on startup |
| Manual CSV upload flow | `chrome.identity.getProfileUserInfo` |
| No authentication | Google Workspace email verification |

### Architecture Overview

```
READ (n8n)                              WRITE (Zapier)
    │                                        │
    ▼                                        ▼
┌─────────────────┐                 ┌─────────────────┐
│  n8n Webhook    │                 │ Zapier Webhook  │
│  (GET)          │                 │ (POST)          │
│                 │                 │                 │
│  Returns: JSON  │                 │  Receives:      │
│  array of Leads │                 │  { leadId,      │
│                 │                 │    sgaEmail,    │
│                 │                 │    timestamp,   │
│                 │                 │    action }     │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
         ▼                                   ▼
┌────────────────────────────────────────────────────┐
│                   SALESFORCE                       │
│                                                    │
│  Lead Object:                                      │
│  • Id, FirstName, LastName, Company, Title         │
│  • Savvy_Lead_Score__c                             │
│  • LinkedIn_Profile_Apollo__c                      │
│  • Status                                          │
│  • Prospecting_Step_LinkedIn__c                    │
└────────────────────────────────────────────────────┘
```

### Why This Split?

- **n8n for reads:** Zapier webhooks cannot return JSON arrays (only trigger actions)
- **Zapier for writes:** Team familiarity, existing infrastructure
- **`getProfileUserInfo` for auth:** No OAuth dance required; just reads Chrome profile email

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA FLOW v3.1                                    │
└─────────────────────────────────────────────────────────────────────────────┘

1. AUTHENTICATION (On Extension Open - AUTOMATIC)
   ┌──────────────┐    getProfileUserInfo()    ┌──────────────┐
   │   Extension  │ ─────────────────────────► │   Chrome     │
   │   Opens      │                            │   Profile    │
   │              │ ◄───────────────────────── │              │
   └──────────────┘    { email: "sga@..." }    └──────────────┘
                              │
                              │ Auto-fetch if @savvywealth.com
                              ▼

2. FETCH LEADS (Auto on Init + "Sync" Button)
   ┌──────────────┐    GET ?email=sga@...     ┌──────────────┐     SOQL      ┌──────────────┐
   │   Extension  │ ────────────────────────► │   n8n        │ ────────────► │  Salesforce  │
   │              │                           │   Webhook    │               │              │
   │              │ ◄──────────────────────── │              │ ◄──────────── │              │
   └──────────────┘    JSON: SalesforceLead[] └──────────────┘   Lead[]      └──────────────┘

3. SCRAPE PROFILE (Auto on LinkedIn Navigation)
   ┌──────────────┐    MutationObserver      ┌──────────────┐
   │   Content    │ ────────────────────────►│   LinkedIn   │
   │   Script     │    waits for hydrate     │   DOM        │
   │              │ ◄────────────────────────│              │
   └──────────────┘    Profile data          └──────────────┘
         │
         │ chrome.runtime.sendMessage()
         ▼
   ┌──────────────┐
   │   Side Panel │  Enriches lead with scraped data
   └──────────────┘

4. LOG ACTIVITY (On "✓ Sent" Click)
   ┌──────────────┐    POST webhook          ┌──────────────┐     Update    ┌──────────────┐
   │   Extension  │ ────────────────────────►│   Zapier     │ ────────────► │  Salesforce  │
   │              │    { leadId, sgaEmail,   │   Webhook    │               │              │
   │              │      timestamp, action } │              │               │              │
   │              │ ◄────────────────────────│              │ ◄──────────── │              │
   └──────────────┘    { success: true }     └──────────────┘   Updated     └──────────────┘
```

---

## Phase 1: Project Scaffolding & Configuration

### Step 1.1: Initialize Vite + TypeScript Project

**Context:** Chrome Extension with Manifest V3, vanilla TypeScript, Tailwind CSS.

**Cursor Prompt:**
```text
Create a new Chrome Extension project with the following specifications:

1. Initialize a new Vite project with TypeScript:
   - Project name: `sga-velocity-sidebar`
   - Use vanilla TypeScript (no framework)

2. Create this folder structure:
```
sga-velocity-sidebar/
├── src/
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css
│   ├── content/
│   │   └── linkedin-scraper.ts
│   ├── background/
│   │   └── service-worker.ts
│   ├── types/
│   │   └── index.ts
│   └── lib/
│       ├── storage.ts
│       ├── templates.ts
│       ├── api.ts           # n8n + Zapier API calls
│       └── auth.ts          # chrome.identity.getProfileUserInfo
├── public/
│   ├── icons/
│   │   ├── icon16.png
│   │   ├── icon48.png
│   │   └── icon128.png
│   └── manifest.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
└── package.json
```

IMPORTANT - DO NOT CREATE:
- src/lib/csv-parser.ts (REMOVED in v3.1)
- Any CSV import/export functionality
- File input elements for CSV

3. Install dependencies:
```json
{
  "name": "sga-velocity-sidebar",
  "version": "3.1.0",
  "description": "High-velocity LinkedIn outreach for Savvy Wealth SGAs - Direct Salesforce Integration",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "tsc && vite build && npm run copy-manifest",
    "copy-manifest": "cp public/manifest.json dist/ && cp -r public/icons dist/",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.3",
    "vite": "^5.0.10"
  }
}
```

4. Configure `vite.config.ts`:
```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'linkedin-scraper': resolve(__dirname, 'src/content/linkedin-scraper.ts'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker' || chunkInfo.name === 'linkedin-scraper') {
            return '[name].js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

5. Set up `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": ["chrome"],
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

6. Initialize Tailwind CSS with `tailwind.config.js`:
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  theme: {
    extend: {
      colors: {
        savvy: {
          green: '#10B981',
          'green-dark': '#059669',
          dark: '#1F2937',
          light: '#F3F4F6',
        },
      },
    },
  },
  plugins: [],
};
```

7. Create `postcss.config.js`:
```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

8. Create placeholder icons (16x16, 48x48, 128x128 PNG files with green "S" on dark background).
```

**Verification Command:**
```bash
npm install && npm run typecheck && echo "✓ Project scaffolding complete"
# Check NO csv-parser.ts exists:
test ! -f src/lib/csv-parser.ts && echo "✓ No CSV parser (correct)"
```

**Success Criteria:**
- No npm install errors
- TypeScript compilation passes
- `src/lib/csv-parser.ts` does NOT exist

---

### Step 1.2: Configure Chrome Extension Manifest

**Context:** Manifest V3 with `identity` permission for `getProfileUserInfo`. **NO OAuth client_id required** since we're using profile info, not OAuth tokens.

**Cursor Prompt:**
```text
Create `public/manifest.json` for SGA Velocity Sidebar with identity permission:

```json
{
  "manifest_version": 3,
  "name": "SGA Velocity Sidebar",
  "version": "3.1.0",
  "description": "High-velocity LinkedIn outreach tool for Savvy Wealth SGAs - Direct Salesforce Integration",
  
  "permissions": [
    "identity",
    "identity.email",
    "sidePanel",
    "activeTab",
    "scripting",
    "storage",
    "clipboardWrite",
    "tabs"
  ],
  
  "host_permissions": [
    "https://www.linkedin.com/*",
    "https://linkedin.com/*"
  ],
  
  "side_panel": {
    "default_path": "sidepanel/index.html"
  },
  
  "background": {
    "service_worker": "service-worker.js",
    "type": "module"
  },
  
  "content_scripts": [
    {
      "matches": [
        "https://www.linkedin.com/in/*",
        "https://www.linkedin.com/talent/*",
        "https://www.linkedin.com/recruiter/*"
      ],
      "js": ["linkedin-scraper.js"],
      "run_at": "document_idle"
    }
  ],
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  },
  
  "action": {
    "default_title": "Open SGA Velocity Sidebar"
  }
}
```

IMPORTANT NOTES:
- NO `oauth2` block needed (we use getProfileUserInfo, not OAuth tokens)
- NO `key` field needed (stable ID only required for OAuth)
- `identity` + `identity.email` permissions are required
- User must be signed into Chrome with @savvywealth.com account
```

**Verification Command:**
```bash
node -e "
const m = JSON.parse(require('fs').readFileSync('public/manifest.json'));
const hasIdentity = m.permissions.includes('identity');
const hasIdentityEmail = m.permissions.includes('identity.email');
const noOAuth = !m.oauth2;
console.log('identity:', hasIdentity, '| identity.email:', hasIdentityEmail, '| no oauth2:', noOAuth);
if (hasIdentity && hasIdentityEmail && noOAuth) console.log('✓ Manifest correct for getProfileUserInfo');
else console.log('✗ Manifest needs adjustment');
"
```

**Success Criteria:**
- `identity` and `identity.email` in permissions
- NO `oauth2` block present
- JSON parses without error

---

## Phase 2: TypeScript Types (Salesforce Schema)

### Step 2.1: Create Type Definitions

**Context:** These types exactly match the Salesforce Lead object fields. This is the single source of truth.

**Cursor Prompt:**
```text
Create `src/types/index.ts` with TypeScript types matching Salesforce Lead fields:

```typescript
// =============================================================================
// SGA VELOCITY SIDEBAR v3.1 - TYPE DEFINITIONS
// Hybrid Architecture: n8n (read) + Zapier (write) + Salesforce
// =============================================================================

// -----------------------------------------------------------------------------
// Salesforce Lead Record (EXACT FIELD NAMES)
// -----------------------------------------------------------------------------
export interface SalesforceLead {
  /** Salesforce Record ID (18-char) */
  Id: string;
  
  /** Lead first name */
  FirstName: string;
  
  /** Lead last name */
  LastName: string;
  
  /** Company/Firm name */
  Company: string | null;
  
  /** Job title */
  Title: string | null;
  
  /** Savvy Lead Score (custom field) */
  Savvy_Lead_Score__c: number | null;
  
  /** LinkedIn profile URL from Apollo enrichment */
  LinkedIn_Profile_Apollo__c: string | null;
  
  /** Lead status: 'New', 'Contacting', 'Replied', 'Closed', etc. */
  Status: string;
  
  /** TRUE if LinkedIn message already sent */
  Prospecting_Step_LinkedIn__c: boolean;
}

// -----------------------------------------------------------------------------
// Enriched Lead (Salesforce + LinkedIn scraped data)
// -----------------------------------------------------------------------------
export interface EnrichedLead extends SalesforceLead {
  /** Combined first + last name */
  fullName: string;
  
  /** Scraped from LinkedIn (may differ from Salesforce) */
  scrapedTitle?: string;
  
  /** Scraped from LinkedIn (may differ from Salesforce) */
  scrapedCompany?: string;
  
  /** Scraped headline from LinkedIn */
  headline?: string;
  
  /** Location from LinkedIn */
  location?: string;
  
  /** Professional credentials (CFP®, CFA, etc.) */
  accreditations?: string[];
  
  /** Confirmed LinkedIn URL (scraped) */
  linkedInUrl?: string;
  
  /** When was this profile last scraped */
  scrapedAt?: number;
  
  /** Has the message been generated for this session? */
  messageGenerated?: boolean;
  
  /** The generated message text */
  generatedMessage?: string;
}

// -----------------------------------------------------------------------------
// LinkedIn Scraped Profile Data
// -----------------------------------------------------------------------------
export interface LinkedInProfile {
  firstName: string;
  lastName: string;
  fullName: string;
  headline?: string;
  company?: string;
  title?: string;
  location?: string;
  profileUrl: string;
  accreditations?: string[];
  scrapedAt: number;
}

// -----------------------------------------------------------------------------
// API Types
// -----------------------------------------------------------------------------

/** Response from n8n webhook (array of leads) */
export interface FetchLeadsResponse {
  success: boolean;
  leads: SalesforceLead[];
  count: number;
  error?: string;
}

/** Request to Zapier webhook */
export interface LogActivityPayload {
  leadId: string;
  sgaEmail: string;
  timestamp: string;
  action: 'linkedin_sent';
}

/** Response from Zapier webhook */
export interface LogActivityResponse {
  success: boolean;
  error?: string;
}

// -----------------------------------------------------------------------------
// Authentication Types (Simplified - getProfileUserInfo)
// -----------------------------------------------------------------------------
export interface AuthState {
  isAuthenticated: boolean;
  email: string | null;
  isValidDomain: boolean;
}

// -----------------------------------------------------------------------------
// Message Template Types
// -----------------------------------------------------------------------------
export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: 'intro' | 'followup' | 'reconnect';
  isDefault?: boolean;
}

export interface TemplateVariables {
  firstName: string;
  lastName: string;
  fullName: string;
  company: string;
  title: string;
  location: string;
  headline: string;
  accreditations: string;
  leadScore: string;
}

// -----------------------------------------------------------------------------
// Chrome Message Types
// -----------------------------------------------------------------------------
export type ChromeMessageType =
  | 'PROFILE_SCRAPED'
  | 'PROFILE_UPDATE'
  | 'GET_SCRAPED_PROFILE'
  | 'GET_AUTH_STATE';

export interface ChromeMessage {
  type: ChromeMessageType;
  payload?: unknown;
}

export interface ProfileScrapedMessage extends ChromeMessage {
  type: 'PROFILE_SCRAPED';
  payload: LinkedInProfile;
}

// -----------------------------------------------------------------------------
// Storage Keys
// -----------------------------------------------------------------------------
export const STORAGE_KEYS = {
  LEADS_CACHE: 'leads_cache',
  TEMPLATES: 'templates',
  SETTINGS: 'settings',
  LAST_SYNC: 'last_sync',
  USER_EMAIL: 'user_email',
} as const;

// -----------------------------------------------------------------------------
// API Configuration
// -----------------------------------------------------------------------------
export interface ApiConfig {
  n8nWebhookUrl: string;
  zapierWebhookUrl: string;
}

// -----------------------------------------------------------------------------
// Default Templates
// -----------------------------------------------------------------------------
export const DEFAULT_TEMPLATES: MessageTemplate[] = [
  {
    id: 'intro-1',
    name: 'Standard Introduction',
    category: 'intro',
    isDefault: true,
    content: `Hi {{firstName}}, I came across your profile and noticed your work at {{company}}. I'm reaching out from Savvy Wealth – we're helping independent advisors like yourself with institutional-grade technology and support. Would you be open to a brief conversation?`,
  },
  {
    id: 'intro-2',
    name: 'Credentials Mention',
    category: 'intro',
    content: `Hi {{firstName}}, I see you're a {{accreditations}} at {{company}} – impressive background! I work with Savvy Wealth and we've been helping advisors streamline their practice while maintaining their independence. Worth a quick chat?`,
  },
  {
    id: 'intro-3',
    name: 'Title-Focused',
    category: 'intro',
    content: `Hi {{firstName}}, your role as {{title}} at {{company}} caught my attention. We're working with advisors who want to grow their practice without sacrificing their independence. I'd love to share what we're doing if you have 15 minutes.`,
  },
  {
    id: 'intro-4',
    name: 'Lead Score Reference',
    category: 'intro',
    content: `Hi {{firstName}}, based on your profile at {{company}}, I think there could be a strong fit with what Savvy Wealth offers advisors like yourself. Would you be open to exploring this further?`,
  },
];
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/types/index.ts && echo "✓ Types compile successfully"
# Verify Savvy_Lead_Score__c is included:
grep -q "Savvy_Lead_Score__c" src/types/index.ts && echo "✓ Lead score field present"
```

**Success Criteria:**
- TypeScript compiles without errors
- `SalesforceLead` includes `Savvy_Lead_Score__c`
- No OAuth-related types (we don't need tokens)

---

## Phase 3: Authentication (chrome.identity.getProfileUserInfo)

### Step 3.1: Create Auth Service

**Context:** We use `getProfileUserInfo` to get the Chrome profile email. This is MUCH simpler than OAuth - no tokens, no popups, just reads the signed-in Chrome profile email.

**Cursor Prompt:**
```text
Create `src/lib/auth.ts` with simplified Google Workspace authentication:

```typescript
// =============================================================================
// AUTHENTICATION SERVICE - chrome.identity.getProfileUserInfo
// =============================================================================
// 
// IMPORTANT: This uses getProfileUserInfo (NOT getAuthToken)
// - No OAuth flow required
// - No tokens to manage
// - Just reads the Chrome profile email
// - User must be signed into Chrome with @savvywealth.com account
//
// =============================================================================

import type { AuthState } from '../types';
import { STORAGE_KEYS } from '../types';

// Allowed email domain
const ALLOWED_DOMAIN = 'savvywealth.com';

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

let authState: AuthState = {
  isAuthenticated: false,
  email: null,
  isValidDomain: false,
};

// -----------------------------------------------------------------------------
// Main Authentication Function
// -----------------------------------------------------------------------------

/**
 * Get the Chrome profile email using getProfileUserInfo
 * This does NOT require user interaction - it reads the signed-in Chrome profile
 * 
 * @returns AuthState with email if user is signed into Chrome
 */
export async function authenticateUser(): Promise<AuthState> {
  console.log('[Auth] Getting Chrome profile info...');

  try {
    const userInfo = await new Promise<chrome.identity.UserInfo>((resolve, reject) => {
      chrome.identity.getProfileUserInfo({ accountStatus: 'ANY' }, (info) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(info);
        }
      });
    });

    console.log('[Auth] Profile info received:', userInfo.email ? 'has email' : 'no email');

    if (!userInfo.email) {
      // User not signed into Chrome
      authState = {
        isAuthenticated: false,
        email: null,
        isValidDomain: false,
      };
      console.log('[Auth] No email - user not signed into Chrome');
      return authState;
    }

    // Check domain
    const isValidDomain = userInfo.email.endsWith(`@${ALLOWED_DOMAIN}`);
    
    authState = {
      isAuthenticated: true,
      email: userInfo.email,
      isValidDomain,
    };

    // Cache the email
    await chrome.storage.local.set({
      [STORAGE_KEYS.USER_EMAIL]: userInfo.email,
    });

    if (isValidDomain) {
      console.log('[Auth] ✓ Authenticated as:', userInfo.email);
    } else {
      console.log('[Auth] ⚠ Email domain not allowed:', userInfo.email);
    }

    return authState;
  } catch (error) {
    console.error('[Auth] Error getting profile info:', error);
    
    authState = {
      isAuthenticated: false,
      email: null,
      isValidDomain: false,
    };
    
    return authState;
  }
}

// -----------------------------------------------------------------------------
// Getters
// -----------------------------------------------------------------------------

/**
 * Get current auth state
 */
export function getAuthState(): AuthState {
  return { ...authState };
}

/**
 * Get user email (convenience method)
 */
export function getUserEmail(): string | null {
  return authState.email;
}

/**
 * Check if user is authenticated with valid domain
 */
export function isAuthenticatedWithValidDomain(): boolean {
  return authState.isAuthenticated && authState.isValidDomain;
}

// -----------------------------------------------------------------------------
// Initialize from cached state
// -----------------------------------------------------------------------------

/**
 * Load cached email from storage (for faster startup)
 */
export async function loadCachedAuth(): Promise<AuthState> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.USER_EMAIL);
    const cachedEmail = stored[STORAGE_KEYS.USER_EMAIL] as string | undefined;

    if (cachedEmail) {
      authState = {
        isAuthenticated: true,
        email: cachedEmail,
        isValidDomain: cachedEmail.endsWith(`@${ALLOWED_DOMAIN}`),
      };
      console.log('[Auth] Loaded cached email:', cachedEmail);
    }
  } catch (error) {
    console.error('[Auth] Error loading cached auth:', error);
  }

  return authState;
}

// -----------------------------------------------------------------------------
// Clear Auth (for sign-out scenarios)
// -----------------------------------------------------------------------------

/**
 * Clear cached auth state
 */
export async function clearAuth(): Promise<void> {
  authState = {
    isAuthenticated: false,
    email: null,
    isValidDomain: false,
  };
  
  await chrome.storage.local.remove(STORAGE_KEYS.USER_EMAIL);
  console.log('[Auth] Auth state cleared');
}
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/lib/auth.ts && echo "✓ Auth service compiles"
# Verify we use getProfileUserInfo, NOT getAuthToken:
grep -q "getProfileUserInfo" src/lib/auth.ts && echo "✓ Uses getProfileUserInfo"
! grep -q "getAuthToken" src/lib/auth.ts && echo "✓ Does NOT use getAuthToken"
```

**Success Criteria:**
- TypeScript compiles without errors
- Uses `chrome.identity.getProfileUserInfo`
- Does NOT use `chrome.identity.getAuthToken`
- Domain validation for `@savvywealth.com`

---

## Phase 4: API Layer (n8n + Zapier)

### Step 4.1: Create API Service

**Context:** `fetchLeads(email)` calls n8n GET webhook. `logActivity(payload)` calls Zapier POST webhook.

**Cursor Prompt:**
```text
Create `src/lib/api.ts` with n8n and Zapier API integration:

```typescript
// =============================================================================
// API SERVICE - n8n (Read) + Zapier (Write)
// =============================================================================

import type {
  FetchLeadsResponse,
  LogActivityPayload,
  LogActivityResponse,
  SalesforceLead,
  ApiConfig,
} from '../types';

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

let config: ApiConfig = {
  n8nWebhookUrl: '',
  zapierWebhookUrl: '',
};

/**
 * Initialize API configuration from storage
 */
export async function initApiConfig(): Promise<void> {
  const stored = await chrome.storage.local.get(['n8nWebhookUrl', 'zapierWebhookUrl']);
  config = {
    n8nWebhookUrl: stored.n8nWebhookUrl || '',
    zapierWebhookUrl: stored.zapierWebhookUrl || '',
  };
  console.log('[API] Config loaded:', {
    n8n: config.n8nWebhookUrl ? '✓' : '✗',
    zapier: config.zapierWebhookUrl ? '✓' : '✗',
  });
}

/**
 * Update API configuration
 */
export async function setApiConfig(newConfig: Partial<ApiConfig>): Promise<void> {
  config = { ...config, ...newConfig };
  await chrome.storage.local.set({
    n8nWebhookUrl: config.n8nWebhookUrl,
    zapierWebhookUrl: config.zapierWebhookUrl,
  });
}

/**
 * Get current API configuration
 */
export function getApiConfig(): ApiConfig {
  return { ...config };
}

// =============================================================================
// FETCH LEADS (n8n GET Webhook)
// =============================================================================

/**
 * Fetch leads from Salesforce via n8n webhook
 * 
 * Expected n8n workflow:
 * 1. Webhook (GET) receives ?email=sga@savvywealth.com
 * 2. Salesforce node executes SOQL query
 * 3. Returns JSON array of Lead records
 * 
 * @param email - SGA's email address for owner filtering
 */
export async function fetchLeads(email: string): Promise<FetchLeadsResponse> {
  if (!config.n8nWebhookUrl) {
    return {
      success: false,
      leads: [],
      count: 0,
      error: 'n8n webhook URL not configured. Go to Settings.',
    };
  }

  if (!email) {
    return {
      success: false,
      leads: [],
      count: 0,
      error: 'No email provided for lead fetch.',
    };
  }

  try {
    const url = new URL(config.n8nWebhookUrl);
    url.searchParams.set('email', email);

    console.log('[API] Fetching leads from n8n for:', email);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] n8n error:', response.status, errorText);
      return {
        success: false,
        leads: [],
        count: 0,
        error: `n8n returned ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    
    // Handle different response formats from n8n
    let leads: SalesforceLead[] = [];
    
    if (Array.isArray(data)) {
      leads = data;
    } else if (data.leads && Array.isArray(data.leads)) {
      leads = data.leads;
    } else if (data.data && Array.isArray(data.data)) {
      leads = data.data;
    }

    // Validate required fields
    leads = leads.filter(lead => 
      lead.Id && 
      lead.FirstName && 
      lead.LastName
    );

    console.log('[API] ✓ Fetched leads:', leads.length);

    return {
      success: true,
      leads,
      count: leads.length,
    };
  } catch (error) {
    console.error('[API] Fetch leads error:', error);
    return {
      success: false,
      leads: [],
      count: 0,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// =============================================================================
// LOG ACTIVITY (Zapier POST Webhook)
// =============================================================================

/**
 * Log LinkedIn activity to Salesforce via Zapier webhook
 * 
 * Expected Zapier workflow:
 * 1. Webhooks by Zapier → Catch Hook
 * 2. Salesforce → Update Lead
 *    - Prospecting_Step_LinkedIn__c = TRUE
 * 
 * @param payload - Activity data to log
 */
export async function logActivity(payload: LogActivityPayload): Promise<LogActivityResponse> {
  if (!config.zapierWebhookUrl) {
    return {
      success: false,
      error: 'Zapier webhook URL not configured. Go to Settings.',
    };
  }

  try {
    console.log('[API] Logging activity to Zapier:', payload.leadId);

    const response = await fetch(config.zapierWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] Zapier error:', response.status, errorText);
      return {
        success: false,
        error: `Zapier returned ${response.status}`,
      };
    }

    console.log('[API] ✓ Activity logged successfully');
    return { success: true };
  } catch (error) {
    console.error('[API] Log activity error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

// =============================================================================
// CONNECTION TESTS
// =============================================================================

/**
 * Test n8n webhook connection
 */
export async function testN8nConnection(): Promise<{ success: boolean; message: string }> {
  if (!config.n8nWebhookUrl) {
    return { success: false, message: 'n8n webhook URL not set' };
  }

  try {
    const response = await fetch(config.n8nWebhookUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    return response.ok 
      ? { success: true, message: `n8n connection OK (${response.status})` }
      : { success: false, message: `n8n returned ${response.status}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}

/**
 * Test Zapier webhook connection
 */
export async function testZapierConnection(): Promise<{ success: boolean; message: string }> {
  if (!config.zapierWebhookUrl) {
    return { success: false, message: 'Zapier webhook URL not set' };
  }

  try {
    const response = await fetch(config.zapierWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        action: 'connection_test',
      }),
    });

    return response.ok
      ? { success: true, message: `Zapier connection OK (${response.status})` }
      : { success: false, message: `Zapier returned ${response.status}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/lib/api.ts && echo "✓ API service compiles"
# Verify function signatures:
grep -q "fetchLeads(email: string)" src/lib/api.ts && echo "✓ fetchLeads signature correct"
grep -q "logActivity(payload: LogActivityPayload)" src/lib/api.ts && echo "✓ logActivity signature correct"
```

**Success Criteria:**
- TypeScript compiles without errors
- `fetchLeads(email)` makes GET to n8n
- `logActivity(payload)` makes POST to Zapier
- Payload includes: `leadId`, `sgaEmail`, `timestamp`, `action`

---

## Phase 5: LinkedIn Scraper (MutationObserver)

### Step 5.1: Create Robust LinkedIn Scraper

**Context:** Content script that extracts profile data using `MutationObserver` for reliable React hydration detection. This is the validated v3 scraper - DO NOT MODIFY the core scraping logic.

**Cursor Prompt:**
```text
Create `src/content/linkedin-scraper.ts` with MutationObserver-based hydration detection:

```typescript
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
  const message: ProfileScrapedMessage = {
    type: 'PROFILE_SCRAPED',
    payload: profile,
  };

  chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) {
      log('Error sending message:', chrome.runtime.lastError.message);
    } else {
      log('Profile sent to service worker:', response);
    }
  });
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
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/content/linkedin-scraper.ts && echo "✓ LinkedIn scraper compiles"
# Verify MutationObserver usage:
grep -q "MutationObserver" src/content/linkedin-scraper.ts && echo "✓ Uses MutationObserver"
# Verify NO setTimeout-based hydration:
grep -c "setTimeout" src/content/linkedin-scraper.ts | xargs -I {} echo "setTimeout count: {} (should be minimal, used only for delays)"
```

**Success Criteria:**
- TypeScript compiles without errors
- Uses `MutationObserver` for hydration detection (not just setTimeout)
- Handles SPA navigation with URL change detection
- Parses accreditations correctly

---

## Phase 6: Side Panel UI (No CSV Upload)

### Step 6.1: Create Side Panel HTML

**Context:** The UI has a "Sync Leads from Salesforce" button - NO file input for CSV.

**Cursor Prompt:**
```text
Create `src/sidepanel/index.html`:

IMPORTANT: This UI must NOT include:
- File input elements (<input type="file">)
- "Import CSV" buttons
- Any CSV-related UI

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SGA Velocity</title>
  <link rel="stylesheet" href="./styles.css">
</head>
<body class="bg-gray-100 min-h-screen">
  <div id="app" class="flex flex-col h-screen">
    
    <!-- Header -->
    <header class="bg-savvy-dark text-white p-4 flex-shrink-0">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-savvy-green rounded-full flex items-center justify-center font-bold">S</div>
          <h1 class="text-lg font-semibold">SGA Velocity</h1>
          <span class="text-xs text-gray-400 ml-1">v3.1</span>
        </div>
        <div id="auth-status" class="text-sm text-gray-300"></div>
      </div>
    </header>

    <!-- Auth Required Screen -->
    <div id="auth-screen" class="flex-1 flex items-center justify-center p-6 hidden">
      <div class="text-center">
        <div class="w-16 h-16 bg-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>
        <h2 class="text-xl font-semibold mb-2">Sign in Required</h2>
        <p id="auth-message" class="text-gray-600 mb-4">Please sign into Chrome with your @savvywealth.com account.</p>
        <button id="retry-auth-btn" class="bg-savvy-green hover:bg-savvy-green-dark text-white px-6 py-2 rounded-lg">
          Check Again
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div id="main-content" class="flex-1 flex flex-col overflow-hidden hidden">
      
      <!-- Sync Bar (NO CSV UPLOAD) -->
      <div class="bg-white border-b px-4 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <span id="lead-count" class="text-sm text-gray-600">0 leads</span>
          <span id="last-sync" class="text-xs text-gray-400 ml-2"></span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Sync Status Indicator -->
          <div id="sync-status" class="hidden">
            <span class="flex items-center gap-1 text-xs text-green-600">
              <span class="w-2 h-2 bg-green-500 rounded-full"></span>
              Synced
            </span>
          </div>
          <!-- Sync Button (NOT Import CSV) -->
          <button id="sync-btn" class="bg-savvy-green hover:bg-savvy-green-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <svg id="sync-icon" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span id="sync-text">Sync from Salesforce</span>
          </button>
        </div>
      </div>

      <!-- Lead Navigation -->
      <div id="lead-nav" class="bg-gray-50 border-b px-4 py-2 flex items-center justify-between flex-shrink-0 hidden">
        <button id="prev-lead" class="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" disabled>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
          </svg>
        </button>
        <span id="lead-position" class="text-sm text-gray-600">1 of 10</span>
        <button id="next-lead" class="p-2 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50" disabled>
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
          </svg>
        </button>
      </div>

      <!-- Current Lead Card -->
      <div id="lead-card" class="bg-white border-b p-4 flex-shrink-0 hidden">
        <div class="flex items-start justify-between">
          <div>
            <h2 id="lead-name" class="text-lg font-semibold text-gray-900">John Smith</h2>
            <p id="lead-title" class="text-sm text-gray-600">Financial Advisor at Acme Wealth</p>
            <p id="lead-location" class="text-xs text-gray-400 mt-1">New York, NY</p>
          </div>
          <div class="flex gap-2 items-center">
            <!-- Lead Score Badge -->
            <span id="lead-score" class="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full font-medium hidden">
              Score: 85
            </span>
            <a id="linkedin-link" href="#" target="_blank" class="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Open LinkedIn Profile">
              <svg class="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
            </a>
          </div>
        </div>
        <div id="lead-accreditations" class="mt-2 flex flex-wrap gap-1 hidden"></div>
        <div id="already-sent-badge" class="mt-2 hidden">
          <span class="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full">Already Sent</span>
        </div>
      </div>

      <!-- Scrape Status -->
      <div id="scrape-status" class="bg-blue-50 border-b border-blue-200 px-4 py-2 flex-shrink-0 hidden">
        <div class="flex items-center gap-2 text-sm text-blue-700">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Profile enriched from LinkedIn</span>
        </div>
      </div>

      <!-- Message Composer -->
      <div class="flex-1 flex flex-col overflow-hidden p-4">
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Template</label>
          <select id="template-select" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green">
            <option value="">Select a template...</option>
          </select>
        </div>

        <div class="flex-1 flex flex-col min-h-0">
          <label class="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <div class="flex-1 relative">
            <textarea 
              id="message-input" 
              class="w-full h-full border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-savvy-green focus:border-savvy-green"
              placeholder="Select a template or write your message..."
            ></textarea>
          </div>
          <div class="flex justify-between items-center mt-1">
            <span id="char-count" class="text-xs text-gray-400">0 characters</span>
            <span id="missing-vars" class="text-xs text-amber-600 hidden">Missing: company</span>
          </div>
        </div>

        <!-- Action Buttons -->
        <div class="mt-4 flex gap-2">
          <button id="copy-btn" class="flex-1 bg-savvy-green hover:bg-savvy-green-dark text-white px-4 py-3 rounded-lg font-medium transition-colors">
            📋 Copy Message
          </button>
          <button id="mark-sent-btn" class="flex-1 bg-gray-800 hover:bg-gray-900 text-white px-4 py-3 rounded-lg font-medium transition-colors">
            ✓ Sent
          </button>
        </div>
      </div>

      <!-- Footer -->
      <footer class="bg-gray-50 border-t px-4 py-2 flex justify-between items-center flex-shrink-0">
        <span class="text-xs text-gray-400">⌘+→ next | ⌘+S mark sent</span>
        <button id="settings-btn" class="p-2 hover:bg-gray-200 rounded-lg transition-colors" title="Settings">
          <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
          </svg>
        </button>
      </footer>
    </div>

    <!-- Settings Modal -->
    <div id="settings-modal" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
      <div class="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div class="p-4 border-b flex justify-between items-center">
          <h2 class="text-lg font-semibold">Settings</h2>
          <button id="close-settings" class="p-1 hover:bg-gray-100 rounded">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        <div class="p-4 space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">n8n Webhook URL (for fetching leads)</label>
            <input type="url" id="n8n-url-input" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://your-n8n.com/webhook/sga-leads">
            <button id="test-n8n-btn" class="mt-2 text-sm text-savvy-green hover:underline">Test Connection</button>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Zapier Webhook URL (for logging activity)</label>
            <input type="url" id="zapier-url-input" class="w-full border rounded-lg px-3 py-2 text-sm" placeholder="https://hooks.zapier.com/hooks/catch/...">
            <button id="test-zapier-btn" class="mt-2 text-sm text-savvy-green hover:underline">Test Connection</button>
          </div>
          <div class="flex items-center justify-between">
            <label class="text-sm text-gray-700">Auto-advance after marking sent</label>
            <input type="checkbox" id="auto-advance-toggle" class="w-4 h-4 text-savvy-green rounded" checked>
          </div>
          <button id="save-settings-btn" class="w-full bg-savvy-green hover:bg-savvy-green-dark text-white py-2 rounded-lg font-medium">
            Save Settings
          </button>
        </div>
      </div>
    </div>

    <!-- Toast Container -->
    <div id="toast-container" class="fixed bottom-4 right-4 flex flex-col gap-2 z-50"></div>
  </div>

  <script type="module" src="./main.ts"></script>
</body>
</html>
```
```

**Verification Command:**
```bash
# Verify NO CSV/file input elements:
! grep -q 'type="file"' src/sidepanel/index.html && echo "✓ No file input (correct)"
! grep -qi "csv" src/sidepanel/index.html && echo "✓ No CSV references (correct)"
grep -q "Sync from Salesforce" src/sidepanel/index.html && echo "✓ Sync button present"
```

**Success Criteria:**
- NO `<input type="file">` elements
- NO CSV-related text
- Has "Sync from Salesforce" button
- Has sync status indicator

---

### Step 6.2: Create Main Script with Auto-Fetch

**Context:** On init, calls `chrome.identity.getProfileUserInfo`, then auto-fetches leads if email is valid.

**Cursor Prompt:**
```text
Create `src/sidepanel/main.ts`:

CRITICAL REQUIREMENTS:
1. On init: Call getProfileUserInfo to get email
2. If email is @savvywealth.com: Auto-fetch leads from n8n
3. NO CSV import functionality

```typescript
// =============================================================================
// SGA VELOCITY SIDEBAR v3.1 - MAIN APPLICATION
// Auto-fetches leads on startup using chrome.identity.getProfileUserInfo
// =============================================================================

import type {
  AuthState,
  EnrichedLead,
  SalesforceLead,
  LinkedInProfile,
  MessageTemplate,
  ChromeMessage,
} from '../types';
import { DEFAULT_TEMPLATES } from '../types';
import { fetchLeads, logActivity, initApiConfig, setApiConfig, testN8nConnection, testZapierConnection } from '../lib/api';
import { authenticateUser, getAuthState, isAuthenticatedWithValidDomain } from '../lib/auth';
import { getCachedLeads, setCachedLeads, markLeadAsSent, getTemplates, getSettings, setSettings, getLastSyncTime } from '../lib/storage';
import { generateMessage, getMissingVariables } from '../lib/templates';

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

interface AppState {
  authState: AuthState;
  leads: EnrichedLead[];
  currentIndex: number;
  templates: MessageTemplate[];
  currentProfile: LinkedInProfile | null;
  isLoading: boolean;
  isSyncing: boolean;
}

const state: AppState = {
  authState: { isAuthenticated: false, email: null, isValidDomain: false },
  leads: [],
  currentIndex: 0,
  templates: DEFAULT_TEMPLATES,
  currentProfile: null,
  isLoading: true,
  isSyncing: false,
};

// -----------------------------------------------------------------------------
// DOM Elements
// -----------------------------------------------------------------------------

const elements = {
  authScreen: document.getElementById('auth-screen') as HTMLDivElement,
  mainContent: document.getElementById('main-content') as HTMLDivElement,
  authStatus: document.getElementById('auth-status') as HTMLDivElement,
  authMessage: document.getElementById('auth-message') as HTMLParagraphElement,
  retryAuthBtn: document.getElementById('retry-auth-btn') as HTMLButtonElement,
  
  syncBtn: document.getElementById('sync-btn') as HTMLButtonElement,
  syncIcon: document.getElementById('sync-icon') as SVGElement,
  syncText: document.getElementById('sync-text') as HTMLSpanElement,
  syncStatus: document.getElementById('sync-status') as HTMLDivElement,
  leadCount: document.getElementById('lead-count') as HTMLSpanElement,
  lastSync: document.getElementById('last-sync') as HTMLSpanElement,
  
  leadNav: document.getElementById('lead-nav') as HTMLDivElement,
  prevLead: document.getElementById('prev-lead') as HTMLButtonElement,
  nextLead: document.getElementById('next-lead') as HTMLButtonElement,
  leadPosition: document.getElementById('lead-position') as HTMLSpanElement,
  
  leadCard: document.getElementById('lead-card') as HTMLDivElement,
  leadName: document.getElementById('lead-name') as HTMLHeadingElement,
  leadTitle: document.getElementById('lead-title') as HTMLParagraphElement,
  leadLocation: document.getElementById('lead-location') as HTMLParagraphElement,
  leadAccreditations: document.getElementById('lead-accreditations') as HTMLDivElement,
  leadScore: document.getElementById('lead-score') as HTMLSpanElement,
  linkedinLink: document.getElementById('linkedin-link') as HTMLAnchorElement,
  alreadySentBadge: document.getElementById('already-sent-badge') as HTMLDivElement,
  scrapeStatus: document.getElementById('scrape-status') as HTMLDivElement,
  
  templateSelect: document.getElementById('template-select') as HTMLSelectElement,
  messageInput: document.getElementById('message-input') as HTMLTextAreaElement,
  charCount: document.getElementById('char-count') as HTMLSpanElement,
  missingVars: document.getElementById('missing-vars') as HTMLSpanElement,
  copyBtn: document.getElementById('copy-btn') as HTMLButtonElement,
  markSentBtn: document.getElementById('mark-sent-btn') as HTMLButtonElement,
  
  settingsBtn: document.getElementById('settings-btn') as HTMLButtonElement,
  settingsModal: document.getElementById('settings-modal') as HTMLDivElement,
  closeSettings: document.getElementById('close-settings') as HTMLButtonElement,
  n8nUrlInput: document.getElementById('n8n-url-input') as HTMLInputElement,
  zapierUrlInput: document.getElementById('zapier-url-input') as HTMLInputElement,
  autoAdvanceToggle: document.getElementById('auto-advance-toggle') as HTMLInputElement,
  testN8nBtn: document.getElementById('test-n8n-btn') as HTMLButtonElement,
  testZapierBtn: document.getElementById('test-zapier-btn') as HTMLButtonElement,
  saveSettingsBtn: document.getElementById('save-settings-btn') as HTMLButtonElement,
  
  toastContainer: document.getElementById('toast-container') as HTMLDivElement,
};

// -----------------------------------------------------------------------------
// INITIALIZATION - Auto-fetch on startup
// -----------------------------------------------------------------------------

async function init(): Promise<void> {
  console.log('[Main] Initializing SGA Velocity v3.1...');
  
  // 1. Initialize API config
  await initApiConfig();
  
  // 2. Load templates
  state.templates = await getTemplates();
  populateTemplateSelect();
  
  // 3. AUTHENTICATE using getProfileUserInfo
  console.log('[Main] Getting Chrome profile info...');
  state.authState = await authenticateUser();
  
  // 4. Update UI based on auth
  updateAuthUI();
  
  // 5. If authenticated with valid domain, AUTO-FETCH leads
  if (isAuthenticatedWithValidDomain()) {
    console.log('[Main] Valid @savvywealth.com email, auto-fetching leads...');
    
    // Load cached leads first (instant UI)
    state.leads = await getCachedLeads();
    updateLeadUI();
    
    // Update last sync time
    const lastSync = await getLastSyncTime();
    if (lastSync) {
      elements.lastSync.textContent = `Last sync: ${formatRelativeTime(lastSync)}`;
    }
    
    // AUTO-FETCH from n8n (if webhook configured)
    const config = await chrome.storage.local.get(['n8nWebhookUrl']);
    if (config.n8nWebhookUrl) {
      await handleSync();
    }
  }
  
  // 6. Set up event listeners
  setupEventListeners();
  
  // 7. Listen for profile updates
  chrome.runtime.onMessage.addListener((message: ChromeMessage) => {
    if (message.type === 'PROFILE_UPDATE') {
      handleProfileUpdate(message.payload as LinkedInProfile);
    }
  });
  
  // 8. Get initial scraped profile
  chrome.runtime.sendMessage({ type: 'GET_SCRAPED_PROFILE' }, (response) => {
    if (response?.profile) {
      handleProfileUpdate(response.profile);
    }
  });
  
  state.isLoading = false;
  console.log('[Main] ✓ Initialization complete');
}

// -----------------------------------------------------------------------------
// Event Listeners
// -----------------------------------------------------------------------------

function setupEventListeners(): void {
  elements.retryAuthBtn.addEventListener('click', handleRetryAuth);
  elements.syncBtn.addEventListener('click', handleSync);
  
  elements.prevLead.addEventListener('click', () => navigateLead(-1));
  elements.nextLead.addEventListener('click', () => navigateLead(1));
  
  elements.templateSelect.addEventListener('change', handleTemplateChange);
  elements.messageInput.addEventListener('input', updateCharCount);
  elements.copyBtn.addEventListener('click', handleCopy);
  elements.markSentBtn.addEventListener('click', handleMarkSent);
  
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.closeSettings.addEventListener('click', closeSettingsModal);
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  elements.testN8nBtn.addEventListener('click', handleTestN8n);
  elements.testZapierBtn.addEventListener('click', handleTestZapier);
  
  elements.settingsModal.addEventListener('click', (e) => {
    if (e.target === elements.settingsModal) closeSettingsModal();
  });
  
  document.addEventListener('keydown', handleKeyboard);
}

// -----------------------------------------------------------------------------
// Auth Handlers
// -----------------------------------------------------------------------------

async function handleRetryAuth(): Promise<void> {
  elements.retryAuthBtn.disabled = true;
  elements.retryAuthBtn.textContent = 'Checking...';
  
  state.authState = await authenticateUser();
  updateAuthUI();
  
  if (isAuthenticatedWithValidDomain()) {
    showToast('Authenticated successfully!', 'success');
    const config = await chrome.storage.local.get(['n8nWebhookUrl']);
    if (config.n8nWebhookUrl) {
      await handleSync();
    }
  }
  
  elements.retryAuthBtn.disabled = false;
  elements.retryAuthBtn.textContent = 'Check Again';
}

function updateAuthUI(): void {
  if (isAuthenticatedWithValidDomain()) {
    elements.authScreen.classList.add('hidden');
    elements.mainContent.classList.remove('hidden');
    elements.authStatus.textContent = state.authState.email || '';
  } else {
    elements.authScreen.classList.remove('hidden');
    elements.mainContent.classList.add('hidden');
    
    if (state.authState.isAuthenticated && !state.authState.isValidDomain) {
      elements.authMessage.textContent = `Signed in as ${state.authState.email}, but requires @savvywealth.com account.`;
    } else {
      elements.authMessage.textContent = 'Please sign into Chrome with your @savvywealth.com account.';
    }
  }
}

// -----------------------------------------------------------------------------
// Sync Handler (n8n Fetch)
// -----------------------------------------------------------------------------

async function handleSync(): Promise<void> {
  if (state.isSyncing || !state.authState.email) return;
  
  state.isSyncing = true;
  elements.syncIcon.classList.add('animate-spin');
  elements.syncText.textContent = 'Syncing...';
  elements.syncBtn.disabled = true;
  
  try {
    const response = await fetchLeads(state.authState.email);
    
    if (response.success) {
      state.leads = response.leads.map(convertToEnrichedLead);
      state.currentIndex = 0;
      
      await setCachedLeads(state.leads);
      updateLeadUI();
      
      elements.lastSync.textContent = 'Last sync: just now';
      elements.syncStatus.classList.remove('hidden');
      
      showToast(`Synced ${response.count} leads`, 'success');
    } else {
      showToast(response.error || 'Sync failed', 'error');
    }
  } catch (error) {
    showToast('Sync failed', 'error');
  } finally {
    state.isSyncing = false;
    elements.syncIcon.classList.remove('animate-spin');
    elements.syncText.textContent = 'Sync from Salesforce';
    elements.syncBtn.disabled = false;
  }
}

function convertToEnrichedLead(sf: SalesforceLead): EnrichedLead {
  return {
    ...sf,
    fullName: `${sf.FirstName} ${sf.LastName}`.trim(),
  };
}

// -----------------------------------------------------------------------------
// Lead Navigation & Display
// -----------------------------------------------------------------------------

function updateLeadUI(): void {
  const lead = state.leads[state.currentIndex];
  const count = state.leads.length;
  
  elements.leadCount.textContent = `${count} leads`;
  
  if (count === 0) {
    elements.leadNav.classList.add('hidden');
    elements.leadCard.classList.add('hidden');
    elements.scrapeStatus.classList.add('hidden');
    return;
  }
  
  elements.leadNav.classList.remove('hidden');
  elements.leadCard.classList.remove('hidden');
  elements.leadPosition.textContent = `${state.currentIndex + 1} of ${count}`;
  elements.prevLead.disabled = state.currentIndex === 0;
  elements.nextLead.disabled = state.currentIndex === count - 1;
  
  if (lead) displayLead(lead);
}

function displayLead(lead: EnrichedLead): void {
  elements.leadName.textContent = lead.fullName;
  
  const title = lead.scrapedTitle || lead.Title || '';
  const company = lead.scrapedCompany || lead.Company || '';
  elements.leadTitle.textContent = title && company ? `${title} at ${company}` : title || company || 'No title';
  
  elements.leadLocation.textContent = lead.location || '';
  elements.leadLocation.classList.toggle('hidden', !lead.location);
  
  // Lead Score
  if (lead.Savvy_Lead_Score__c !== null && lead.Savvy_Lead_Score__c !== undefined) {
    elements.leadScore.textContent = `Score: ${lead.Savvy_Lead_Score__c}`;
    elements.leadScore.classList.remove('hidden');
  } else {
    elements.leadScore.classList.add('hidden');
  }
  
  // Accreditations
  if (lead.accreditations && lead.accreditations.length > 0) {
    elements.leadAccreditations.innerHTML = lead.accreditations
      .map(a => `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">${a}</span>`)
      .join('');
    elements.leadAccreditations.classList.remove('hidden');
  } else {
    elements.leadAccreditations.classList.add('hidden');
  }
  
  // LinkedIn link
  const linkedinUrl = lead.linkedInUrl || lead.LinkedIn_Profile_Apollo__c;
  if (linkedinUrl) {
    elements.linkedinLink.href = linkedinUrl;
    elements.linkedinLink.classList.remove('hidden');
  } else {
    elements.linkedinLink.classList.add('hidden');
  }
  
  // Already sent badge
  elements.alreadySentBadge.classList.toggle('hidden', !lead.Prospecting_Step_LinkedIn__c);
  
  // Scrape status
  elements.scrapeStatus.classList.toggle('hidden', !lead.scrapedAt);
  
  // Mark sent button
  elements.markSentBtn.disabled = lead.Prospecting_Step_LinkedIn__c;
  elements.markSentBtn.textContent = lead.Prospecting_Step_LinkedIn__c ? '✓ Already Sent' : '✓ Sent';
  
  // Generate message if template selected
  if (elements.templateSelect.value) handleTemplateChange();
}

function navigateLead(direction: number): void {
  const newIndex = state.currentIndex + direction;
  if (newIndex >= 0 && newIndex < state.leads.length) {
    state.currentIndex = newIndex;
    state.currentProfile = null;
    updateLeadUI();
  }
}

// -----------------------------------------------------------------------------
// Profile Update Handler
// -----------------------------------------------------------------------------

function handleProfileUpdate(profile: LinkedInProfile): void {
  console.log('[Main] Profile update:', profile.fullName);
  state.currentProfile = profile;
  
  const currentLead = state.leads[state.currentIndex];
  if (currentLead) {
    const leadLinkedIn = currentLead.LinkedIn_Profile_Apollo__c?.toLowerCase() || '';
    const profileUrl = profile.profileUrl.toLowerCase();
    
    const isMatch = 
      (leadLinkedIn && profileUrl.includes(leadLinkedIn.split('/in/')[1]?.split('/')[0] || '___')) ||
      (currentLead.FirstName.toLowerCase() === profile.firstName.toLowerCase() &&
       currentLead.LastName.toLowerCase() === profile.lastName.toLowerCase());
    
    if (isMatch) {
      currentLead.scrapedTitle = profile.title;
      currentLead.scrapedCompany = profile.company;
      currentLead.headline = profile.headline;
      currentLead.location = profile.location;
      currentLead.accreditations = profile.accreditations;
      currentLead.linkedInUrl = profile.profileUrl;
      currentLead.scrapedAt = profile.scrapedAt;
      
      displayLead(currentLead);
    }
  }
}

// -----------------------------------------------------------------------------
// Template & Message Handling
// -----------------------------------------------------------------------------

function populateTemplateSelect(): void {
  elements.templateSelect.innerHTML = '<option value="">Select a template...</option>';
  state.templates.forEach(t => {
    const option = document.createElement('option');
    option.value = t.id;
    option.textContent = t.name;
    if (t.isDefault) option.selected = true;
    elements.templateSelect.appendChild(option);
  });
}

function handleTemplateChange(): void {
  const templateId = elements.templateSelect.value;
  if (!templateId) {
    elements.messageInput.value = '';
    updateCharCount();
    return;
  }
  
  const template = state.templates.find(t => t.id === templateId);
  const lead = state.leads[state.currentIndex];
  if (!template || !lead) return;
  
  const message = generateMessage(template.content, lead, state.currentProfile);
  elements.messageInput.value = message;
  updateCharCount();
  
  const missing = getMissingVariables(template.content, lead, state.currentProfile);
  if (missing.length > 0) {
    elements.missingVars.textContent = `Missing: ${missing.join(', ')}`;
    elements.missingVars.classList.remove('hidden');
  } else {
    elements.missingVars.classList.add('hidden');
  }
}

function updateCharCount(): void {
  const count = elements.messageInput.value.length;
  elements.charCount.textContent = `${count} characters`;
  elements.charCount.classList.toggle('text-amber-600', count > 300);
}

// -----------------------------------------------------------------------------
// Action Handlers
// -----------------------------------------------------------------------------

async function handleCopy(): Promise<void> {
  const message = elements.messageInput.value.trim();
  if (!message) {
    showToast('No message to copy', 'error');
    return;
  }
  
  try {
    await navigator.clipboard.writeText(message);
    showToast('Message copied!', 'success');
    elements.copyBtn.textContent = '✓ Copied!';
    setTimeout(() => { elements.copyBtn.textContent = '📋 Copy Message'; }, 2000);
  } catch (error) {
    showToast('Failed to copy', 'error');
  }
}

async function handleMarkSent(): Promise<void> {
  const lead = state.leads[state.currentIndex];
  if (!lead || lead.Prospecting_Step_LinkedIn__c) return;
  
  elements.markSentBtn.disabled = true;
  elements.markSentBtn.textContent = 'Saving...';
  
  try {
    const response = await logActivity({
      leadId: lead.Id,
      sgaEmail: state.authState.email || '',
      timestamp: new Date().toISOString(),
      action: 'linkedin_sent',
    });
    
    if (response.success) {
      lead.Prospecting_Step_LinkedIn__c = true;
      await markLeadAsSent(lead.Id, elements.messageInput.value);
      
      showToast('Marked as sent!', 'success');
      
      const settings = await getSettings();
      if (settings.autoAdvanceOnSend && state.currentIndex < state.leads.length - 1) {
        setTimeout(() => navigateLead(1), 500);
      } else {
        elements.markSentBtn.textContent = '✓ Already Sent';
      }
    } else {
      showToast(response.error || 'Failed to save', 'error');
      elements.markSentBtn.disabled = false;
      elements.markSentBtn.textContent = '✓ Sent';
    }
  } catch (error) {
    showToast('Failed to save', 'error');
    elements.markSentBtn.disabled = false;
    elements.markSentBtn.textContent = '✓ Sent';
  }
}

// -----------------------------------------------------------------------------
// Settings Handlers
// -----------------------------------------------------------------------------

async function openSettings(): Promise<void> {
  const settings = await getSettings();
  elements.n8nUrlInput.value = settings.n8nWebhookUrl;
  elements.zapierUrlInput.value = settings.zapierWebhookUrl;
  elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
  elements.settingsModal.classList.remove('hidden');
}

function closeSettingsModal(): void {
  elements.settingsModal.classList.add('hidden');
}

async function handleSaveSettings(): Promise<void> {
  const n8nUrl = elements.n8nUrlInput.value.trim();
  const zapierUrl = elements.zapierUrlInput.value.trim();
  const autoAdvance = elements.autoAdvanceToggle.checked;
  
  await setSettings({ n8nWebhookUrl: n8nUrl, zapierWebhookUrl: zapierUrl, autoAdvanceOnSend: autoAdvance });
  await setApiConfig({ n8nWebhookUrl: n8nUrl, zapierWebhookUrl: zapierUrl });
  
  showToast('Settings saved!', 'success');
  closeSettingsModal();
}

async function handleTestN8n(): Promise<void> {
  elements.testN8nBtn.disabled = true;
  elements.testN8nBtn.textContent = 'Testing...';
  
  await setApiConfig({ n8nWebhookUrl: elements.n8nUrlInput.value.trim(), zapierWebhookUrl: elements.zapierUrlInput.value.trim() });
  const result = await testN8nConnection();
  showToast(result.message, result.success ? 'success' : 'error');
  
  elements.testN8nBtn.disabled = false;
  elements.testN8nBtn.textContent = 'Test Connection';
}

async function handleTestZapier(): Promise<void> {
  elements.testZapierBtn.disabled = true;
  elements.testZapierBtn.textContent = 'Testing...';
  
  await setApiConfig({ n8nWebhookUrl: elements.n8nUrlInput.value.trim(), zapierWebhookUrl: elements.zapierUrlInput.value.trim() });
  const result = await testZapierConnection();
  showToast(result.message, result.success ? 'success' : 'error');
  
  elements.testZapierBtn.disabled = false;
  elements.testZapierBtn.textContent = 'Test Connection';
}

// -----------------------------------------------------------------------------
// Keyboard Shortcuts
// -----------------------------------------------------------------------------

function handleKeyboard(e: KeyboardEvent): void {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target === elements.messageInput) {
      e.preventDefault();
      handleCopy();
    }
    return;
  }
  
  switch (e.key) {
    case 'ArrowLeft': navigateLead(-1); break;
    case 'ArrowRight': navigateLead(1); break;
  }
  
  if (e.metaKey || e.ctrlKey) {
    if (e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleMarkSent();
    }
  }
}

// -----------------------------------------------------------------------------
// Toast Notifications
// -----------------------------------------------------------------------------

function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 ${
    type === 'success' ? 'bg-green-500 text-white' :
    type === 'error' ? 'bg-red-500 text-white' : 'bg-gray-700 text-white'
  }`;
  
  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
  toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
  
  elements.toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

// -----------------------------------------------------------------------------
// Start Application
// -----------------------------------------------------------------------------

init();
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/sidepanel/main.ts && echo "✓ Main script compiles"
# Verify auto-fetch on init:
grep -q "AUTO-FETCH" src/sidepanel/main.ts && echo "✓ Auto-fetch implemented"
# Verify uses authenticateUser (getProfileUserInfo):
grep -q "authenticateUser" src/sidepanel/main.ts && echo "✓ Uses getProfileUserInfo auth"
# Verify NO CSV imports:
! grep -qi "csv" src/sidepanel/main.ts && echo "✓ No CSV references"
```

**Success Criteria:**
- TypeScript compiles without errors
- `init()` calls `authenticateUser()` (which uses `getProfileUserInfo`)
- Auto-fetches leads on startup if valid domain
- NO CSV import functionality

---

## Phase 7: Supporting Files

### Step 7.1: Create Storage Service

**Context:** Local storage wrapper using strict Salesforce types.

**Cursor Prompt:**
```typescript
Create `src/lib/storage.ts`:

import { 
  STORAGE_KEYS, 
  EnrichedLead, 
  MessageTemplate, 
  ApiConfig,
  DEFAULT_TEMPLATES
} from '../types';

// =============================================================================
// GENERIC STORAGE HELPERS
// =============================================================================

async function get<T>(key: string, defaultValue: T): Promise<T> {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? defaultValue;
}

async function set<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

// =============================================================================
// LEADS (EnrichedLead[])
// =============================================================================

export async function getCachedLeads(): Promise<EnrichedLead[]> {
  return get<EnrichedLead[]>(STORAGE_KEYS.LEADS_CACHE, []);
}

export async function setCachedLeads(leads: EnrichedLead[]): Promise<void> {
  await set(STORAGE_KEYS.LEADS_CACHE, leads);
  await set(STORAGE_KEYS.LAST_SYNC, Date.now());
}

/**
 * Updates local cache to mark a lead as sent.
 * Uses strict Salesforce field name: Prospecting_Step_LinkedIn__c
 */
export async function markLeadAsSent(leadId: string, messageBody?: string): Promise<void> {
  const leads = await getCachedLeads();
  const index = leads.findIndex(l => l.Id === leadId);
  
  if (index !== -1) {
    leads[index] = {
      ...leads[index],
      Prospecting_Step_LinkedIn__c: true, // STRICT SALESFORCE FIELD
      messageGenerated: true,
      generatedMessage: messageBody || leads[index].generatedMessage
    };
    await setCachedLeads(leads);
  }
}

export async function getLastSyncTime(): Promise<number | null> {
  return get<number | null>(STORAGE_KEYS.LAST_SYNC, null);
}

// =============================================================================
// TEMPLATES
// =============================================================================

export async function getTemplates(): Promise<MessageTemplate[]> {
  const templates = await get<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  return templates.length > 0 ? templates : DEFAULT_TEMPLATES;
}

export async function setTemplates(templates: MessageTemplate[]): Promise<void> {
  await set(STORAGE_KEYS.TEMPLATES, templates);
}

// =============================================================================
// SETTINGS
// =============================================================================

export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  zapierWebhookUrl: '',
  autoAdvanceOnSend: true
};

export async function getSettings(): Promise<AppSettings> {
  return get<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function setSettings(settings: AppSettings): Promise<void> {
  await set(STORAGE_KEYS.SETTINGS, settings);
}
```
```

### Step 7.2: Create Template Service

*[Same as v3 - no changes needed, create src/lib/templates.ts]*

### Step 7.3: Create Service Worker

**Cursor Prompt:**
```text
Create `src/background/service-worker.ts`:

```typescript
// =============================================================================
// SERVICE WORKER v3.1 - Message Routing & Lifecycle
// =============================================================================

import type { ChromeMessage, LinkedInProfile } from '../types';

console.log('[Service Worker] Starting v3.1...');

// Side Panel Management
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Profile Cache
let cachedProfile: LinkedInProfile | null = null;

// Message Handling
chrome.runtime.onMessage.addListener((message: ChromeMessage, sender, sendResponse) => {
  console.log('[Service Worker] Message:', message.type);

  switch (message.type) {
    case 'PROFILE_SCRAPED':
      cachedProfile = message.payload as LinkedInProfile;
      chrome.runtime.sendMessage({ type: 'PROFILE_UPDATE', payload: cachedProfile }).catch(() => {});
      sendResponse({ success: true });
      break;

    case 'GET_SCRAPED_PROFILE':
      sendResponse({ profile: cachedProfile });
      break;

    case 'GET_AUTH_STATE':
      // Auth is handled in sidepanel via getProfileUserInfo
      sendResponse({ authState: null });
      break;

    default:
      sendResponse({ error: 'Unknown message type' });
  }

  return false;
});

// Clear cache on non-profile pages
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.includes('linkedin.com/in/')) {
    cachedProfile = null;
  }
});

console.log('[Service Worker] ✓ Initialized');
```
```

**Verification Command:**
```bash
npx tsc --noEmit src/background/service-worker.ts && echo "✓ Service worker compiles"
```

---

## Phase 8: Build & Test

### Step 8.1: Build and Load Extension

**Cursor Prompt:**
```text
Build and verify the extension:

1. Run the build:
```bash
npm run build
```

2. The `dist/` folder should contain:
   - manifest.json
   - icons/
   - sidepanel/index.html
   - service-worker.js
   - linkedin-scraper.js

3. Load in Chrome:
   - Go to chrome://extensions
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist/` folder

4. Verify NO OAuth setup needed:
   - Extension should read Chrome profile email automatically
   - No Google Cloud Console setup required (we use getProfileUserInfo)
```

**Verification Command:**
```bash
npm run build && \
test -f dist/manifest.json && \
test -f dist/service-worker.js && \
test -f dist/linkedin-scraper.js && \
! grep -q "csv" dist/*.js && \
echo "✓ Build successful, no CSV code"
```

**Success Criteria:**
- Build completes without errors
- All files present in `dist/`
- NO CSV-related code in output
- Extension loads without errors

---

### Step 8.2: Testing Checklist

```markdown
# SGA Velocity Sidebar v3.1 - Testing Checklist

## Pre-flight
- [ ] User signed into Chrome with @savvywealth.com account
- [ ] n8n webhook URL configured in Settings
- [ ] Zapier webhook URL configured in Settings

## Authentication (getProfileUserInfo)
- [ ] Extension automatically detects Chrome profile email
- [ ] Shows error if not @savvywealth.com domain
- [ ] "Check Again" button re-checks profile
- [ ] Email displayed in header

## Sync (n8n)
- [ ] "Sync from Salesforce" button triggers fetch
- [ ] Spinner shows during sync
- [ ] Leads populate after sync
- [ ] "Synced" indicator shows
- [ ] Auto-sync on startup (if webhook configured)

## Lead Display
- [ ] Lead score badge shows (if Savvy_Lead_Score__c present)
- [ ] Accreditations display
- [ ] "Already Sent" badge for sent leads

## LinkedIn Scraper
- [ ] Navigate to LinkedIn profile
- [ ] Profile auto-scraped
- [ ] Enriches lead card
- [ ] "Profile enriched" indicator shows

## Actions
- [ ] "Copy Message" copies to clipboard
- [ ] "✓ Sent" logs to Zapier
- [ ] Salesforce Lead updates

## Settings
- [ ] n8n URL saves
- [ ] Zapier URL saves
- [ ] Test connections work

## Verification: NO CSV
- [ ] No file input in UI
- [ ] No "Import CSV" button
- [ ] No CSV parser code
```

---

## Summary

### Files Created

| File | Purpose |
|------|---------|
| `src/types/index.ts` | TypeScript types (Salesforce schema + `Savvy_Lead_Score__c`) |
| `src/lib/api.ts` | n8n + Zapier API integration |
| `src/lib/auth.ts` | `chrome.identity.getProfileUserInfo` authentication |
| `src/lib/storage.ts` | Chrome storage utilities |
| `src/lib/templates.ts` | Message template generation |
| `src/content/linkedin-scraper.ts` | LinkedIn DOM scraper (MutationObserver) |
| `src/background/service-worker.ts` | Message routing & lifecycle |
| `src/sidepanel/index.html` | Side panel UI (NO CSV input) |
| `src/sidepanel/styles.css` | Tailwind styles |
| `src/sidepanel/main.ts` | Application logic (auto-fetch on init) |
| `public/manifest.json` | Chrome extension manifest |

### Files NOT Created (Removed from v2)

| File | Reason |
|------|--------|
| `src/lib/csv-parser.ts` | Replaced by n8n API |
| File input in HTML | Replaced by "Sync" button |

### Key Design Decisions

1. **`getProfileUserInfo` instead of `getAuthToken`:** Simpler, no OAuth dance, just reads Chrome profile
2. **Auto-fetch on init:** Leads sync automatically when extension opens
3. **n8n for reads:** Returns JSON arrays (Zapier cannot)
4. **Zapier for writes:** Team familiarity
5. **MutationObserver:** Reliable React hydration detection
6. **`Savvy_Lead_Score__c`:** Included in schema per spec

### SOQL Query (for n8n)

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
WHERE OwnerId IN (SELECT Id FROM User WHERE Email = :sgaEmail)
  AND Prospecting_Step_LinkedIn__c = false
  AND Status IN ('New', 'Contacting')
  AND LinkedIn_Profile_Apollo__c != null
ORDER BY Savvy_Lead_Score__c DESC NULLS LAST
LIMIT 200
```

---

*Document Version: 3.1 - Hybrid Salesforce Architecture (Simplified Auth)*  
*December 2025*
