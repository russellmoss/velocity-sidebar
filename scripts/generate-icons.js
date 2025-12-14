import sharp from 'sharp';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const iconsDir = join(__dirname, '..', 'public', 'icons');

// Ensure icons directory exists
mkdirSync(iconsDir, { recursive: true });

// Colors
const bgColor = '#1F2937'; // Dark gray
const textColor = '#10B981'; // Green

async function createIcon(size, filename) {
  // Create SVG with green "S" on dark background
  const svg = `
    <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${bgColor}"/>
      <text 
        x="50%" 
        y="50%" 
        font-family="Arial, sans-serif" 
        font-size="${Math.floor(size * 0.65)}" 
        font-weight="bold" 
        fill="${textColor}" 
        text-anchor="middle" 
        dominant-baseline="central"
      >S</text>
    </svg>
  `;

  // Convert SVG to PNG
  const pngBuffer = await sharp(Buffer.from(svg))
    .png()
    .toBuffer();

  const filepath = join(iconsDir, filename);
  writeFileSync(filepath, pngBuffer);
  console.log(`✓ Created ${filename} (${size}x${size})`);
}

async function generateAllIcons() {
  console.log('Generating icon files...\n');
  await createIcon(16, 'icon16.png');
  await createIcon(48, 'icon48.png');
  await createIcon(128, 'icon128.png');
  console.log('\n✓ All icons created successfully!');
}

generateAllIcons().catch(console.error);
