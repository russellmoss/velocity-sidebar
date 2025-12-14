// =============================================================================
// API SERVICE - n8n (Read & Write)
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
  n8nLoggingWebhookUrl: '',
};

/**
 * Initialize API configuration from storage
 */
export async function initApiConfig(): Promise<void> {
  const stored = await chrome.storage.local.get(['n8nWebhookUrl', 'n8nLoggingWebhookUrl']);
  config = {
    n8nWebhookUrl: stored.n8nWebhookUrl || '',
    n8nLoggingWebhookUrl: stored.n8nLoggingWebhookUrl || '',
  };
  console.log('[API] Config loaded:', {
    leadList: config.n8nWebhookUrl ? '✓' : '✗',
    messageLogging: config.n8nLoggingWebhookUrl ? '✓' : '✗',
  });
}

/**
 * Update API configuration
 */
export async function setApiConfig(newConfig: Partial<ApiConfig>): Promise<void> {
  config = { ...config, ...newConfig };
  await chrome.storage.local.set({
    n8nWebhookUrl: config.n8nWebhookUrl,
    n8nLoggingWebhookUrl: config.n8nLoggingWebhookUrl,
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
// LOG ACTIVITY (n8n POST Webhook)
// =============================================================================

/**
 * Log LinkedIn activity to Salesforce via n8n webhook
 * 
 * Expected n8n workflow:
 * 1. Webhook (POST) receives activity data
 * 2. Salesforce node → Update Lead
 *    - Prospecting_Step_LinkedIn__c = TRUE
 * 
 * @param payload - Activity data to log
 */
export async function logActivity(payload: LogActivityPayload): Promise<LogActivityResponse> {
  if (!config.n8nLoggingWebhookUrl) {
    return {
      success: false,
      error: 'Message sent logging URL not configured. Go to Settings.',
    };
  }

  try {
    console.log('[API] Logging activity to n8n:', payload.leadId);

    const response = await fetch(config.n8nLoggingWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[API] n8n logging error:', response.status, errorText);
      return {
        success: false,
        error: `n8n returned ${response.status}`,
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
 * Test n8n logging webhook connection
 */
export async function testN8nLoggingConnection(): Promise<{ success: boolean; message: string }> {
  if (!config.n8nLoggingWebhookUrl) {
    return { success: false, message: 'Message sent logging URL not set' };
  }

  try {
    const response = await fetch(config.n8nLoggingWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test: true,
        timestamp: new Date().toISOString(),
        action: 'connection_test',
      }),
    });

    return response.ok
      ? { success: true, message: `Message logging connection OK (${response.status})` }
      : { success: false, message: `n8n returned ${response.status}` };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection failed',
    };
  }
}
