// =============================================================================
// TEMPLATE SERVICE - Message Generation & Variable Replacement
// =============================================================================

import type { EnrichedLead, LinkedInProfile } from '../types';

/**
 * Generate a message from a template by replacing variables
 * 
 * Variables: {{firstName}}, {{lastName}}, {{fullName}}, {{company}}, 
 * {{title}}, {{location}}, {{headline}}, {{accreditations}}, {{leadScore}}
 */
export function generateMessage(
  template: string,
  lead: EnrichedLead,
  profile: LinkedInProfile | null
): string {
  const vars: Record<string, string> = {
    firstName: lead.FirstName || '',
    lastName: lead.LastName || '',
    fullName: lead.fullName || `${lead.FirstName} ${lead.LastName}`.trim(),
    company: lead.scrapedCompany || lead.Company || '',
    title: lead.scrapedTitle || lead.Title || '',
    location: lead.location || profile?.location || '',
    headline: lead.headline || profile?.headline || '',
    accreditations: lead.accreditations?.join(', ') || profile?.accreditations?.join(', ') || '',
    leadScore: lead.Savvy_Lead_Score__c?.toString() || '',
  };

  let message = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    message = message.replace(regex, value || '');
  }

  // Clean up any remaining variables
  message = message.replace(/\{\{[^}]+\}\}/g, '');

  return message.trim();
}

/**
 * Get list of missing variables in a template
 */
export function getMissingVariables(
  template: string,
  lead: EnrichedLead,
  profile: LinkedInProfile | null
): string[] {
  const missing: string[] = [];
  const variableNames = ['firstName', 'lastName', 'fullName', 'company', 'title', 'location', 'headline', 'accreditations', 'leadScore'];

  for (const varName of variableNames) {
    if (template.includes(`{{${varName}}}`)) {
      const hasValue = 
        (varName === 'firstName' && lead.FirstName) ||
        (varName === 'lastName' && lead.LastName) ||
        (varName === 'fullName' && lead.fullName) ||
        (varName === 'company' && (lead.scrapedCompany || lead.Company)) ||
        (varName === 'title' && (lead.scrapedTitle || lead.Title)) ||
        (varName === 'location' && (lead.location || profile?.location)) ||
        (varName === 'headline' && (lead.headline || profile?.headline)) ||
        (varName === 'accreditations' && (lead.accreditations?.length || profile?.accreditations?.length)) ||
        (varName === 'leadScore' && lead.Savvy_Lead_Score__c !== null);

      if (!hasValue) {
        missing.push(varName);
      }
    }
  }

  return missing;
}
