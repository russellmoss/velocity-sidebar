# Custom User Templates Implementation Guide v1.0

## Overview

This document provides step-by-step instructions for implementing user-specific message templates in the SGA Velocity Sidebar Chrome Extension. Each user logged into Chrome with their `@savvywealth.com` email will have their own template library that syncs across devices.

**Key Features:**
- User-specific templates stored via `chrome.storage.sync` (tied to Chrome profile)
- Default system templates that users can customize or delete
- Full CRUD operations: Create, Read, Update, Delete
- Template variables for dynamic message generation
- Template manager modal UI

---

## Pre-Implementation Checklist

Before starting, verify the existing codebase structure:

```bash
# Verify project structure exists
test -d src/types && echo "✓ types directory exists"
test -d src/lib && echo "✓ lib directory exists"
test -d src/sidepanel && echo "✓ sidepanel directory exists"
test -f src/types/index.ts && echo "✓ types/index.ts exists"
test -f src/lib/storage.ts && echo "✓ lib/storage.ts exists"
test -f src/sidepanel/main.ts && echo "✓ sidepanel/main.ts exists"
test -f src/sidepanel/index.html && echo "✓ sidepanel/index.html exists"
```

**Expected Output:** All checks should pass (✓).

---

## Phase 1: Update Type Definitions

### Step 1.1: Backup Current Types

```bash
cp src/types/index.ts src/types/index.ts.backup
echo "✓ Backup created"
```

### Step 1.2: Update MessageTemplate Interface

**File:** `src/types/index.ts`

**Find this existing interface:**
```typescript
export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: 'intro' | 'followup' | 'reconnect';
  isDefault?: boolean;
}
```

**Replace with:**
```typescript
// -----------------------------------------------------------------------------
// Message Template Types (Updated for User-Specific Templates)
// -----------------------------------------------------------------------------
export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  category: 'intro' | 'followup' | 'reconnect' | 'custom';
  isDefault?: boolean;        // True for system defaults (read-only source)
  isUserCreated?: boolean;    // True for user-created templates
  createdBy?: string;         // User's email who created it
  createdAt?: number;         // Timestamp (ms since epoch)
  updatedAt?: number;         // Timestamp (ms since epoch)
}

// Template creation payload (without auto-generated fields)
export type CreateTemplatePayload = Pick<MessageTemplate, 'name' | 'content' | 'category'>;

// Template update payload (partial updates allowed)
export type UpdateTemplatePayload = Partial<Pick<MessageTemplate, 'name' | 'content' | 'category'>>;
```

### Step 1.3: Add Storage Keys for Template Management

**File:** `src/types/index.ts`

**Find the existing STORAGE_KEYS:**
```typescript
export const STORAGE_KEYS = {
  LEADS_CACHE: 'leads_cache',
  TEMPLATES: 'templates',
  SETTINGS: 'settings',
  LAST_SYNC: 'last_sync',
  USER_EMAIL: 'user_email',
} as const;
```

**Replace with:**
```typescript
export const STORAGE_KEYS = {
  LEADS_CACHE: 'leads_cache',
  TEMPLATES: 'user_templates',           // User's custom templates (sync storage)
  DELETED_DEFAULTS: 'deleted_defaults',  // IDs of default templates user has deleted
  SETTINGS: 'settings',
  LAST_SYNC: 'last_sync',
  USER_EMAIL: 'user_email',
} as const;
```

### Step 1.4: Verify Type Changes

```bash
npx tsc --noEmit src/types/index.ts
if [ $? -eq 0 ]; then
  echo "✓ Types compile successfully"
else
  echo "✗ Type errors found - fix before proceeding"
  exit 1
fi
```

---

## Phase 2: Update Storage Service

### Step 2.1: Backup Current Storage

```bash
cp src/lib/storage.ts src/lib/storage.ts.backup
echo "✓ Storage backup created"
```

### Step 2.2: Add Sync Storage Helper Functions

**File:** `src/lib/storage.ts`

**Add these new helper functions after the existing generic helpers:**

```typescript
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
```

### Step 2.3: Replace Template Functions

**File:** `src/lib/storage.ts`

**Find and REMOVE these existing template functions:**
```typescript
export async function getTemplates(): Promise<MessageTemplate[]> {
  const templates = await get<MessageTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  return templates.length > 0 ? templates : DEFAULT_TEMPLATES;
}

export async function setTemplates(templates: MessageTemplate[]): Promise<void> {
  await set(STORAGE_KEYS.TEMPLATES, templates);
}
```

