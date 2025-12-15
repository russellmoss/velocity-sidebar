# The Flux Capacitor - Implementation Guide v1.2

## Overview

The **Flux Capacitor** is a power-user mode toggle that transforms the SGA Velocity Sidebar into a hyper-efficient LinkedIn outreach machine. When enabled, it removes friction from the workflow by:

1. **Direct Navigation** - Next/Back arrows navigate directly to the lead's LinkedIn profile
2. **Same Window** - No new tabs; navigation happens in the current browser window
3. **Auto-Copy** - Message is automatically copied to clipboard on navigation
4. **Quick Mark Sent** - `Ctrl+S` (Windows) / `Cmd+S` (Mac) hotkey to mark as sent

**Why "Flux Capacitor"?** Because once you hit 88 messages per hour, you're going to see some serious velocity.

> **Note:** When Flux Capacitor is enabled, **Auto-Advance on Send** is automatically disabled to prevent double navigation. Flux already navigates to the LinkedIn profile when you use arrow keys, so you maintain manual control over when to move to the next lead.

---

## Pre-Implementation Checklist

```bash
# Verify project structure
test -f src/types/index.ts && echo "✓ types/index.ts exists"
test -f src/lib/storage.ts && echo "✓ lib/storage.ts exists"
test -f src/sidepanel/main.ts && echo "✓ sidepanel/main.ts exists"
test -f src/sidepanel/index.html && echo "✓ sidepanel/index.html exists"
```

---

## Phase 1: Update Type Definitions

### Step 1.1: Backup Current Files

```bash
cp src/types/index.ts src/types/index.ts.backup.flux
cp src/lib/storage.ts src/lib/storage.ts.backup.flux
cp src/sidepanel/main.ts src/sidepanel/main.ts.backup.flux
cp src/sidepanel/index.html src/sidepanel/index.html.backup.flux
echo "✓ Backups created"
```

### Step 1.2: No Type Changes Needed

The existing `AppSettings` interface in `storage.ts` already extends `ApiConfig`. We'll add the new setting there.

---

## Phase 2: Update Storage Layer

### Step 2.1: Update AppSettings Interface

**File:** `src/lib/storage.ts`

**Find this interface:**
```typescript
export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
}
```

**Replace with:**
```typescript
export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
  fluxCapacitorEnabled: boolean;  // Power-user mode for high-velocity outreach
}
```

### Step 2.2: Update DEFAULT_SETTINGS

**File:** `src/lib/storage.ts`

**Find this constant (around line 313):**
```typescript
const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true
};
```

**Replace with:**
```typescript
const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true,
  fluxCapacitorEnabled: false  // Disabled by default - power users opt-in
};
```

> **Note:** The current codebase uses `n8nLoggingWebhookUrl`. If your version differs, keep your existing field name and just add `fluxCapacitorEnabled: false`.

---

## Phase 3: Update Settings UI

### Step 3.1: Add Flux Capacitor Toggle to HTML

**File:** `src/sidepanel/index.html`

**Find the auto-advance toggle section (inside the settings modal, around line 294-297):**
```html
<div class="flex items-center justify-between">
  <label class="text-sm text-gray-700">Auto-advance after marking sent</label>
  <input type="checkbox" id="auto-advance-toggle" class="w-4 h-4 text-savvy-green rounded" checked>
</div>
```

**Add this NEW section immediately AFTER it (before the closing `</div>` of the settings modal content, around line 298):**
```html
<!-- Flux Capacitor Mode -->
<div class="border-t pt-4 mt-4">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-lg">⚡</span>
      <label class="text-sm font-semibold text-gray-800">The Flux Capacitor</label>
    </div>
    <input type="checkbox" id="flux-capacitor-toggle" class="w-4 h-4 text-savvy-green rounded">
  </div>
  <p class="text-xs text-gray-500 mb-2">Power-user mode for high-velocity outreach:</p>
  <ul class="text-xs text-gray-500 space-y-1 ml-4">
    <li>• ← → arrows go directly to LinkedIn profile</li>
    <li>• Same window navigation (no new tabs)</li>
    <li>• Auto-copies message to clipboard</li>
    <li>• <kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">S</kbd> marks as sent</li>
  </ul>
</div>
```

