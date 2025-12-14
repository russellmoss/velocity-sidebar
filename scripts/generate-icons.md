# Icon Generation Instructions

The extension requires three icon files in `public/icons/`:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

## Quick Solution

You can create simple placeholder icons using any image editor:
1. Create a square canvas with the required dimensions
2. Fill background with dark color: `#1F2937`
3. Add a green "S" letter in the center (color: `#10B981`)
4. Save as PNG

## Using Online Tools

You can use online icon generators or create them programmatically using:
- ImageMagick
- Canvas API (Node.js script)
- Online icon generators

## Temporary Workaround

For development, you can use any 16x16, 48x48, and 128x128 PNG files as placeholders.
The extension will work without proper icons, but they should be replaced before distribution.

