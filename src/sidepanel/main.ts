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
import { DEFAULT_TEMPLATES, getSalesforceUrl } from '../types';
import { fetchLeads, logActivity, initApiConfig, setApiConfig, testN8nConnection, testN8nLoggingConnection } from '../lib/api';
import { authenticateUser, getAuthState, isAuthenticatedWithValidDomain } from '../lib/auth';
import { 
  getCachedLeads, 
  setCachedLeads, 
  markLeadAsSent, 
  getUserTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  getDeletedDefaultIds,
  restoreDefaultTemplate,
  resetTemplatesToDefaults,
  getTemplateById,
  duplicateTemplate,
  getSettings, 
  setSettings, 
  getLastSyncTime 
} from '../lib/storage';
import type { CreateTemplatePayload, UpdateTemplatePayload } from '../types';
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
  uniqueStatuses: string[];
  selectedStatusFilter: string;
  nameSearchQuery: string;
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
  uniqueStatuses: [],
  selectedStatusFilter: 'all',
  nameSearchQuery: '',
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
  salesforceLink: document.getElementById('salesforce-link') as HTMLAnchorElement,
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
  n8nLoggingUrlInput: document.getElementById('n8n-logging-url-input') as HTMLInputElement,
  autoAdvanceToggle: document.getElementById('auto-advance-toggle') as HTMLInputElement,
  fluxCapacitorToggle: document.getElementById('flux-capacitor-toggle') as HTMLInputElement,
  fluxIndicator: document.getElementById('flux-indicator') as HTMLSpanElement,
  recruiterRedirectToggle: document.getElementById('recruiter-redirect-toggle') as HTMLInputElement,
  autoOpenMessageToggle: document.getElementById('auto-open-message-toggle') as HTMLInputElement,
  recruiterIndicator: document.getElementById('recruiter-indicator') as HTMLSpanElement,
  testN8nBtn: document.getElementById('test-n8n-btn') as HTMLButtonElement,
  testN8nLoggingBtn: document.getElementById('test-n8n-logging-btn') as HTMLButtonElement,
  saveSettingsBtn: document.getElementById('save-settings-btn') as HTMLButtonElement,
  
  listFilterInput: document.getElementById('list-filter-input') as HTMLInputElement,
  listFilterDropdown: document.getElementById('list-filter-dropdown') as HTMLDivElement,
  listFilterToggle: document.getElementById('list-filter-toggle') as HTMLButtonElement,
  nameSearchInput: document.getElementById('name-search-input') as HTMLInputElement,
  statusFilter: document.getElementById('status-filter') as HTMLSelectElement,
  doNotCallFilter: document.getElementById('donotcall-filter') as HTMLInputElement,
  unsentFilter: document.getElementById('unsent-filter') as HTMLInputElement,
  
  // Template Manager Elements
  templateModal: document.getElementById('template-modal') as HTMLDivElement,
  templateModalTitle: document.getElementById('template-modal-title') as HTMLHeadingElement,
  closeTemplateModalBtn: document.getElementById('close-template-modal') as HTMLButtonElement,
  templateListView: document.getElementById('template-list-view') as HTMLDivElement,
  templateEditorView: document.getElementById('template-editor-view') as HTMLDivElement,
  templateList: document.getElementById('template-list') as HTMLDivElement,
  newTemplateBtn: document.getElementById('new-template-btn') as HTMLButtonElement,
  manageTemplatesBtn: document.getElementById('manage-templates-btn') as HTMLButtonElement,
  templateForm: document.getElementById('template-form') as HTMLFormElement,
  editTemplateId: document.getElementById('edit-template-id') as HTMLInputElement,
  editTemplateName: document.getElementById('edit-template-name') as HTMLInputElement,
  editTemplateCategory: document.getElementById('edit-template-category') as HTMLSelectElement,
  editTemplateContent: document.getElementById('edit-template-content') as HTMLTextAreaElement,
  contentCharCount: document.getElementById('content-char-count') as HTMLSpanElement,
  cancelTemplateBtn: document.getElementById('cancel-template-btn') as HTMLButtonElement,
  saveTemplateBtn: document.getElementById('save-template-btn') as HTMLButtonElement,
  restoreDefaultsSection: document.getElementById('restore-defaults-section') as HTMLDivElement,
  deletedCount: document.getElementById('deleted-count') as HTMLSpanElement,
  restoreAllDefaultsBtn: document.getElementById('restore-all-defaults-btn') as HTMLButtonElement,
  // Delete Confirmation Modal
  deleteConfirmModal: document.getElementById('delete-confirm-modal') as HTMLDivElement,
  deleteTemplateName: document.getElementById('delete-template-name') as HTMLParagraphElement,
  cancelDeleteBtn: document.getElementById('cancel-delete-btn') as HTMLButtonElement,
  confirmDeleteBtn: document.getElementById('confirm-delete-btn') as HTMLButtonElement,
  
  toastContainer: document.getElementById('toast-container') as HTMLDivElement,
};

