# SGA Velocity Sidebar v3.1 - Build Instructions

## Prerequisites
- Node.js installed
- npm installed
- Chrome browser

## Build Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Build Extension**
   ```bash
   npm run build
   ```

3. **Verify Build Output**
   The `dist/` folder should contain:
   - `manifest.json` - Extension manifest
   - `service-worker.js` - Background service worker
   - `linkedin-scraper.js` - Content script for LinkedIn
   - `src/sidepanel/index.html` - Side panel HTML
   - `assets/` - Compiled JavaScript and CSS
   - `icons/` - Extension icons (create these if missing)

## Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `dist/` folder
5. The extension should appear in your extensions list

## Icon Files Required

Before loading the extension, create these icon files in `public/icons/`:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Each icon should have:
- Green "S" letter on dark background (#1F2937)
- Simple, clean design matching Savvy Wealth branding

After creating icons, rebuild:
```bash
npm run build
```

## Configuration

1. **Sign into Chrome** with your @savvywealth.com account
2. **Open the extension** by clicking the extension icon
3. **Configure webhooks** in Settings:
   - n8n webhook URL (for fetching leads)
   - Zapier webhook URL (for logging activity)
4. **Test connections** using the "Test Connection" buttons

## Troubleshooting

### Build Errors
- If PostCSS/Tailwind errors occur, ensure config files use ES module syntax
- Check that all dependencies are installed: `npm install`

### Extension Won't Load
- Verify all files are in `dist/` folder
- Check Chrome console for errors (F12)
- Ensure manifest.json is valid JSON

### Authentication Issues
- Make sure you're signed into Chrome with @savvywealth.com account
- Check Chrome profile: `chrome://settings/people`
- Verify `identity` and `identity.email` permissions in manifest

### No Leads Appearing
- Verify n8n webhook URL is configured correctly
- Check n8n workflow is running and returns JSON
- Test connection in Settings
- Check browser console for API errors

## Development

For development with watch mode:
```bash
npm run dev
```

This will rebuild automatically on file changes.

## Type Checking

To verify TypeScript compilation:
```bash
npm run typecheck
```