**Replace with the complete new template management system:**

```typescript
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
```

### Step 2.4: Add Import for New Types

**File:** `src/lib/storage.ts`

**Update the imports at the top of the file:**

Find:
```typescript
import { 
  STORAGE_KEYS, 
  EnrichedLead, 
  MessageTemplate, 
  ApiConfig,
  DEFAULT_TEMPLATES
} from '../types';
```

Replace with:
```typescript
import { 
  STORAGE_KEYS, 
  EnrichedLead, 
  MessageTemplate, 
  ApiConfig,
  DEFAULT_TEMPLATES,
  CreateTemplatePayload,
  UpdateTemplatePayload
} from '../types';
```

### Step 2.5: Verify Storage Changes

```bash
npx tsc --noEmit src/lib/storage.ts
if [ $? -eq 0 ]; then
  echo "✓ Storage module compiles successfully"
else
  echo "✗ Storage compilation errors - fix before proceeding"
  exit 1
fi
```

---

## Phase 3: Update HTML Template

### Step 3.1: Backup Current HTML

```bash
cp src/sidepanel/index.html src/sidepanel/index.html.backup
echo "✓ HTML backup created"
```

### Step 3.2: Add Manage Templates Button

**File:** `src/sidepanel/index.html`

**Find the template selector section (look for `template-select`):**
```html
<div class="mb-3">
  <label for="template-select" class="block text-sm font-medium text-gray-700 mb-1">Template</label>
  <select id="template-select" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green">
    <option value="">Select a template...</option>
  </select>
</div>
```

**Replace with:**
```html
<div class="mb-3">
  <label for="template-select" class="block text-sm font-medium text-gray-700 mb-1">Template</label>
  <div class="flex items-center gap-2">
    <select id="template-select" class="flex-1 border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green">
      <option value="">Select a template...</option>
    </select>
    <button id="manage-templates-btn" class="p-2 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors" title="Manage Templates">
      <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
      </svg>
    </button>
  </div>
</div>
```

### Step 3.3: Add Template Manager Modal

**File:** `src/sidepanel/index.html`

**Add this modal HTML BEFORE the closing `</body>` tag (and after the settings modal if one exists):**