// -----------------------------------------------------------------------------
// INITIALIZATION - Auto-fetch on startup
// -----------------------------------------------------------------------------

async function init(): Promise<void> {
  console.log('[Main] Initializing SGA Velocity v3.1...');
  
  // 1. Initialize API config
  await initApiConfig();
  
  // 2. Load templates (now uses user-specific storage)
  state.templates = await getUserTemplates();
  await populateTemplateSelect();
  
  // 3. AUTHENTICATE using getProfileUserInfo
  console.log('[Main] Getting Chrome profile info...');
  state.authState = await authenticateUser();
  
  // 4. Update UI based on auth
  updateAuthUI();
  
  // 5. If authenticated with valid domain, AUTO-FETCH leads
  if (isAuthenticatedWithValidDomain()) {
    console.log('[Main] Valid @savvywealth.com email, auto-fetching leads...');
    
    // Load cached leads first (instant UI)
    state.leads = sortLeadsByLastName(await getCachedLeads());
    
    // Extract unique lists and statuses, populate filters
    extractUniqueLists(state.leads);
    extractUniqueStatuses(state.leads);
    populateListFilter();
    populateStatusFilter();
    
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
  
  // 9. Initialize mode indicators
  const settings = await getSettings();
  updateFluxIndicator(settings.fluxCapacitorEnabled);
  updateRecruiterIndicator(settings.recruiterRedirectEnabled);
  
  state.isLoading = false;
  console.log('[Main] ✓ Initialization complete');
}

// -----------------------------------------------------------------------------
// Event Listeners
// -----------------------------------------------------------------------------

function setupEventListeners(): void {
  elements.retryAuthBtn.addEventListener('click', handleRetryAuth);
  elements.syncBtn.addEventListener('click', handleSync);
  
  elements.prevLead.addEventListener('click', () => navigateLead(-1).catch(console.error));
  elements.nextLead.addEventListener('click', () => navigateLead(1).catch(console.error));
  
  elements.templateSelect.addEventListener('change', handleTemplateChange);
  elements.messageInput.addEventListener('input', updateCharCount);
  elements.copyBtn.addEventListener('click', handleCopy);
  elements.markSentBtn.addEventListener('click', handleMarkSent);
  
  // List filter searchable dropdown
  elements.listFilterInput.addEventListener('input', handleListFilterInput);
  elements.listFilterInput.addEventListener('focus', () => {
    elements.listFilterDropdown.classList.remove('hidden');
    elements.listFilterDropdown.classList.add('show');
    updateListFilterDropdown();
  });
  elements.listFilterInput.addEventListener('blur', () => {
    // Delay hiding to allow click events to fire
    setTimeout(() => {
      elements.listFilterDropdown.classList.add('hidden');
      elements.listFilterDropdown.classList.remove('show');
    }, 200);
  });
  elements.listFilterToggle.addEventListener('click', () => {
    elements.listFilterInput.focus();
  });
  
  // Handle dropdown option clicks
  elements.listFilterDropdown.addEventListener('click', (e) => {
    const option = (e.target as HTMLElement).closest('.list-filter-option') as HTMLElement;
    if (option && option.dataset.value) {
      handleListFilterSelect(option.dataset.value);
    }
  });
  
  // Keyboard navigation for dropdown
  let selectedOptionIndex = -1;
  elements.listFilterInput.addEventListener('keydown', (e) => {
    const options = Array.from(elements.listFilterDropdown.querySelectorAll('.list-filter-option')) as HTMLElement[];
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedOptionIndex = Math.min(selectedOptionIndex + 1, options.length - 1);
      options[selectedOptionIndex]?.scrollIntoView({ block: 'nearest' });
      options.forEach((opt, idx) => {
        opt.classList.toggle('bg-gray-200', idx === selectedOptionIndex);
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedOptionIndex = Math.max(selectedOptionIndex - 1, -1);
      if (selectedOptionIndex >= 0) {
        options[selectedOptionIndex]?.scrollIntoView({ block: 'nearest' });
      }
      options.forEach((opt, idx) => {
        opt.classList.toggle('bg-gray-200', idx === selectedOptionIndex);
      });
    } else if (e.key === 'Enter' && selectedOptionIndex >= 0) {
      e.preventDefault();
      const option = options[selectedOptionIndex];
      if (option && option.dataset.value) {
        handleListFilterSelect(option.dataset.value);
      }
    } else if (e.key === 'Escape') {
      elements.listFilterDropdown.classList.add('hidden');
      elements.listFilterDropdown.classList.remove('show');
      elements.listFilterInput.blur();
    } else {
      selectedOptionIndex = -1; // Reset on typing
    }
  });
  
  elements.unsentFilter.addEventListener('change', handleUnsentFilterChange);
  
  // Name search filter
  elements.nameSearchInput.addEventListener('input', handleNameSearchInput);
  
  // Status filter
  elements.statusFilter.addEventListener('change', handleStatusFilterChange);
  
  // DoNotCall filter
  elements.doNotCallFilter.addEventListener('change', handleDoNotCallFilterChange);
  
  elements.settingsBtn.addEventListener('click', openSettings);
  elements.closeSettings.addEventListener('click', closeSettingsModal);
  elements.saveSettingsBtn.addEventListener('click', handleSaveSettings);
  
  // Add recruiter mode toggle dependency
  elements.recruiterRedirectToggle.addEventListener('change', () => {
    elements.autoOpenMessageToggle.disabled = !elements.recruiterRedirectToggle.checked;
    // If disabling recruiter mode, also disable auto-open
    if (!elements.recruiterRedirectToggle.checked) {
      elements.autoOpenMessageToggle.checked = false;
    }
  });
  
  // Template Manager Event Listeners
  elements.manageTemplatesBtn?.addEventListener('click', openTemplateModal);
  elements.closeTemplateModalBtn?.addEventListener('click', closeTemplateModal);
  elements.newTemplateBtn?.addEventListener('click', () => showTemplateEditor());
  elements.cancelTemplateBtn?.addEventListener('click', showTemplateList);
  elements.templateForm?.addEventListener('submit', handleTemplateSubmit);
  elements.editTemplateContent?.addEventListener('input', updateContentCharCount);
  elements.restoreAllDefaultsBtn?.addEventListener('click', handleRestoreAllDefaults);
  
  // Event delegation for template action buttons (edit, duplicate, delete)
  elements.templateList?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const button = target.closest('.template-action-btn') as HTMLButtonElement;
    if (!button) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const action = button.dataset.action;
    const templateId = button.dataset.templateId;
    const templateName = button.dataset.templateName;
    
    console.log('[Template Manager] Button clicked:', { action, templateId, templateName });
    
    if (!templateId) {
      console.warn('[Template Manager] No template ID found');
      return;
    }
    
    switch (action) {
      case 'edit':
        console.log('[Template Manager] Edit action triggered');
        handleEditTemplate(templateId);
        break;
      case 'duplicate':
        console.log('[Template Manager] Duplicate action triggered');
        handleDuplicateTemplate(templateId);
        break;
      case 'delete':
        if (templateName) {
          console.log('[Template Manager] Delete action triggered');
          handleDeleteTemplate(templateId, templateName);
        }
        break;
      default:
        console.warn('[Template Manager] Unknown action:', action);
    }
  });
  
  // Delete confirmation modal
  elements.cancelDeleteBtn?.addEventListener('click', closeDeleteModal);
  elements.confirmDeleteBtn?.addEventListener('click', confirmDeleteTemplate);
  
  // Close modals on backdrop click
  elements.templateModal?.addEventListener('click', (e) => {
    if (e.target === elements.templateModal) closeTemplateModal();
  });
  elements.deleteConfirmModal?.addEventListener('click', (e) => {
    if (e.target === elements.deleteConfirmModal) closeDeleteModal();
  });
  
  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!elements.deleteConfirmModal.classList.contains('hidden')) {
        closeDeleteModal();
      } else if (!elements.templateModal.classList.contains('hidden')) {
        closeTemplateModal();
      }
    }
  });
  elements.testN8nBtn.addEventListener('click', handleTestN8n);
  elements.testN8nLoggingBtn.addEventListener('click', handleTestN8nLogging);
  
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
      // Convert and sort leads alphabetically by last name
      state.leads = sortLeadsByLastName(response.leads.map(convertToEnrichedLead));
      state.currentIndex = 0;
      
      await setCachedLeads(state.leads);
      
      // Extract unique lists and populate filter
      extractUniqueLists(state.leads);
      extractUniqueStatuses(state.leads);
      populateListFilter();
      populateStatusFilter();
      
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

