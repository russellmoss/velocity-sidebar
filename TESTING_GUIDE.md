# SGA Velocity Sidebar v3.1 - Testing Guide

## Step 1: Load Extension in Chrome

1. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions` in your browser
   - Or: Chrome menu → Extensions → Manage Extensions

2. **Enable Developer Mode**
   - Toggle "Developer mode" switch in the top-right corner

3. **Load the Extension**
   - Click "Load unpacked" button
   - Navigate to your project folder: `C:\Users\russe\velocity_sidebar\dist`
   - Select the `dist` folder and click "Select Folder"

4. **Verify Extension Loaded**
   - You should see "SGA Velocity Sidebar" in your extensions list
   - The green "S" icon should appear in your Chrome toolbar
   - No errors should appear in the extension card

## Step 2: Initial Setup

1. **Sign into Chrome**
   - Make sure you're signed into Chrome with a @savvywealth.com account
   - Check: `chrome://settings/people` → Your profile email

2. **Open the Extension**
   - Click the extension icon in the Chrome toolbar
   - OR right-click the icon → "Open side panel"
   - The side panel should open on the right side of your browser

3. **Check Authentication**
   - If signed in with @savvywealth.com: You should see the main interface
   - If not signed in or wrong domain: You'll see an auth screen with "Check Again" button

## Step 3: Configure Webhooks (Required for Full Testing)

1. **Open Settings**
   - Click the gear icon (⚙️) in the bottom-right of the side panel

2. **Add n8n Webhook URL**
   - Enter your n8n webhook URL in the "n8n Webhook URL" field
   - Format: `https://your-n8n-instance.com/webhook/sga-leads`
   - Click "Test Connection" to verify it works

3. **Add Zapier Webhook URL**
   - Enter your Zapier webhook URL in the "Zapier Webhook URL" field
   - Format: `https://hooks.zapier.com/hooks/catch/...`
   - Click "Test Connection" to verify it works

4. **Save Settings**
   - Click "Save Settings" button
   - You should see a success toast notification

## Step 4: Test Core Functionality

### Test Authentication
- [ ] Extension detects your Chrome profile email automatically
- [ ] Email appears in the header if @savvywealth.com
- [ ] Auth screen shows if wrong domain
- [ ] "Check Again" button works

### Test Lead Sync
1. **Manual Sync**
   - Click "Sync from Salesforce" button
   - Watch for spinner animation
   - Leads should populate after sync completes
   - "Synced" indicator should appear

2. **Auto-Sync on Startup**
   - Close and reopen the side panel
   - If webhook is configured, it should auto-sync
   - Cached leads should appear immediately, then update

### Test Lead Display
- [ ] Lead count shows correct number
- [ ] Lead navigation (prev/next arrows) works
- [ ] Lead name, title, company display correctly
- [ ] Lead score badge shows (if present)
- [ ] Accreditations display (if present)
- [ ] "Already Sent" badge shows for sent leads
- [ ] LinkedIn link opens profile in new tab

### Test LinkedIn Scraper
1. **Navigate to LinkedIn**
   - Go to any LinkedIn profile: `https://www.linkedin.com/in/...`
   - Wait a few seconds for page to load

2. **Check Scraping**
   - Open browser console (F12) → Console tab
   - Look for `[LinkedIn Scraper]` log messages
   - Should see: "Scraping profile..." and "Scraped profile: [Name]"

3. **Check Profile Enrichment**
   - Go back to the extension side panel
   - If the profile matches a lead, you should see:
     - "Profile enriched from LinkedIn" indicator
     - Updated title, company, location
     - Accreditations from LinkedIn

### Test Message Composer
1. **Select Template**
   - Choose a template from the dropdown
   - Message should auto-populate with variables replaced
   - Check for missing variables warning (if any)

2. **Edit Message**
   - Type or edit the message manually
   - Character count should update
   - Warning appears if over 300 characters

3. **Copy Message**
   - Click "📋 Copy Message" button
   - Paste somewhere (Ctrl+V) to verify it copied
   - Should see "Message copied!" toast

4. **Mark as Sent**
   - Click "✓ Sent" button
   - Should see "Marked as sent!" toast
   - Lead should show "Already Sent" badge
   - Button should change to "✓ Already Sent"
   - If auto-advance enabled, should move to next lead

### Test Keyboard Shortcuts
- [ ] Arrow Left/Right keys navigate between leads
- [ ] Cmd/Ctrl+S marks current lead as sent
- [ ] Cmd/Ctrl+Enter copies message (when in message input)

## Step 5: Debugging

### Check Console Logs

1. **Service Worker Logs**
   - Go to `chrome://extensions`
   - Find "SGA Velocity Sidebar"
   - Click "service worker" link (or "Inspect views: service worker")
   - Check console for `[Service Worker]` messages

2. **Side Panel Logs**
   - Open side panel
   - Right-click in side panel → "Inspect"
   - Check console for `[Main]` and `[Auth]` messages

3. **Content Script Logs**
   - Navigate to LinkedIn profile
   - Open DevTools (F12) on the LinkedIn page
   - Check console for `[LinkedIn Scraper]` messages

### Common Issues

**Extension won't load:**
- Check `dist/manifest.json` is valid JSON
- Verify all files are in `dist/` folder
- Check Chrome console for errors

**Authentication not working:**
- Verify you're signed into Chrome with @savvywealth.com
- Check `chrome://settings/people` for your profile
- Try clicking "Check Again" button

**No leads appearing:**
- Verify n8n webhook URL is correct
- Test connection in Settings
- Check browser console for API errors
- Verify n8n workflow is running and returns JSON

**LinkedIn scraper not working:**
- Make sure you're on a LinkedIn profile page
- Check content script is injected (DevTools → Sources → linkedin-scraper.js)
- Look for console errors in LinkedIn page DevTools

**Profile not enriching:**
- Verify profile URL matches lead's LinkedIn URL
- Check name matching (first + last name)
- Look for `[Main] Profile update:` messages in side panel console

## Step 6: Verify No CSV Functionality

- [ ] No file input elements in UI
- [ ] No "Import CSV" buttons
- [ ] Only "Sync from Salesforce" button present
- [ ] No CSV-related code in console errors

## Quick Test Checklist

**Minimum Viable Test (without webhooks):**
1. Load extension ✓
2. Check authentication screen appears ✓
3. Verify UI loads correctly ✓
4. Check settings modal opens ✓

**Full Test (with webhooks):**
1. Configure webhooks ✓
2. Sync leads ✓
3. Navigate leads ✓
4. Test LinkedIn scraper ✓
5. Generate message ✓
6. Copy message ✓
7. Mark as sent ✓

## Next Steps After Testing

If everything works:
- Configure production webhook URLs
- Test with real Salesforce data
- Train users on the extension

If issues found:
- Check console logs for errors
- Verify webhook configurations
- Test individual components (auth, sync, scraper)
- Refer to `BUILD_INSTRUCTIONS.md` for troubleshooting

