# SGA Velocity Sidebar v3.1

**High-velocity LinkedIn outreach tool for Savvy Wealth SGAs - Direct Salesforce Integration**

---

## 🎯 Overview

The **SGA Velocity Sidebar** is a Chrome Extension designed to dramatically accelerate LinkedIn outreach for Savvy Wealth SGAs (Strategic Growth Advisors). This tool streamlines the entire outreach workflow by seamlessly connecting Salesforce lead data with LinkedIn profiles, enabling SGAs to touch more leads per week than ever before while maintaining organization and compliance.

### The Problem It Solves

Traditional LinkedIn outreach is slow and manual:
- Switching between Salesforce and LinkedIn
- Copying lead information manually
- Writing messages from scratch
- Losing track of who has been contacted
- Struggling with LinkedIn's bot restrictions

### The Solution

A streamlined Chrome Extension that:
- ✅ Pulls leads directly from Salesforce lists
- ✅ Automatically navigates to LinkedIn profiles
- ✅ Generates copy-paste ready, personalized messages
- ✅ Logs activities back to Salesforce with one click
- ✅ Works within LinkedIn's restrictions (human-in-the-loop)
- ✅ Supports custom message templates for A/B testing

---

## 🚀 Key Features

### 1. **Direct Salesforce Integration**
- Sync leads from your assigned Salesforce lists (`Lead_List_Name__c` and `SGA_Self_List_name__c`)
- Filter by list name or view all leads
- Filter by "Unsent Only" to focus on new prospects
- Automatic authentication via Chrome profile email
- Only shows leads assigned to you (role-based security)

### 2. **LinkedIn Profile Navigation**
- One-click navigation to LinkedIn profiles
- Automatic profile data scraping (name, title, company, location, headline, accreditations)
- Works on LinkedIn profile pages, Talent Hub, and Recruiter

### 3. **Smart Message Generation**
- **Pre-built Templates**: Default templates for introductions, follow-ups, and reconnects
- **Custom Templates**: Create, edit, and manage your own message templates
- **Dynamic Variables**: Auto-populate with lead data:
  - `{{firstName}}`, `{{lastName}}`, `{{fullName}}`
  - `{{company}}`, `{{title}}`, `{{location}}`
  - `{{headline}}`, `{{accreditations}}`, `{{leadScore}}`
- **Template Categories**: Organize by Intro, Follow-up, Reconnect, or Custom
- **A/B Testing**: Try different messaging approaches with multiple templates

### 4. **One-Click Activity Logging**
- Mark leads as "Sent" directly from the extension
- Automatically updates Salesforce `Prospecting_Step_LinkedIn__c` field
- Logs timestamp, SGA email, and action type
- Keeps your Salesforce records organized and up-to-date

### 5. **Streamlined Workflow**
- Side panel UI that stays open while browsing LinkedIn
- Keyboard shortcuts for rapid navigation:
  - `⌘+→` (Mac) / `Ctrl+→` (Windows): Next lead
  - `⌘+S` (Mac) / `Ctrl+S` (Windows): Mark as sent
- Auto-advance to next lead after marking sent (optional)
- Character count and missing variable warnings

### 6. **Human-in-the-Loop Design**
- You control every message before sending
- Copy-paste workflow (not automated sending)
- Bypasses LinkedIn bot restrictions
- Maintains authentic, personal outreach

---

## 📋 How It Works

### The Complete Workflow

```
1. SGA opens extension → Authenticates via Chrome profile
   ↓
2. Syncs leads from Salesforce (filtered by assigned lists)
   ↓
3. Views lead details in sidebar (name, company, title, lead score)
   ↓
4. Clicks "Open LinkedIn" → Navigates to profile
   ↓
5. Extension scrapes LinkedIn profile data automatically
   ↓
6. Selects message template → Variables auto-populate
   ↓
7. Reviews and customizes message if needed
   ↓
8. Copies message → Pastes into LinkedIn message
   ↓
9. Sends message on LinkedIn
   ↓
10. Clicks "✓ Sent" → Logs activity in Salesforce
    ↓
11. Auto-advances to next lead (optional)
    ↓
12. Repeat for next lead
```

### Integration with SGA Command Center

After initial LinkedIn outreach, SGAs can continue the sequence in the **SGA Command Center**:

1. **LinkedIn Message** (via this extension) ✅
2. **SMS Messages** (via SGA Command Center)
3. **Email Campaigns** (via SGA Command Center)
4. **Voicemail Drops** (via SGA Command Center)

