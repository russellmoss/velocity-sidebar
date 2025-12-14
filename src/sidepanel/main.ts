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
  uniqueLists: string[];
  selectedListFilter: string;
}

const state: AppState = {
  authState: { isAuthenticated: false, email: null, isValidDomain: false },
  leads: [],
  currentIndex: 0,
  templates: DEFAULT_TEMPLATES,
  currentProfile: null,
  isLoading: true,
  isSyncing: false,
  uniqueLists: [],
  selectedListFilter: 'all',
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
  syncIcon: document.getElementById('sync-icon') as HTMLElement,
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
  
  listFilter: document.getElementById('list-filter') as HTMLSelectElement,
  unsentFilter: document.getElementById('unsent-filter') as HTMLInputElement,
  
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
    
    // Extract unique lists and populate filter
    extractUniqueLists(state.leads);
    populateListFilter();
    
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
  
  elements.listFilter.addEventListener('change', handleListFilterChange);
  elements.unsentFilter.addEventListener('change', handleUnsentFilterChange);
  
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
      
      // Extract unique lists and populate filter
      extractUniqueLists(state.leads);
      populateListFilter();
      
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
// List Filtering Functions
// -----------------------------------------------------------------------------

/**
 * Extract unique list names from leads
 */
function extractUniqueLists(leads: EnrichedLead[]): void {
  const lists = new Set<string>();
  leads.forEach(lead => {
    if (lead.Lead_List_Name__c) {
      lists.add(lead.Lead_List_Name__c);
    }
  });
  state.uniqueLists = Array.from(lists).sort();
}

/**
 * Populate the list filter dropdown
 */
function populateListFilter(): void {
  elements.listFilter.innerHTML = '<option value="all">All Lists</option>';
  state.uniqueLists.forEach(listName => {
    const option = document.createElement('option');
    option.value = listName;
    option.textContent = listName;
    elements.listFilter.appendChild(option);
  });
  
  // Restore selected filter if it still exists
  if (state.selectedListFilter !== 'all' && state.uniqueLists.includes(state.selectedListFilter)) {
    elements.listFilter.value = state.selectedListFilter;
  } else {
    elements.listFilter.value = 'all';
    state.selectedListFilter = 'all';
  }
}

/**
 * Get filtered leads based on current filter settings
 */
function getFilteredLeads(): EnrichedLead[] {
  let filtered = [...state.leads];
  
  // Filter by list name
  if (state.selectedListFilter !== 'all') {
    filtered = filtered.filter(lead => lead.Lead_List_Name__c === state.selectedListFilter);
  }
  
  // Filter by unsent status
  if (elements.unsentFilter.checked) {
    filtered = filtered.filter(lead => !lead.Prospecting_Step_LinkedIn__c);
  }
  
  return filtered;
}

/**
 * Handle list filter change
 */
function handleListFilterChange(): void {
  state.selectedListFilter = elements.listFilter.value;
  state.currentIndex = 0;
  updateLeadUI();
}

/**
 * Handle unsent filter change
 */
function handleUnsentFilterChange(): void {
  state.currentIndex = 0;
  updateLeadUI();
}

// -----------------------------------------------------------------------------
// Lead Navigation & Display
// -----------------------------------------------------------------------------

function updateLeadUI(): void {
  const filteredLeads = getFilteredLeads();
  const lead = filteredLeads[state.currentIndex];
  const count = filteredLeads.length;
  
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
  
  // Update lead count to show filtered count
  const totalCount = state.leads.length;
  if (count < totalCount) {
    elements.leadCount.textContent = `${count} of ${totalCount} leads`;
  } else {
    elements.leadCount.textContent = `${count} leads`;
  }
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
  const filteredLeads = getFilteredLeads();
  const newIndex = state.currentIndex + direction;
  if (newIndex >= 0 && newIndex < filteredLeads.length) {
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
  
  const filteredLeads = getFilteredLeads();
  const currentLead = filteredLeads[state.currentIndex];
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
  const filteredLeads = getFilteredLeads();
  const lead = filteredLeads[state.currentIndex];
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
  const filteredLeads = getFilteredLeads();
  const lead = filteredLeads[state.currentIndex];
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
      const filteredLeads = getFilteredLeads();
      if (settings.autoAdvanceOnSend && state.currentIndex < filteredLeads.length - 1) {
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
