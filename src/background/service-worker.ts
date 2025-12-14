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
