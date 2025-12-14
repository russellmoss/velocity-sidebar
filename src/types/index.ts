// =============================================================================
// SGA VELOCITY SIDEBAR v3.1 - TYPE DEFINITIONS
// Hybrid Architecture: n8n (read & write) + Salesforce
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
  
  /** Lead list name (custom field) */
  Lead_List_Name__c: string | null;
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

/** Request to n8n webhook (for logging activity) */
export interface LogActivityPayload {
  leadId: string;
  sgaEmail: string;
  timestamp: string;
  action: 'linkedin_sent';
}

/** Response from n8n webhook (for logging activity) */
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
  n8nWebhookUrl: string; // For fetching leads
  n8nLoggingWebhookUrl: string; // For logging message sent
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