### Step 3.2: Add Visual Indicator to Header (Optional but Recommended)

**File:** `src/sidepanel/index.html`

**Find the header section (around line 35-44), specifically the div containing the title:**
```html
<div class="flex items-center gap-2">
  <div class="w-8 h-8 bg-savvy-green rounded-full flex items-center justify-center font-bold">S</div>
  <h1 class="text-lg font-semibold">SGA Velocity</h1>
  <span class="text-xs text-gray-400 ml-1">v3.1</span>
</div>
```

**Add this indicator element immediately after the version span (around line 40):**
```html
<!-- Flux Capacitor Active Indicator -->
<span id="flux-indicator" class="hidden ml-2 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-semibold animate-pulse">
  ⚡ FLUX
</span>
```

---

## Phase 4: Update Main.ts Logic

### Step 4.1: Add DOM Element References

**File:** `src/sidepanel/main.ts`

**Find the `elements` object (starts around line 75)** and locate the settings section (around lines 112-120). Add these new references after `autoAdvanceToggle`:

```typescript
autoAdvanceToggle: document.getElementById('auto-advance-toggle') as HTMLInputElement,
fluxCapacitorToggle: document.getElementById('flux-capacitor-toggle') as HTMLInputElement,
fluxIndicator: document.getElementById('flux-indicator') as HTMLSpanElement,
testN8nBtn: document.getElementById('test-n8n-btn') as HTMLButtonElement,
```

### Step 4.2: Update openSettings Function

**File:** `src/sidepanel/main.ts`

**Find the `openSettings` function (around line 1380):**
```typescript
async function openSettings(): Promise<void> {
  const settings = await getSettings();
  elements.n8nUrlInput.value = settings.n8nWebhookUrl;
  elements.n8nLoggingUrlInput.value = settings.n8nLoggingWebhookUrl;
  elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
  elements.settingsModal.classList.remove('hidden');
}
```

**Replace with:**
```typescript
async function openSettings(): Promise<void> {
  const settings = await getSettings();
  elements.n8nUrlInput.value = settings.n8nWebhookUrl;
  elements.n8nLoggingUrlInput.value = settings.n8nLoggingWebhookUrl;
  elements.autoAdvanceToggle.checked = settings.autoAdvanceOnSend;
  elements.fluxCapacitorToggle.checked = settings.fluxCapacitorEnabled;
  elements.settingsModal.classList.remove('hidden');
}
```

### Step 4.3: Update handleSaveSettings Function

**File:** `src/sidepanel/main.ts`

**Find the `handleSaveSettings` function (around line 1392):**
```typescript
async function handleSaveSettings(): Promise<void> {
  const n8nUrl = elements.n8nUrlInput.value.trim();
  const n8nLoggingUrl = elements.n8nLoggingUrlInput.value.trim();
  const autoAdvance = elements.autoAdvanceToggle.checked;
  
  await setSettings({ n8nWebhookUrl: n8nUrl, n8nLoggingWebhookUrl: n8nLoggingUrl, autoAdvanceOnSend: autoAdvance });
  await setApiConfig({ n8nWebhookUrl: n8nUrl, n8nLoggingWebhookUrl: n8nLoggingUrl });
  
  showToast('Settings saved!', 'success');
  closeSettingsModal();
}
```

