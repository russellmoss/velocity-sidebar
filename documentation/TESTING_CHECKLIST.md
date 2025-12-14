# SGA Velocity Sidebar v3.1 - Testing Checklist

## Pre-flight
- [ ] User signed into Chrome with @savvywealth.com account
- [ ] n8n webhook URL configured in Settings
- [ ] Zapier webhook URL configured in Settings

## Authentication (getProfileUserInfo)
- [ ] Extension automatically detects Chrome profile email
- [ ] Shows error if not @savvywealth.com domain
- [ ] "Check Again" button re-checks profile
- [ ] Email displayed in header

## Sync (n8n)
- [ ] "Sync from Salesforce" button triggers fetch
- [ ] Spinner shows during sync
- [ ] Leads populate after sync
- [ ] "Synced" indicator shows
- [ ] Auto-sync on startup (if webhook configured)

## Lead Display
- [ ] Lead score badge shows (if Savvy_Lead_Score__c present)
- [ ] Accreditations display
- [ ] "Already Sent" badge for sent leads
- [ ] LinkedIn link opens profile
- [ ] Lead navigation (prev/next) works

## LinkedIn Scraper
- [ ] Navigate to LinkedIn profile
- [ ] Profile auto-scraped
- [ ] Enriches lead card
- [ ] "Profile enriched" indicator shows
- [ ] Accreditations extracted correctly

## Message Composer
- [ ] Template selector populates with default templates
- [ ] Template variables replaced correctly
- [ ] Missing variables warning shows
- [ ] Character count updates
- [ ] Message can be edited manually

## Actions
- [ ] "Copy Message" copies to clipboard
- [ ] "✓ Sent" logs to Zapier
- [ ] Salesforce Lead updates (Prospecting_Step_LinkedIn__c = TRUE)
- [ ] Auto-advance after marking sent (if enabled)
- [ ] Toast notifications appear

## Settings
- [ ] n8n URL saves
- [ ] Zapier URL saves
- [ ] Test connections work
- [ ] Auto-advance toggle works

## Keyboard Shortcuts
- [ ] Arrow Left/Right navigates leads
- [ ] Cmd/Ctrl+S marks as sent
- [ ] Cmd/Ctrl+Enter copies message

## Verification: NO CSV
- [ ] No file input in UI
- [ ] No "Import CSV" button
- [ ] No CSV parser code in build output

## Build Verification
- [x] Build completes without errors
- [x] All required files present in `dist/`
- [x] NO CSV-related code in output (only comments)
- [x] Extension structure correct

