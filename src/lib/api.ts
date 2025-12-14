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