**Replace with:**
```typescript
async function handleSaveSettings(): Promise<void> {
  const n8nUrl = elements.n8nUrlInput.value.trim();
  const n8nLoggingUrl = elements.n8nLoggingUrlInput.value.trim();
  const autoAdvance = elements.autoAdvanceToggle.checked;
  const fluxEnabled = elements.fluxCapacitorToggle.checked;
  
  await setSettings({ 
    n8nWebhookUrl: n8nUrl, 
    n8nLoggingWebhookUrl: n8nLoggingUrl, 
    autoAdvanceOnSend: autoAdvance,
    fluxCapacitorEnabled: fluxEnabled
  });
  await setApiConfig({ n8nWebhookUrl: n8nUrl, n8nLoggingWebhookUrl: n8nLoggingUrl });
  
  // Update flux indicator visibility
  updateFluxIndicator(fluxEnabled);
  
  showToast('Settings saved!', 'success');
  closeSettingsModal();
}
```

### Step 4.4: Add Flux Indicator Helper Function

**File:** `src/sidepanel/main.ts`

**Add this new function after the `closeSettingsModal` function (around line 1388), before the `handleSaveSettings` function:**

```typescript
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
```

### Step 4.5: Update navigateLead Function (CRITICAL)

**File:** `src/sidepanel/main.ts`

**Find the existing `navigateLead` function (around line 894):**
```typescript
function navigateLead(direction: number): void {
  const filteredLeads = getFilteredLeads();
  const newIndex = state.currentIndex + direction;
  if (newIndex >= 0 && newIndex < filteredLeads.length) {
    state.currentIndex = newIndex;
    state.currentProfile = null;
    updateLeadUI();
  }
}
```

**Replace with this enhanced version:**

```typescript
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
```

> **IMPORTANT:** Add the `fluxAutoCopy` and `fluxNavigateToProfile` helper functions right after the updated `navigateLead` function (around line 902). These functions should be placed in the "Lead Navigation & Display" section, after `navigateLead` and before the "Profile Update Handler" section.

### Step 4.6: Update Keyboard Shortcut Handler

**File:** `src/sidepanel/main.ts`

**Find the existing `handleKeyboard` function (around line 1432):**
```typescript
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
```

**Replace with this updated version that handles async and Flux Capacitor:**

```typescript
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
```

**IMPORTANT:** Also update the button click handlers that call `navigateLead`. Find the `setupEventListeners` function (around line 233) and update these lines (around lines 237-238):

**Find:**
```typescript
elements.prevLead.addEventListener('click', () => navigateLead(-1));
elements.nextLead.addEventListener('click', () => navigateLead(1));
```

**Replace with:**
```typescript
elements.prevLead.addEventListener('click', () => navigateLead(-1).catch(console.error));
elements.nextLead.addEventListener('click', () => navigateLead(1).catch(console.error));
```

**Also update the `handleMarkSent` function (around line 1067)** where it calls `navigateLead` in a setTimeout:

**Find:**
```typescript
if (settings.autoAdvanceOnSend && state.currentIndex < filteredLeads.length - 1) {
  setTimeout(() => navigateLead(1), 500);
}
```

**Replace with:**
```typescript
// Auto-advance only if Flux Capacitor is disabled (Flux already navigates to profile)
if (settings.autoAdvanceOnSend && !settings.fluxCapacitorEnabled && state.currentIndex < filteredLeads.length - 1) {
  setTimeout(() => navigateLead(1).catch(console.error), 500);
}
```

> **IMPORTANT UX Note:** When Flux Capacitor is enabled, Auto-Advance is automatically disabled. This prevents double navigation (Flux already navigates to the LinkedIn profile when you use arrow keys). Users maintain manual control over when to move to the next lead.

### Step 4.7: Initialize Flux Indicator on Load

**File:** `src/sidepanel/main.ts`

**Find the `init()` function (around line 163)** and locate the end of the function (around line 225, before `state.isLoading = false;`). Add this code:

```typescript
// Initialize Flux Capacitor indicator
const settings = await getSettings();
updateFluxIndicator(settings.fluxCapacitorEnabled);
```

**The code should be added right before:**
```typescript
state.isLoading = false;
console.log('[Main] ✓ Initialization complete');
```