/**
 * Sort leads alphabetically by last name, then first name
 */
function sortLeadsByLastName(leads: EnrichedLead[]): EnrichedLead[] {
  return [...leads].sort((a, b) => {
    // Sort by last name (case-insensitive)
    const lastNameA = (a.LastName || '').toLowerCase();
    const lastNameB = (b.LastName || '').toLowerCase();
    
    if (lastNameA < lastNameB) return -1;
    if (lastNameA > lastNameB) return 1;
    
    // If last names are equal, sort by first name
    const firstNameA = (a.FirstName || '').toLowerCase();
    const firstNameB = (b.FirstName || '').toLowerCase();
    
    if (firstNameA < firstNameB) return -1;
    if (firstNameA > firstNameB) return 1;
    
    return 0;
  });
}

// -----------------------------------------------------------------------------
// List Filtering Functions
// -----------------------------------------------------------------------------

/**
 * Extract unique list names from leads
 * Includes both Lead_List_Name__c and SGA_Self_List_name__c
 */
function extractUniqueLists(leads: EnrichedLead[]): void {
  const lists = new Set<string>();
  leads.forEach(lead => {
    // Add Lead_List_Name__c if present
    if (lead.Lead_List_Name__c) {
      lists.add(lead.Lead_List_Name__c);
    }
    // Add SGA_Self_List_name__c if present
    if (lead.SGA_Self_List_name__c) {
      lists.add(lead.SGA_Self_List_name__c);
    }
  });
  state.uniqueLists = Array.from(lists).sort();
}