All activities are logged directly in Salesforce, providing:
- Complete activity history per lead
- Clear visibility of touchpoints
- Better organization and follow-up
- Increased activity per lead
- More leads touched per week

---

## 💡 Benefits

### For SGAs

- **Speed**: Touch 3-5x more leads per week
- **Organization**: Never lose track of who you've contacted
- **Personalization**: Messages automatically customized with lead data
- **Flexibility**: Create and test different message templates
- **Efficiency**: No more switching between multiple tools
- **Compliance**: All activities logged in Salesforce automatically

### For Savvy Wealth

- **Increased Activity**: More touches per lead = higher conversion rates
- **Better Data**: Complete activity tracking in Salesforce
- **Scalability**: SGAs can handle larger lead lists
- **Consistency**: Standardized outreach process
- **Analytics**: Better data for measuring outreach effectiveness

---

## 🛠️ Technical Details

### Architecture

- **Frontend**: Chrome Extension (Manifest V3)
- **Backend**: n8n workflows for Salesforce integration
- **Authentication**: Chrome Identity API (`chrome.identity.getProfileUserInfo`)
- **Storage**: Chrome Storage API (local + sync)
- **Build**: Vite + TypeScript + Tailwind CSS

### Security

- **Role-Based Access**: Only shows leads assigned to the logged-in SGA
- **Email Validation**: Requires `@savvywealth.com` domain
- **Secure API**: n8n webhooks with email-based filtering
- **Salesforce Security**: SOQL queries filtered by OwnerId

### Data Flow

```
Chrome Extension
    ↓ (GET request with email)
n8n Webhook
    ↓ (SOQL query filtered by OwnerId)
Salesforce
    ↓ (Lead records)
n8n
    ↓ (JSON response)
Chrome Extension
    ↓ (Display in sidebar)
```

---

## 📦 Installation

### Prerequisites

- Google Chrome browser
- Chrome profile signed in with `@savvywealth.com` email
- n8n workflows configured (see `documentation/` folder)
- Salesforce leads assigned to your user account

### Build from Source

```bash
# Clone the repository
git clone https://github.com/russellmoss/velocity-sidebar.git
cd velocity-sidebar

# Install dependencies
npm install

# Build the extension
npm run build

# The built extension will be in the `dist/` folder
```

### Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select the `dist/` folder from this project
5. The extension icon should appear in your Chrome toolbar

### Initial Setup

1. **Configure Webhooks** (one-time setup):
   - Click the settings icon (⚙️) in the extension
   - Enter your n8n webhook URLs:
     - **Lead List Workflow URL**: For fetching leads
     - **Message Sent Logging URL**: For logging activities
   - Click "Test Connection" to verify
   - Click "Save Settings"

2. **Sync Leads**:
   - Click "Sync from Salesforce" button
   - Leads will load automatically

3. **Start Outreach**:
   - Select a lead from the list
   - Click "Open LinkedIn" to navigate to their profile
   - Select a message template
   - Copy and paste the message
   - Mark as "Sent" when done

---

## 📖 Usage Guide

### Basic Workflow

1. **Open Extension**: Click the extension icon in Chrome toolbar
2. **Sync Leads**: Click "Sync from Salesforce" (or auto-syncs on open)
3. **Filter Leads**: 
   - Use "List Filter" dropdown to select a specific list
   - Toggle "Unsent Only" to show only new leads
4. **Select Lead**: Click on a lead from the list
5. **View Details**: See lead information in the sidebar
6. **Open LinkedIn**: Click "Open LinkedIn" button
7. **Generate Message**: 
   - Select a template from the dropdown
   - Message auto-populates with lead data
   - Customize if needed
8. **Copy Message**: Click "📋 Copy Message" button
9. **Paste & Send**: Paste into LinkedIn message and send
10. **Mark Sent**: Click "✓ Sent" to log in Salesforce

### Advanced Features

#### Custom Templates

1. Click the gear icon (⚙️) next to template dropdown
2. Click "New Template" to create your own
3. Use variables: `{{firstName}}`, `{{company}}`, etc.
4. Organize by category (Intro, Follow-up, Reconnect, Custom)
5. Edit, duplicate, or delete templates anytime

#### Keyboard Shortcuts

- `⌘+→` / `Ctrl+→`: Navigate to next lead
- `⌘+←` / `Ctrl+←`: Navigate to previous lead
- `⌘+S` / `Ctrl+S`: Mark current lead as sent
- `Escape`: Close modals