---

## Phase 5: Update Manifest Permissions (If Needed)

**File:** `public/manifest.json`

**Verify you have the `clipboardWrite` permission (around line 14).** The current manifest already includes it, but if it's missing, add it to the permissions array:

```json
{
  "permissions": [
    "identity",
    "identity.email",
    "sidePanel",
    "activeTab",
    "scripting",
    "storage",
    "clipboardWrite",
    "tabs"
  ]
}
```

> **Note:** The current manifest already has `clipboardWrite` on line 14, so no changes are needed. This step is for verification only.

---

## Phase 6: Build and Test

### Step 6.1: Build the Extension

```bash
npm run build
```

### Step 6.2: Reload in Chrome

1. Go to `chrome://extensions/`
2. Find "SGA Velocity Sidebar"
3. Click the refresh icon to reload

### Step 6.3: Test Checklist

**Settings:**
- [ ] Open settings modal
- [ ] Flux Capacitor toggle is visible
- [ ] Toggle can be enabled/disabled
- [ ] Settings save successfully
- [ ] Flux indicator (⚡ FLUX) appears when enabled

**Navigation (Flux OFF - Normal Mode):**
- [ ] Next/Back arrows navigate leads normally
- [ ] LinkedIn icon opens profile in new tab
- [ ] No auto-copy on navigation

**Navigation (Flux ON):**
- [ ] Next arrow navigates lead AND opens LinkedIn profile
- [ ] Profile opens in SAME window (no new tab)
- [ ] Message is auto-copied to clipboard
- [ ] Toast shows "⚡ Message copied!"

**Keyboard Shortcut:**
- [ ] `Ctrl+S` (Win) / `Cmd+S` (Mac) marks current lead as sent
- [ ] Works when Flux is enabled
- [ ] Browser save dialog is prevented

**Edge Cases:**
- [ ] First lead: Back arrow does nothing
- [ ] Last lead: Next arrow does nothing
- [ ] Lead without LinkedIn URL: Navigation works, no profile opened
- [ ] Empty message: No copy toast shown
- [ ] Flux ON + Auto-Advance ON: Auto-advance is disabled (no double navigation)
- [ ] Flux ON + Auto-Advance OFF: Manual control works as expected

---

## Complete Code Summary

Here's a consolidated view of all the changes:

### storage.ts Changes
```typescript
// Interface update
export interface AppSettings extends ApiConfig {
  autoAdvanceOnSend: boolean;
  fluxCapacitorEnabled: boolean;
}

// Default settings update
const DEFAULT_SETTINGS: AppSettings = {
  n8nWebhookUrl: '',
  n8nLoggingWebhookUrl: '',
  autoAdvanceOnSend: true,
  fluxCapacitorEnabled: false
};
```

### index.html Changes
```html
<!-- Add after auto-advance toggle in settings modal -->
<div class="border-t pt-4 mt-4">
  <div class="flex items-center justify-between mb-2">
    <div class="flex items-center gap-2">
      <span class="text-lg">⚡</span>
      <label class="text-sm font-semibold text-gray-800">The Flux Capacitor</label>
    </div>
    <input type="checkbox" id="flux-capacitor-toggle" class="w-4 h-4 text-savvy-green rounded">
  </div>
  <p class="text-xs text-gray-500 mb-2">Power-user mode for high-velocity outreach:</p>
  <ul class="text-xs text-gray-500 space-y-1 ml-4">
    <li>• ← → arrows go directly to LinkedIn profile</li>
    <li>• Same window navigation (no new tabs)</li>
    <li>• Auto-copies message to clipboard</li>
    <li>• <kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">Ctrl</kbd>+<kbd class="px-1 py-0.5 bg-gray-100 rounded text-xs">S</kbd> marks as sent</li>
  </ul>
</div>

<!-- Add indicator in header area -->
<span id="flux-indicator" class="hidden ml-2 text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full font-semibold animate-pulse">
  ⚡ FLUX
</span>
```