/**
 * Extract unique status values from leads
 */
function extractUniqueStatuses(leads: EnrichedLead[]): void {
  const statuses = new Set<string>();
  leads.forEach(lead => {
    if (lead.Status) {
      statuses.add(lead.Status);
    }
  });
  state.uniqueStatuses = Array.from(statuses).sort();
}

/**
 * Populate the status filter dropdown
 */
function populateStatusFilter(): void {
  const select = elements.statusFilter;
  // Clear existing options except "All Statuses"
  select.innerHTML = '<option value="all">All Statuses</option>';
  
  // Add unique statuses
  state.uniqueStatuses.forEach(status => {
    const option = document.createElement('option');
    option.value = status;
    option.textContent = status;
    select.appendChild(option);
  });
  
  // Restore selected status if it still exists
  if (state.selectedStatusFilter !== 'all' && state.uniqueStatuses.includes(state.selectedStatusFilter)) {
    select.value = state.selectedStatusFilter;
  } else {
    select.value = 'all';
    state.selectedStatusFilter = 'all';
  }
}

/**
 * Simple fuzzy search - checks if query matches string (case-insensitive, partial match)
 */
function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Exact match gets highest priority
  if (textLower === queryLower) return true;
  
  // Starts with query
  if (textLower.startsWith(queryLower)) return true;
  
  // Contains query
  if (textLower.includes(queryLower)) return true;
  
  // Fuzzy match: all characters in query appear in order in text
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

/**
 * Populate the list filter dropdown with searchable options
 */
function populateListFilter(): void {
  updateListFilterDropdown();
  
  // Restore selected filter if it still exists
  if (state.selectedListFilter !== 'all' && state.uniqueLists.includes(state.selectedListFilter)) {
    elements.listFilterInput.value = state.selectedListFilter;
  } else {
    elements.listFilterInput.value = '';
    state.selectedListFilter = 'all';
  }
}

/**
 * Update the dropdown with filtered results based on search query
 */
function updateListFilterDropdown(): void {
  const query = elements.listFilterInput.value.trim().toLowerCase();
  const dropdown = elements.listFilterDropdown;
  
  // Clear existing options
  dropdown.innerHTML = '';
  
  // Always show "All Lists" option
  const allOption = document.createElement('div');
  allOption.className = 'px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer list-filter-option';
  allOption.dataset.value = 'all';
  allOption.textContent = 'All Lists';
  if (state.selectedListFilter === 'all') {
    allOption.classList.add('bg-savvy-green', 'text-white');
    allOption.classList.remove('text-gray-700', 'hover:bg-gray-100');
  }
  dropdown.appendChild(allOption);
  
  // Filter and show matching lists
  const filteredLists = state.uniqueLists.filter(listName => {
    if (!query) return true;
    return fuzzyMatch(query, listName);
  });
  
  filteredLists.forEach(listName => {
    const option = document.createElement('div');
    option.className = 'px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 cursor-pointer list-filter-option';
    option.dataset.value = listName;
    option.textContent = listName;
    
    if (state.selectedListFilter === listName) {
      option.classList.add('bg-savvy-green', 'text-white');
      option.classList.remove('text-gray-700', 'hover:bg-gray-100');
    }
    
    dropdown.appendChild(option);
  });
  
  // Show dropdown if there's a query or if it should be visible
  if (query || dropdown.classList.contains('show')) {
    dropdown.classList.remove('hidden');
    dropdown.classList.add('show');
  }
}

/**
 * Get filtered leads based on current filter settings
 * Returns leads sorted alphabetically by last name, then first name
 * Filters by: list name, status, DoNotCall, unsent status, and name search
 */