```html
<!-- Template Manager Modal -->
<div id="template-modal" class="hidden fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
    
    <!-- Modal Header -->
    <div class="flex justify-between items-center px-4 py-3 border-b bg-gray-50 flex-shrink-0">
      <h3 id="template-modal-title" class="font-semibold text-gray-800">Manage Templates</h3>
      <button id="close-template-modal" class="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
        <svg class="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
        </svg>
      </button>
    </div>
    
    <!-- Template List View -->
    <div id="template-list-view" class="flex-1 overflow-y-auto">
      <!-- Header with New Template button -->
      <div class="flex justify-between items-center p-4 border-b bg-gray-50/50">
        <span class="text-sm text-gray-500">Your message templates</span>
        <button id="new-template-btn" class="bg-savvy-green text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-savvy-green-dark transition-colors flex items-center gap-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          New Template
        </button>
      </div>
      
      <!-- Template List Container -->
      <div id="template-list" class="p-4 space-y-2">
        <!-- Templates populated via JavaScript -->
        <div class="text-center py-8 text-gray-400">
          <svg class="w-12 h-12 mx-auto mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>Loading templates...</p>
        </div>
      </div>
      
      <!-- Restore Defaults Section -->
      <div id="restore-defaults-section" class="hidden p-4 border-t bg-amber-50">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium text-amber-800">Deleted default templates</p>
            <p id="deleted-count" class="text-xs text-amber-600">0 templates hidden</p>
          </div>
          <button id="restore-all-defaults-btn" class="text-sm text-amber-700 hover:text-amber-900 underline">
            Restore All
          </button>
        </div>
      </div>
    </div>
    
    <!-- Template Editor View (hidden by default) -->
    <div id="template-editor-view" class="hidden flex-1 overflow-y-auto p-4">
      <form id="template-form" class="space-y-4">
        <input type="hidden" id="edit-template-id" value="" />
        
        <!-- Template Name -->
        <div>
          <label for="edit-template-name" class="block text-sm font-medium text-gray-700 mb-1">
            Template Name <span class="text-red-500">*</span>
          </label>
          <input 
            type="text" 
            id="edit-template-name" 
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green"
            placeholder="e.g., Warm Introduction"
            required 
            maxlength="50"
          />
        </div>
        
        <!-- Category -->
        <div>
          <label for="edit-template-category" class="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select id="edit-template-category" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green">
            <option value="intro">Introduction</option>
            <option value="followup">Follow-up</option>
            <option value="reconnect">Reconnect</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        
        <!-- Message Content -->
        <div>
          <label for="edit-template-content" class="block text-sm font-medium text-gray-700 mb-1">
            Message Content <span class="text-red-500">*</span>
          </label>
          <textarea 
            id="edit-template-content" 
            rows="8"
            class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-savvy-green focus:border-savvy-green resize-none"
            placeholder="Hi {{firstName}}, I noticed your work at {{company}}..."
            required
            maxlength="2000"
          ></textarea>
          <div class="flex justify-between items-start mt-1.5">
            <p class="text-xs text-gray-400 leading-relaxed">
              <strong>Variables:</strong> {{firstName}}, {{lastName}}, {{fullName}}, {{company}}, {{title}}, {{location}}, {{headline}}, {{accreditations}}, {{leadScore}}
            </p>
            <span id="content-char-count" class="text-xs text-gray-400 whitespace-nowrap ml-2">0/2000</span>
          </div>
        </div>
        
        <!-- Action Buttons -->
        <div class="flex gap-2 pt-2">
          <button 
            type="button" 
            id="cancel-template-btn" 
            class="flex-1 border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button 
            type="submit" 
            id="save-template-btn"
            class="flex-1 bg-savvy-green text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-savvy-green-dark transition-colors"
          >
            Save Template
          </button>
        </div>
      </form>
    </div>
    
  </div>
</div>

<!-- Delete Confirmation Modal -->
<div id="delete-confirm-modal" class="hidden fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
  <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
    <div class="text-center">
      <div class="w-12 h-12 rounded-full bg-red-100 mx-auto mb-4 flex items-center justify-center">
        <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
        </svg>
      </div>
      <h4 class="text-lg font-semibold text-gray-800 mb-2">Delete Template?</h4>
      <p id="delete-template-name" class="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
      <div class="flex gap-3">
        <button id="cancel-delete-btn" class="flex-1 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
          Cancel
        </button>
        <button id="confirm-delete-btn" class="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700">
          Delete
        </button>
      </div>
    </div>
  </div>
</div>
```

### Step 3.4: Verify HTML Syntax

```bash
# Check for basic HTML structure issues
grep -c "template-modal" src/sidepanel/index.html
# Expected output: Multiple occurrences (at least 2)

grep -c "template-editor-view" src/sidepanel/index.html
# Expected output: At least 2

grep -c "template-list-view" src/sidepanel/index.html
# Expected output: At least 2

echo "✓ HTML elements added successfully"
```

---

## Phase 4: Update Main Application Script

### Step 4.1: Backup Current Main Script

```bash
cp src/sidepanel/main.ts src/sidepanel/main.ts.backup
echo "✓ Main script backup created"
```

### Step 4.2: Update Imports

**File:** `src/sidepanel/main.ts`

**Find the storage imports:**
```typescript
import { getCachedLeads, setCachedLeads, markLeadAsSent, getTemplates, getSettings, setSettings, getLastSyncTime } from '../lib/storage';
```

**Replace with:**
```typescript
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
```

### Step 4.3: Add Template Modal DOM Elements

**File:** `src/sidepanel/main.ts`

**Find the existing `elements` object and ADD these new properties:**

```typescript
// Add to the elements object (inside the existing object definition)
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
```

### Step 4.4: Update Template Loading Function

**File:** `src/sidepanel/main.ts`

**Find the `populateTemplateSelect` function and REPLACE it:**

```typescript
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
```

### Step 4.5: Add Template Manager Functions

**File:** `src/sidepanel/main.ts`

**Add this entire new section BEFORE the `// Initialize` or `init()` call at the bottom:**