#### List Filtering

- **Search Lists**: Type in the list filter to fuzzy search
- **All Lists**: Select "All Lists" to see all leads
- **Specific List**: Select a list name to filter leads
- **Unsent Only**: Toggle to show only leads not yet contacted

---

## 🔧 Configuration

### Settings

Access settings via the ⚙️ icon in the extension footer.

**Available Settings:**
- **Lead List Workflow URL**: n8n webhook for fetching leads
- **Message Sent Logging URL**: n8n webhook for logging activities
- **Auto-advance after marking sent**: Automatically move to next lead

### n8n Workflow Setup

See `documentation/N8N_COMPLETE_SETUP.md` for detailed n8n configuration instructions.

**Required Workflows:**
1. **Lead List Workflow** (GET): Fetches leads from Salesforce
2. **Message Sent Logging Workflow** (POST): Logs activities to Salesforce

---

## 🐛 Troubleshooting

### No Leads Showing

- ✅ Verify you're signed into Chrome with `@savvywealth.com` email
- ✅ Check that leads are assigned to you in Salesforce
- ✅ Verify n8n webhook URLs are configured correctly
- ✅ Check that leads meet criteria (Status, Prospecting_Step_LinkedIn__c, etc.)

### Can't Open LinkedIn

- ✅ Ensure you're on a LinkedIn profile page
- ✅ Check that the LinkedIn URL is correct
- ✅ Try refreshing the page

### Messages Not Generating

- ✅ Select a template from the dropdown
- ✅ Check that lead data is populated
- ✅ Verify template variables match available data

### Activities Not Logging

- ✅ Check "Message Sent Logging URL" in settings
- ✅ Verify n8n workflow is active
- ✅ Check browser console for errors (F12)

---

## 📚 Documentation

Additional documentation is available in the `documentation/` folder:

- `N8N_COMPLETE_SETUP.md` - Complete n8n workflow setup guide
- `N8N_WORKFLOW_CODE_COMPLETE.md` - Full n8n node code examples
- `SECURITY_LEAD_FILTERING.md` - Security and lead filtering details
- `custom_template_update.md` - Template management implementation

---

## 🔒 Security & Privacy

- **Email-Based Authentication**: Uses Chrome's secure identity API
- **Role-Based Access**: Only shows leads assigned to the logged-in user
- **No Data Storage**: Leads cached locally only, not sent to external servers
- **Secure API**: All API calls go through n8n with email validation
- **Salesforce Security**: SOQL queries filtered by OwnerId at database level

---

## 🚧 Development

### Project Structure

```
velocity-sidebar/
├── src/
│   ├── background/        # Service worker
│   ├── content/          # LinkedIn scraper
│   ├── lib/              # Core services (API, auth, storage, templates)
│   ├── sidepanel/        # Main UI
│   └── types/            # TypeScript definitions
├── public/               # Static assets (manifest, icons)
├── scripts/              # Build scripts
└── documentation/        # Setup and configuration docs
```

### Development Commands

```bash
# Development mode (watch for changes)
npm run dev

# Build for production
npm run build

# Type checking
npm run typecheck

# Clean build artifacts
npm run clean
```

### Tech Stack

- **TypeScript**: Type-safe JavaScript
- **Vite**: Fast build tool
- **Tailwind CSS**: Utility-first CSS framework
- **Chrome Extension APIs**: Identity, Storage, Side Panel, Content Scripts

---

## 📝 Version History

### v3.1.0 (Current)
- ✅ Support for `SGA_Self_List_name__c` field
- ✅ Custom user templates with CRUD operations
- ✅ Fuzzy search for list filtering
- ✅ Alphabetical sorting of leads
- ✅ Enhanced security and email validation
- ✅ Improved UI/UX

### v3.0.0
- Initial release with core functionality
- Salesforce integration via n8n
- LinkedIn profile scraping
- Message template system
- Activity logging

---

## 🤝 Support

For issues, questions, or feature requests:
- Check the `documentation/` folder for setup guides
- Review troubleshooting section above
- Contact your Savvy Wealth admin

---

## 📄 License

Proprietary - Savvy Wealth Internal Use Only

---

## 🙏 Acknowledgments

Built for Savvy Wealth SGAs to accelerate LinkedIn outreach and increase lead engagement.

---

**Version:** 3.1.0  
**Last Updated:** December 2024  
**Maintained by:** Savvy Wealth Development Team

