import { copyFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, statSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');
const publicDir = join(rootDir, 'public');

// Copy manifest.json
const manifestSrc = join(publicDir, 'manifest.json');
const manifestDest = join(distDir, 'manifest.json');
if (existsSync(manifestSrc)) {
  mkdirSync(dirname(manifestDest), { recursive: true });
  copyFileSync(manifestSrc, manifestDest);
  console.log('✓ Copied manifest.json');
}

// Copy icons directory
function copyDir(src, dest) {
  if (!existsSync(src)) {
    console.warn(`⚠ Source directory does not exist: ${src}`);
    return;
  }
  
  mkdirSync(dest, { recursive: true });
  
  const entries = readdirSync(src).filter(entry => !entry.endsWith('.md')); // Skip README files
  
  if (entries.length === 0) {
    console.warn('⚠ Icons directory is empty. Please create icon16.png, icon48.png, and icon128.png');
    return;
  }
  
  for (const entry of entries) {
    const srcPath = join(src, entry);
    const destPath = join(dest, entry);
    
    if (statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
  console.log('✓ Copied icons directory');
}

const iconsSrc = join(publicDir, 'icons');
const iconsDest = join(distDir, 'icons');
copyDir(iconsSrc, iconsDest);