```typescript
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
            onclick="handleEditTemplate('${t.id}')" 
            class="p-1.5 hover:bg-gray-200 rounded transition-colors" 
            title="Edit"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </button>
          <button 
            onclick="handleDuplicateTemplate('${t.id}')" 
            class="p-1.5 hover:bg-gray-200 rounded transition-colors" 
            title="Duplicate"
          >
            <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
          </button>
          <button 
            onclick="handleDeleteTemplate('${t.id}', '${escapeHtml(t.name)}')" 
            class="p-1.5 hover:bg-red-100 rounded transition-colors" 
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
  elements.templateListView.classList.add('hidden');
  elements.templateEditorView.classList.remove('hidden');
  
  // Reset form
  elements.templateForm.reset();
  elements.editTemplateId.value = '';
  updateContentCharCount();
  
  if (templateId) {
    // Edit existing template
    const template = await getTemplateById(templateId);
    if (template) {
      elements.templateModalTitle.textContent = 'Edit Template';
      elements.editTemplateId.value = template.id;
      elements.editTemplateName.value = template.name;
      elements.editTemplateCategory.value = template.category;
      elements.editTemplateContent.value = template.content;
      updateContentCharCount();
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

// Make functions globally accessible for onclick handlers
(window as any).handleEditTemplate = handleEditTemplate;
(window as any).handleDeleteTemplate = handleDeleteTemplate;
(window as any).handleDuplicateTemplate = handleDuplicateTemplate;
```

### Step 4.6: Add Event Listeners

**File:** `src/sidepanel/main.ts`

**Find the section where event listeners are set up (usually in an `init` or `setupEventListeners` function) and ADD these:**

```typescript
// Template Manager Event Listeners
elements.manageTemplatesBtn?.addEventListener('click', openTemplateModal);
elements.closeTemplateModalBtn?.addEventListener('click', closeTemplateModal);
elements.newTemplateBtn?.addEventListener('click', () => showTemplateEditor());
elements.cancelTemplateBtn?.addEventListener('click', showTemplateList);
elements.templateForm?.addEventListener('submit', handleTemplateSubmit);
elements.editTemplateContent?.addEventListener('input', updateContentCharCount);
elements.restoreAllDefaultsBtn?.addEventListener('click', handleRestoreAllDefaults);

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
```

### Step 4.7: Update Template Loading in Init

**File:** `src/sidepanel/main.ts`

**Find where templates are loaded during initialization (look for `getTemplates()` call) and replace with:**

```typescript
// Load templates (now uses user-specific storage)
state.templates = await getUserTemplates();
populateTemplateSelect();
```

### Step 4.8: Verify Main Script Compilation

```bash
npx tsc --noEmit src/sidepanel/main.ts
if [ $? -eq 0 ]; then
  echo "✓ Main script compiles successfully"
else
  echo "✗ Main script compilation errors - review and fix"
  exit 1
fi
```

---

## Phase 5: Full Project Verification

### Step 5.1: Run Full TypeScript Check

```bash
npx tsc --noEmit
if [ $? -eq 0 ]; then
  echo "✓ Full project type check passed"
else
  echo "✗ Type errors found - fix all errors before proceeding"
  exit 1
fi
```

### Step 5.2: Build the Extension

```bash
npm run build
if [ $? -eq 0 ]; then
  echo "✓ Build completed successfully"
else
  echo "✗ Build failed - review errors"
  exit 1
fi
```

### Step 5.3: Verify Build Output

```bash
# Check required files exist
test -f dist/manifest.json && echo "✓ manifest.json present"
test -f dist/service-worker.js && echo "✓ service-worker.js present"
test -f dist/linkedin-scraper.js && echo "✓ linkedin-scraper.js present"
test -d dist/assets && echo "✓ assets directory present"

# Verify new template functionality is in the build
grep -q "getUserTemplates" dist/assets/*.js && echo "✓ getUserTemplates function included"
grep -q "createTemplate" dist/assets/*.js && echo "✓ createTemplate function included"
grep -q "template-modal" dist/sidepanel/*.html 2>/dev/null || grep -q "template-modal" dist/*.html 2>/dev/null && echo "✓ Template modal HTML included"

echo ""
echo "=== BUILD VERIFICATION COMPLETE ==="
```

### Step 5.4: Verify No Regressions

```bash
# Ensure no CSV code snuck back in
! grep -qi "csv" dist/*.js && echo "✓ No CSV code in build (correct)"

# Ensure authentication code is present
grep -q "getProfileUserInfo" dist/*.js && echo "✓ Auth code present"

# Ensure sync button functionality remains
grep -q "Sync from Salesforce\|sync.*salesforce\|fetchLeads" dist/assets/*.js && echo "✓ Sync functionality present"
```