function getFilteredLeads(): EnrichedLead[] {
  let filtered = [...state.leads];
  
  // Filter by list name (checks both Lead_List_Name__c and SGA_Self_List_name__c)
  if (state.selectedListFilter !== 'all') {
    filtered = filtered.filter(lead => 
      lead.Lead_List_Name__c === state.selectedListFilter ||
      lead.SGA_Self_List_name__c === state.selectedListFilter
    );
  }
  
  // Filter by status
  if (state.selectedStatusFilter !== 'all') {
    filtered = filtered.filter(lead => lead.Status === state.selectedStatusFilter);
  }
  
  // Filter by DoNotCall (exclude if checkbox is checked)
  if (elements.doNotCallFilter.checked) {
    filtered = filtered.filter(lead => !lead.DoNotCall);
  }
  
  // Filter by unsent status
  if (elements.unsentFilter.checked) {
    filtered = filtered.filter(lead => !lead.Prospecting_Step_LinkedIn__c);
  }
  
  // Filter by name search (fuzzy match on first or last name)
  if (state.nameSearchQuery.trim()) {
    const query = state.nameSearchQuery.trim().toLowerCase();
    filtered = filtered.filter(lead => {
      const firstName = (lead.FirstName || '').toLowerCase();
      const lastName = (lead.LastName || '').toLowerCase();
      const fullName = `${firstName} ${lastName}`.trim();
      
      return fuzzyMatch(query, firstName) || 
             fuzzyMatch(query, lastName) || 
             fuzzyMatch(query, fullName);
    });
  }
  
  // Ensure filtered results are sorted (in case filtering changed order)
  return sortLeadsByLastName(filtered);
}

/**
 * Handle list filter selection from dropdown
 */
function handleListFilterSelect(value: string): void {
  state.selectedListFilter = value;
  if (value === 'all') {
    elements.listFilterInput.value = '';
  } else {
    elements.listFilterInput.value = value;
  }
  elements.listFilterDropdown.classList.add('hidden');
  elements.listFilterDropdown.classList.remove('show');
  state.currentIndex = 0;
  updateLeadUI();
  updateListFilterDropdown(); // Update to show selected state
}

/**
 * Handle list filter input change (search)
 */
function handleListFilterInput(): void {
  const query = elements.listFilterInput.value.trim();
  updateListFilterDropdown();
  
  // If exact match found, auto-select it
  if (query) {
    const exactMatch = state.uniqueLists.find(list => 
      list.toLowerCase() === query.toLowerCase()
    );
    if (exactMatch && state.selectedListFilter !== exactMatch) {
      handleListFilterSelect(exactMatch);
      return;
    }
  } else if (state.selectedListFilter !== 'all') {
    // If cleared and not already "all", reset to "all"
    handleListFilterSelect('all');
    return;
  }
  
  // Just update dropdown, don't change filter yet
  updateListFilterDropdown();
}

/**
 * Handle unsent filter change
 */
function handleUnsentFilterChange(): void {
  state.currentIndex = 0;
  updateLeadUI();
}

/**
 * Handle name search input
 */
function handleNameSearchInput(): void {
  state.nameSearchQuery = elements.nameSearchInput.value;
  state.currentIndex = 0;
  updateLeadUI();
}

/**
 * Handle status filter change
 */
function handleStatusFilterChange(): void {
  state.selectedStatusFilter = elements.statusFilter.value;
  state.currentIndex = 0;
  updateLeadUI();
}

/**
 * Handle DoNotCall filter change
 */
