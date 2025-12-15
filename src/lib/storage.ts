import { 
  STORAGE_KEYS, 
  EnrichedLead, 
  MessageTemplate, 
  ApiConfig,
  DEFAULT_TEMPLATES,
  CreateTemplatePayload,
  UpdateTemplatePayload
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
// SYNC STORAGE HELPERS (for user-specific data)
// =============================================================================

async function getSync<T>(key: string, defaultValue: T): Promise<T> {
  const result = await chrome.storage.sync.get(key);
  return result[key] ?? defaultValue;
}

async function setSync<T>(key: string, value: T): Promise<void> {
  await chrome.storage.sync.set({ [key]: value });
}

async function removeSync(keys: string | string[]): Promise<void> {
  await chrome.storage.sync.remove(keys);
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
// USER TEMPLATES (chrome.storage.sync - user-specific, syncs across devices)
// =============================================================================

/**
 * Get user's templates (their custom templates + system defaults)
 * Uses chrome.storage.sync which is tied to the Chrome profile
 */
export async function getUserTemplates(): Promise<MessageTemplate[]> {
  // Get user's custom templates from sync storage
  const userTemplates = await getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  
  // Get IDs of deleted default templates
  const deletedDefaults = await getSync<string[]>(STORAGE_KEYS.DELETED_DEFAULTS, []);
  
  // Filter out defaults that user has deleted or overridden
  const userTemplateIds = new Set(userTemplates.map(t => t.id));
  const overriddenIds = new Set(
    userTemplates
      .filter(t => t.id.startsWith('user-copy-'))
      .map(t => t.id.replace('user-copy-', ''))
  );
  
  const activeDefaults = DEFAULT_TEMPLATES.filter(
    t => !deletedDefaults.includes(t.id) && !overriddenIds.has(t.id)
  );
  
  // Merge: User templates first, then remaining defaults
  return [...userTemplates, ...activeDefaults];
}

/**
 * Get only user-created templates (excludes defaults)
 */
export async function getUserCreatedTemplates(): Promise<MessageTemplate[]> {
  return getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
}

/**
 * Get list of deleted default template IDs
 */
export async function getDeletedDefaultIds(): Promise<string[]> {
  return getSync<string[]>(STORAGE_KEYS.DELETED_DEFAULTS, []);
}

/**
 * Create a new user template
 */
export async function createTemplate(
  payload: CreateTemplatePayload,
  userEmail: string
): Promise<MessageTemplate> {
  const userTemplates = await getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  
  const newTemplate: MessageTemplate = {
    id: `user-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: payload.name,
    content: payload.content,
    category: payload.category,
    isDefault: false,
    isUserCreated: true,
    createdBy: userEmail,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  
  userTemplates.push(newTemplate);
  await setSync(STORAGE_KEYS.TEMPLATES, userTemplates);
  
  console.log('[Storage] Created template:', newTemplate.id);
  return newTemplate;
}

/**
 * Update an existing template
 * - For user templates: updates in place
 * - For default templates: creates a user copy and hides the original
 */
export async function updateTemplate(
  templateId: string,
  updates: UpdateTemplatePayload,
  userEmail: string
): Promise<MessageTemplate | null> {
  const userTemplates = await getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  const deletedDefaults = await getSync<string[]>(STORAGE_KEYS.DELETED_DEFAULTS, []);
  
  // Check if it's a user template
  const userIndex = userTemplates.findIndex(t => t.id === templateId);
  
  if (userIndex !== -1) {
    // Update existing user template
    userTemplates[userIndex] = {
      ...userTemplates[userIndex],
      ...updates,
      updatedAt: Date.now(),
    };
    await setSync(STORAGE_KEYS.TEMPLATES, userTemplates);
    console.log('[Storage] Updated user template:', templateId);
    return userTemplates[userIndex];
  }
  
  // Check if it's a default template being edited
  const defaultTemplate = DEFAULT_TEMPLATES.find(t => t.id === templateId);
  if (defaultTemplate) {
    // Create a user copy with the updates
    const userCopy: MessageTemplate = {
      ...defaultTemplate,
      ...updates,
      id: `user-copy-${templateId}`,
      isDefault: false,
      isUserCreated: true,
      createdBy: userEmail,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    userTemplates.push(userCopy);
    
    // Mark original default as deleted so we show the user copy instead
    if (!deletedDefaults.includes(templateId)) {
      deletedDefaults.push(templateId);
    }
    
    await setSync(STORAGE_KEYS.TEMPLATES, userTemplates);
    await setSync(STORAGE_KEYS.DELETED_DEFAULTS, deletedDefaults);
    
    console.log('[Storage] Created user copy of default template:', userCopy.id);
    return userCopy;
  }
  
  console.warn('[Storage] Template not found for update:', templateId);
  return null;
}

/**
 * Delete a template
 * - For user templates: removes from storage
 * - For default templates: marks as deleted (hidden)
 */
export async function deleteTemplate(templateId: string): Promise<boolean> {
  const userTemplates = await getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  const deletedDefaults = await getSync<string[]>(STORAGE_KEYS.DELETED_DEFAULTS, []);
  
  // Check if it's a user template
  const userIndex = userTemplates.findIndex(t => t.id === templateId);
  if (userIndex !== -1) {
    const removed = userTemplates.splice(userIndex, 1)[0];
    await setSync(STORAGE_KEYS.TEMPLATES, userTemplates);
    console.log('[Storage] Deleted user template:', removed.name);
    return true;
  }
  
  // Check if it's a default template
  const isDefault = DEFAULT_TEMPLATES.some(t => t.id === templateId);
  if (isDefault && !deletedDefaults.includes(templateId)) {
    deletedDefaults.push(templateId);
    await setSync(STORAGE_KEYS.DELETED_DEFAULTS, deletedDefaults);
    console.log('[Storage] Hidden default template:', templateId);
    return true;
  }
  
  console.warn('[Storage] Template not found for deletion:', templateId);
  return false;
}

/**
 * Restore a deleted default template
 */
export async function restoreDefaultTemplate(templateId: string): Promise<boolean> {
  const deletedDefaults = await getSync<string[]>(STORAGE_KEYS.DELETED_DEFAULTS, []);
  const userTemplates = await getSync<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  
  // Remove from deleted list
  const deletedIndex = deletedDefaults.indexOf(templateId);
  if (deletedIndex !== -1) {
    deletedDefaults.splice(deletedIndex, 1);
    await setSync(STORAGE_KEYS.DELETED_DEFAULTS, deletedDefaults);
  }
  
  // Also remove any user copy if it exists
  const copyId = `user-copy-${templateId}`;
  const copyIndex = userTemplates.findIndex(t => t.id === copyId);
  if (copyIndex !== -1) {
    userTemplates.splice(copyIndex, 1);
    await setSync(STORAGE_KEYS.TEMPLATES, userTemplates);
  }
  
  console.log('[Storage] Restored default template:', templateId);
  return true;
}

/**
 * Reset all templates to defaults (clear ALL user customizations)
 * WARNING: This is destructive!
 */
export async function resetTemplatesToDefaults(): Promise<void> {
  await removeSync([STORAGE_KEYS.TEMPLATES, STORAGE_KEYS.DELETED_DEFAULTS]);
  console.log('[Storage] Reset all templates to defaults');
}

/**
 * Get a single template by ID
 */
export async function getTemplateById(templateId: string): Promise<MessageTemplate | null> {
  const allTemplates = await getUserTemplates();
  return allTemplates.find(t => t.id === templateId) || null;
}

/**
 * Duplicate an existing template
 */
export async function duplicateTemplate(
  templateId: string,
  userEmail: string
): Promise<MessageTemplate | null> {
  const template = await getTemplateById(templateId);
  if (!template) return null;
  
  return createTemplate(
    {
      name: `${template.name} (Copy)`,
      content: template.content,
      category: template.category,
    },
    userEmail
  );
}

// =============================================================================
// SETTINGS
// =============================================================================

export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
  fluxCapacitorEnabled: boolean;  // Power-user mode for high-velocity outreach
  recruiterRedirectEnabled: boolean;  // Auto-redirect public profiles to LinkedIn Recruiter
  autoOpenMessageComposer: boolean;  // Auto-click Message button on Recruiter profile
}

const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true,
  fluxCapacitorEnabled: false,  // Disabled by default - power users opt-in
  recruiterRedirectEnabled: false,  // Disabled by default - requires LinkedIn Recruiter access
  autoOpenMessageComposer: false  // Disabled by default - sub-feature of Recruiter Mode
};

export async function getSettings(): Promise<AppSettings> {
  return get<AppSettings>(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export async function setSettings(settings: AppSettings): Promise<void> {
  await set(STORAGE_KEYS.SETTINGS, settings);
}
