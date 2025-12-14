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
      chrome.identity.getProfileUserInfo({ accountStatus: chrome.identity.AccountStatus.ANY }, (info) => {
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