function handleDoNotCallFilterChange(): void {
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
  
  // Salesforce link
  const salesforceUrl = getSalesforceUrl(lead.Id);
  if (elements.salesforceLink) {
    if (salesforceUrl) {
      elements.salesforceLink.href = salesforceUrl;
      elements.salesforceLink.classList.remove('hidden');
    } else {
      elements.salesforceLink.classList.add('hidden');
    }
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

/**
 * Navigate to next/previous lead
 * When Flux Capacitor is enabled:
 * - Navigates to LinkedIn profile in same window
 * - Auto-copies message to clipboard
 */
async function navigateLead(direction: number): Promise<void> {
  const filteredLeads = getFilteredLeads();
  const newIndex = state.currentIndex + direction;
  
  if (newIndex < 0 || newIndex >= filteredLeads.length) {
    return; // Out of bounds
  }
  
  state.currentIndex = newIndex;
  state.currentProfile = null;
  updateLeadUI();
  
  // Check if Flux Capacitor is enabled
  const settings = await getSettings();
  if (settings.fluxCapacitorEnabled) {
    const lead = filteredLeads[newIndex];
    
    // Auto-copy message to clipboard
    await fluxAutoCopy();
    
    // Navigate to LinkedIn profile in same window
    // Use linkedInUrl (from enriched lead) or fallback to LinkedIn_Profile_Apollo__c
    const linkedInUrl = lead.linkedInUrl || lead.LinkedIn_Profile_Apollo__c;
    if (linkedInUrl) {
      await fluxNavigateToProfile(linkedInUrl);
    }
  }
}

/**
 * Flux Capacitor: Auto-copy current message to clipboard
 */
async function fluxAutoCopy(): Promise<void> {
  const messageText = elements.messageInput.value;
  
  if (messageText && messageText.trim()) {
    try {
      await navigator.clipboard.writeText(messageText);
      showToast('⚡ Message copied!', 'success');
    } catch (err) {
      console.error('[Flux] Failed to copy:', err);
    }
  }
}

/**
 * Flux Capacitor: Navigate to LinkedIn profile in same window
 */
async function fluxNavigateToProfile(url: string): Promise<void> {
  try {
    // Get the current active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (tab?.id) {
      // Update the current tab's URL instead of opening a new one
      await chrome.tabs.update(tab.id, { url: url });
    }
  } catch (err) {
    console.error('[Flux] Navigation error:', err);
    // Fallback: open in same window via window.open with _top
    window.open(url, '_top');
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

async function populateTemplateSelect(): Promise<void> {
  // Fetch latest templates (includes user's custom + active defaults)
  state.templates = await getUserTemplates();
  
  elements.templateSelect.innerHTML = '<option value="">Select a template...</option>';
  
  // Group templates by category
  const categories: Record<string, MessageTemplate[]> = {
    intro: [],
    followup: [],
    reconnect: [],
    custom: [],
  };
  
  state.templates.forEach(t => {
    if (categories[t.category]) {
      categories[t.category].push(t);
    } else {
      categories.custom.push(t);
    }
  });
  
  // Add optgroups for each category with templates
  const categoryLabels: Record<string, string> = {
    intro: '📨 Introduction',
    followup: '🔄 Follow-up',
    reconnect: '🔗 Reconnect',
    custom: '⭐ Custom',
  };
  
  for (const [cat, templates] of Object.entries(categories)) {
    if (templates.length === 0) continue;
    
    const optgroup = document.createElement('optgroup');
    optgroup.label = categoryLabels[cat] || cat;
    
    templates.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id;
      option.textContent = t.isUserCreated ? `${t.name} ★` : t.name;
      if (t.isDefault) option.selected = true;
      optgroup.appendChild(option);
    });
    
    elements.templateSelect.appendChild(optgroup);
  }
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
      // Auto-advance only if Flux Capacitor is disabled (Flux already navigates to profile)
      if (settings.autoAdvanceOnSend && !settings.fluxCapacitorEnabled && state.currentIndex < filteredLeads.length - 1) {
        setTimeout(() => navigateLead(1).catch(console.error), 500);
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

// =============================================================================
// TEMPLATE MANAGER
// =============================================================================

let templateToDelete: string | null = null;

/**
 * Open the template manager modal
 */
function openTemplateModal(): void {
  elements.templateModal.classList.remove('hidden');
  showTemplateList();
}

/**
 * Close the template manager modal
 */
function closeTemplateModal(): void {
  elements.templateModal.classList.add('hidden');
  templateToDelete = null;
}

/**
 * Show the template list view
 */
async function showTemplateList(): Promise<void> {
  elements.templateListView.classList.remove('hidden');
  elements.templateEditorView.classList.add('hidden');
  elements.templateModalTitle.textContent = 'Manage Templates';
  
  const templates = await getUserTemplates();
  const deletedDefaults = await getDeletedDefaultIds();
  
  // Update restore defaults section visibility
  if (deletedDefaults.length > 0) {
    elements.restoreDefaultsSection.classList.remove('hidden');
    elements.deletedCount.textContent = `${deletedDefaults.length} template${deletedDefaults.length > 1 ? 's' : ''} hidden`;
  } else {
    elements.restoreDefaultsSection.classList.add('hidden');
  }
  
  // Render template list
  if (templates.length === 0) {
    elements.templateList.innerHTML = `
      <div class="text-center py-8 text-gray-400">
        <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>No templates found</p>
        <p class="text-xs mt-1">Click "New Template" to create one</p>
      </div>
    `;
    return;
  }
  
  elements.templateList.innerHTML = templates.map(t => {
    const categoryColors: Record<string, string> = {
      intro: 'bg-blue-100 text-blue-700',
      followup: 'bg-purple-100 text-purple-700',
      reconnect: 'bg-amber-100 text-amber-700',
      custom: 'bg-gray-100 text-gray-700',
    };
    
    const categoryBadge = categoryColors[t.category] || categoryColors.custom;
    const truncatedContent = t.content.length > 80 ? t.content.substring(0, 80) + '...' : t.content;
    
    return `
      <div class="group flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors ${t.isDefault ? 'border-l-4 border-l-savvy-green' : ''}" data-template-id="${t.id}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="font-medium text-sm text-gray-800 truncate">${escapeHtml(t.name)}</span>
            <span class="text-xs px-1.5 py-0.5 rounded ${categoryBadge}">${t.category}</span>
            ${t.isDefault ? '<span class="text-xs bg-savvy-green/10 text-savvy-green px-1.5 py-0.5 rounded">Default</span>' : ''}
            ${t.isUserCreated ? '<span class="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">Custom</span>' : ''}
          </div>
          <p class="text-xs text-gray-500 mt-1 line-clamp-2">${escapeHtml(truncatedContent)}</p>
        </div>
        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button 
            data-action="edit"
            data-template-id="${t.id}"
            class="p-1.5 hover:bg-gray-200 rounded transition-colors template-action-btn" 
            title="Edit"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button 
            data-action="duplicate"
            data-template-id="${t.id}"
            class="p-1.5 hover:bg-gray-200 rounded transition-colors template-action-btn" 
            title="Duplicate"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
          <button 
            data-action="delete"
            data-template-id="${t.id}"
            data-template-name="${escapeHtml(t.name)}"
            class="p-1.5 hover:bg-red-100 rounded transition-colors template-action-btn" 
            title="Delete"
          >
            <svg class="w-4 h-4 text-gray-500 hover:text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Show the template editor view
 */
async function showTemplateEditor(templateId?: string): Promise<void> {
  console.log('[Template Manager] showTemplateEditor called with ID:', templateId);
  elements.templateListView.classList.add('hidden');
  elements.templateEditorView.classList.remove('hidden');
  
  // Reset form
  elements.templateForm.reset();
  elements.editTemplateId.value = '';
  updateContentCharCount();
  
  if (templateId) {
    // Edit existing template
    console.log('[Template Manager] Loading template for edit:', templateId);
    const template = await getTemplateById(templateId);
    console.log('[Template Manager] Template loaded:', template);
    if (template) {
      elements.templateModalTitle.textContent = 'Edit Template';
      elements.editTemplateId.value = template.id;
      elements.editTemplateName.value = template.name;
      elements.editTemplateCategory.value = template.category;
      elements.editTemplateContent.value = template.content;
      updateContentCharCount();
      console.log('[Template Manager] Form populated with template data');
    } else {
      console.error('[Template Manager] Template not found:', templateId);
      showToast('Template not found', 'error');
      showTemplateList();
    }
  } else {
    // New template
    elements.templateModalTitle.textContent = 'New Template';
    elements.editTemplateCategory.value = 'custom';
  }
}

/**
 * Update character count for content textarea
 */
function updateContentCharCount(): void {
  const count = elements.editTemplateContent.value.length;
  elements.contentCharCount.textContent = `${count}/2000`;
  elements.contentCharCount.classList.toggle('text-amber-600', count > 1500);
  elements.contentCharCount.classList.toggle('text-red-600', count > 1900);
}

/**
 * Handle template form submission
 */
async function handleTemplateSubmit(e: Event): Promise<void> {
  e.preventDefault();
  
  const name = elements.editTemplateName.value.trim();
  const category = elements.editTemplateCategory.value as MessageTemplate['category'];
  const content = elements.editTemplateContent.value.trim();
  const templateId = elements.editTemplateId.value;
  
  if (!name || !content) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  try {
    elements.saveTemplateBtn.disabled = true;
    elements.saveTemplateBtn.textContent = 'Saving...';
    
    if (templateId) {
      // Update existing
      await updateTemplate(templateId, { name, category, content }, state.authState.email!);
      showToast('Template updated!', 'success');
    } else {
      // Create new
      await createTemplate({ name, category, content }, state.authState.email!);
      showToast('Template created!', 'success');
    }
    
    // Refresh templates in state and dropdown
    await populateTemplateSelect();
    showTemplateList();
    
  } catch (err) {
    console.error('[Main] Template save error:', err);
    showToast('Failed to save template', 'error');
  } finally {
    elements.saveTemplateBtn.disabled = false;
    elements.saveTemplateBtn.textContent = 'Save Template';
  }
}

/**
 * Handle template deletion with confirmation
 */
function handleDeleteTemplate(templateId: string, templateName: string): void {
  templateToDelete = templateId;
  elements.deleteTemplateName.textContent = `Delete "${templateName}"? This action cannot be undone.`;
  elements.deleteConfirmModal.classList.remove('hidden');
}

/**
 * Confirm and execute template deletion
 */
async function confirmDeleteTemplate(): Promise<void> {
  if (!templateToDelete) return;
  
  try {
    await deleteTemplate(templateToDelete);
    showToast('Template deleted', 'success');
    
    // Refresh
    await populateTemplateSelect();
    showTemplateList();
    
  } catch (err) {
    console.error('[Main] Delete error:', err);
    showToast('Failed to delete template', 'error');
  } finally {
    closeDeleteModal();
  }
}

/**
 * Close delete confirmation modal
 */
function closeDeleteModal(): void {
  elements.deleteConfirmModal.classList.add('hidden');
  templateToDelete = null;
}

/**
 * Handle template edit button click
 */
async function handleEditTemplate(templateId: string): Promise<void> {
  console.log('[Template Manager] Edit clicked for template:', templateId);
  await showTemplateEditor(templateId);
}

/**
 * Handle template duplicate button click
 */
async function handleDuplicateTemplate(templateId: string): Promise<void> {
  try {
    await duplicateTemplate(templateId, state.authState.email!);
    showToast('Template duplicated!', 'success');
    await populateTemplateSelect();
    showTemplateList();
  } catch (err) {
    console.error('[Main] Duplicate error:', err);
    showToast('Failed to duplicate template', 'error');
  }
}

/**
 * Restore all deleted default templates
 */
async function handleRestoreAllDefaults(): Promise<void> {
  const deletedIds = await getDeletedDefaultIds();
  
  for (const id of deletedIds) {
    await restoreDefaultTemplate(id);
  }
  
  showToast(`Restored ${deletedIds.length} default templates`, 'success');
  await populateTemplateSelect();
  showTemplateList();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// -----------------------------------------------------------------------------
// Settings Handlers
// -----------------------------------------------------------------------------

async function openSettings(): Promise<void> {
  const settings = await getSettings();
  elements.n8nUrlInput.value = settings.n8nWebhookUrl;
  elements.n8nLoggingUrlInput.value = settings.n8nLoggingWebhookUrl;
  elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
  elements.fluxCapacitorToggle.checked = settings.fluxCapacitorEnabled;
  elements.recruiterRedirectToggle.checked = settings.recruiterRedirectEnabled;
  elements.autoOpenMessageToggle.checked = settings.autoOpenMessageComposer;

  // Auto-open is only relevant when Recruiter mode is enabled
  elements.autoOpenMessageToggle.disabled = !settings.recruiterRedirectEnabled;
  
  elements.settingsModal.classList.remove('hidden');
}

function closeSettingsModal(): void {
  elements.settingsModal.classList.add('hidden');
}

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

async function handleSaveSettings(): Promise<void> {
  const n8nUrl = elements.n8nUrlInput.value.trim();
  const n8nLoggingUrl = elements.n8nLoggingUrlInput.value.trim();
  const autoAdvance = elements.autoAdvanceToggle.checked;
  const fluxEnabled = elements.fluxCapacitorToggle.checked;
  const recruiterEnabled = elements.recruiterRedirectToggle.checked;
  const autoOpenEnabled = elements.autoOpenMessageToggle.checked;
  
  await setSettings({ 
    n8nWebhookUrl: n8nUrl, 
    n8nLoggingWebhookUrl: n8nLoggingUrl, 
    autoAdvanceOnSend: autoAdvance,
    fluxCapacitorEnabled: fluxEnabled,
    recruiterRedirectEnabled: recruiterEnabled,
    autoOpenMessageComposer: autoOpenEnabled
  });
  await setApiConfig({ n8nWebhookUrl: n8nUrl, n8nLoggingWebhookUrl: n8nLoggingUrl });
  
  // Update indicators visibility
  updateFluxIndicator(fluxEnabled);
  updateRecruiterIndicator(recruiterEnabled);
  
  showToast('Settings saved!', 'success');
  closeSettingsModal();
}

async function handleTestN8n(): Promise<void> {
  elements.testN8nBtn.disabled = true;
  elements.testN8nBtn.textContent = 'Testing...';
  
  await setApiConfig({ n8nWebhookUrl: elements.n8nUrlInput.value.trim(), n8nLoggingWebhookUrl: elements.n8nLoggingUrlInput.value.trim() });
  const result = await testN8nConnection();
  showToast(result.message, result.success ? 'success' : 'error');
  
  elements.testN8nBtn.disabled = false;
  elements.testN8nBtn.textContent = 'Test Connection';
}

async function handleTestN8nLogging(): Promise<void> {
  elements.testN8nLoggingBtn.disabled = true;
  elements.testN8nLoggingBtn.textContent = 'Testing...';
  
  await setApiConfig({ n8nWebhookUrl: elements.n8nUrlInput.value.trim(), n8nLoggingWebhookUrl: elements.n8nLoggingUrlInput.value.trim() });
  const result = await testN8nLoggingConnection();
  showToast(result.message, result.success ? 'success' : 'error');
  
  elements.testN8nLoggingBtn.disabled = false;
  elements.testN8nLoggingBtn.textContent = 'Test Connection';
}

// -----------------------------------------------------------------------------
// Keyboard Shortcuts
// -----------------------------------------------------------------------------

async function handleKeyboard(e: KeyboardEvent): Promise<void> {
  const isInputFocused = e.target instanceof HTMLInputElement || 
                         e.target instanceof HTMLTextAreaElement;
  
  // Handle input-focused shortcuts
  if (isInputFocused) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && e.target === elements.messageInput) {
      e.preventDefault();
      await handleCopy();
    }
    // Allow Ctrl+S in inputs when Flux is enabled
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      const settings = await getSettings();
      if (settings.fluxCapacitorEnabled) {
        e.preventDefault();
        await handleMarkSent();
        showToast('⚡ Marked as sent!', 'success');
      }
    }
    return;
  }
  
  // Handle non-input shortcuts
  switch (e.key) {
    case 'ArrowLeft':
      e.preventDefault();
      await navigateLead(-1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      await navigateLead(1);
      break;
  }
  
  // Ctrl/Cmd + S: Mark as sent (when Flux is enabled)
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    const settings = await getSettings();
    if (settings.fluxCapacitorEnabled) {
      await handleMarkSent();
      showToast('⚡ Marked as sent!', 'success');
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