### main.ts New Functions
```typescript
// Flux Capacitor helper functions
function updateFluxIndicator(enabled: boolean): void { /* ... */ }
async function fluxAutoCopy(): Promise<void> { /* ... */ }
async function fluxNavigateToProfile(url: string): Promise<void> { /* ... */ }

// Updated navigateLead with Flux integration (now async)
async function navigateLead(direction: number): Promise<void> { /* ... */ }

// Updated keyboard handler (now async, handles Flux mode)
async function handleKeyboard(e: KeyboardEvent): Promise<void> { /* ... */ }
```

**Key Changes:**
- `navigateLead` is now `async` and handles Flux Capacitor logic
- `handleKeyboard` is now `async` and checks Flux Capacitor setting
- Button click handlers updated to handle async `navigateLead` (with `.catch(console.error)`)
- `handleMarkSent` setTimeout updated to handle async `navigateLead` AND disables auto-advance when Flux is enabled
- Auto-Advance is automatically disabled when Flux Capacitor is enabled (prevents double navigation)

---

## Rollback Instructions

If something goes wrong:

```bash
# Restore all backups
cp src/types/index.ts.backup.flux src/types/index.ts
cp src/lib/storage.ts.backup.flux src/lib/storage.ts
cp src/sidepanel/main.ts.backup.flux src/sidepanel/main.ts
cp src/sidepanel/index.html.backup.flux src/sidepanel/index.html

# Rebuild
npm run build

echo "✓ Rollback complete"
```

---

## Future Enhancements

Consider these additions for v2:

1. **Configurable Hotkeys** - Let users set their own key combos
2. **Auto-Mark Sent Timer** - Auto-mark after X seconds on profile page
3. **Sound Effects** - Satisfying "whoosh" on navigation (optional)
4. **Stats Counter** - Show "Messages sent this session: X"
5. **Speed Run Mode** - Timed challenges for gamification

---

## Implementation Notes for AI Agents

### Critical Points:
1. **Async Function Updates**: `navigateLead` must be changed from `void` to `Promise<void>` and all callers must be updated
2. **Button Handlers**: The prev/next button click handlers in `setupEventListeners` must handle async (use `.catch(console.error)`)
3. **handleMarkSent**: The setTimeout call to `navigateLead` must handle async AND check Flux Capacitor to prevent double navigation
4. **handleKeyboard**: Must be updated to async and check Flux Capacitor setting before enabling Ctrl+S
5. **LinkedIn URL**: Use `lead.linkedInUrl || lead.LinkedIn_Profile_Apollo__c` to get the URL
6. **Function Placement**: Add `fluxAutoCopy` and `fluxNavigateToProfile` immediately after `navigateLead` function
7. **UX Conflict Prevention**: Auto-Advance is disabled when Flux Capacitor is enabled to prevent double navigation

### Verification Checklist:
- [ ] All async functions properly await their calls
- [ ] All callers of `navigateLead` handle the Promise (use `.catch(console.error)` or `await`)
- [ ] `handleKeyboard` is now async and properly checks Flux Capacitor setting
- [ ] Settings modal includes the Flux Capacitor toggle
- [ ] Header includes the flux indicator element
- [ ] `elements` object includes `fluxCapacitorToggle` and `fluxIndicator`
- [ ] `updateFluxIndicator` function is called on init and when settings are saved
- [ ] `handleMarkSent` disables auto-advance when Flux Capacitor is enabled (prevents double navigation)

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.2 | Dec 2024 | Added UX safeguard: Auto-Advance disabled when Flux is enabled (prevents double navigation) |
| 1.1 | Dec 2024 | Fixed async handling, added specific line numbers, corrected function signatures |
| 1.0 | Dec 2024 | Initial Flux Capacitor implementation |

---

*"Roads? Where we're going, we don't need roads." - But we do need LinkedIn profiles.*