---

## Phase 6: Testing Checklist

### Manual Testing Steps

After loading the extension in Chrome (`chrome://extensions` → Load unpacked → select `dist/` folder):

#### 6.1 Template Manager Modal
- [ ] Click gear icon next to template dropdown
- [ ] Modal opens with "Manage Templates" title
- [ ] Default templates are listed with "Default" badge
- [ ] Close button (X) closes modal
- [ ] Clicking backdrop closes modal
- [ ] Escape key closes modal

#### 6.2 Create New Template
- [ ] Click "New Template" button
- [ ] Editor view appears with empty form
- [ ] "New Template" shown in modal title
- [ ] Fill in name, select category, add content
- [ ] Character count updates as you type
- [ ] Save button creates template
- [ ] Success toast appears
- [ ] New template appears in list with "Custom" badge
- [ ] New template appears in dropdown (with ★ indicator)

#### 6.3 Edit Template
- [ ] Hover over template shows edit/duplicate/delete buttons
- [ ] Click edit opens editor with pre-filled data
- [ ] "Edit Template" shown in modal title
- [ ] Make changes and save
- [ ] Changes persist after closing modal
- [ ] Editing a default template creates a user copy

#### 6.4 Delete Template
- [ ] Click delete shows confirmation modal
- [ ] Cancel closes without deleting
- [ ] Confirm deletes and shows toast
- [ ] Deleted template removed from list and dropdown
- [ ] Deleting a default template shows "Restore" section

#### 6.5 Restore Defaults
- [ ] "Deleted default templates" section appears when defaults deleted
- [ ] Shows count of hidden templates
- [ ] "Restore All" brings back default templates
- [ ] Restored templates appear in list

#### 6.6 Persistence
- [ ] Close and reopen extension - custom templates persist
- [ ] Sign into different Chrome profile - templates are separate
- [ ] Templates sync across devices (if using same Chrome profile)

#### 6.7 Template Variables
- [ ] Create template with {{firstName}}, {{company}} etc.
- [ ] Select template when viewing a lead
- [ ] Variables are replaced with actual values
- [ ] Missing variables show warning

---

## Rollback Instructions

If something goes wrong, restore from backups:

```bash
# Restore all backups
cp src/types/index.ts.backup src/types/index.ts
cp src/lib/storage.ts.backup src/lib/storage.ts
cp src/sidepanel/main.ts.backup src/sidepanel/main.ts
cp src/sidepanel/index.html.backup src/sidepanel/index.html

# Rebuild
npm run build

echo "✓ Rollback complete"
```

---

## Summary of Changes

| File | Changes Made |
|------|--------------|
| `src/types/index.ts` | Added `CreateTemplatePayload`, `UpdateTemplatePayload` types; Updated `MessageTemplate` interface with user fields; Updated `STORAGE_KEYS` |
| `src/lib/storage.ts` | Added sync storage helpers; Replaced template functions with full CRUD; Added `getUserTemplates`, `createTemplate`, `updateTemplate`, `deleteTemplate`, `restoreDefaultTemplate`, `duplicateTemplate`, etc. |
| `src/sidepanel/index.html` | Added manage templates button; Added template manager modal; Added delete confirmation modal |
| `src/sidepanel/main.ts` | Updated imports; Added template modal DOM elements; Replaced `populateTemplateSelect`; Added all template manager functions and event listeners |

---

## Architecture Notes

### Storage Strategy

- **`chrome.storage.sync`**: Used for user templates (syncs across devices, tied to Chrome profile)
- **`chrome.storage.local`**: Used for leads cache, settings (local only, larger quota)

### Template Hierarchy

1. **System Defaults**: Defined in `DEFAULT_TEMPLATES` constant
2. **User Copies of Defaults**: Created when user edits a default (ID: `user-copy-{originalId}`)
3. **User Created**: Fully custom templates (ID: `user-{timestamp}-{random}`)

### Quota Limits

- `chrome.storage.sync`: ~100KB total, ~8KB per item
- Each template is ~500 bytes average
- Safe for ~150+ templates per user

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2024-XX-XX | Initial implementation of user-specific templates |
