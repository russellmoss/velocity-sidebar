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
