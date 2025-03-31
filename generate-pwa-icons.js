import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SOURCE_ICON = 'generated-icon.png'; // Path to the source icon
const ICON_SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const ICON_OUTPUT_DIR = 'client/public/icons'; // Output directory for icon files

// Create output directory if it doesn't exist
if (!fs.existsSync(ICON_OUTPUT_DIR)) {
  fs.mkdirSync(ICON_OUTPUT_DIR, { recursive: true });
}

// Generate PWA icons in different sizes
async function generatePWAIcons() {
  console.log('Generating PWA icons...');
  
  try {
    // Check if source icon exists
    if (!fs.existsSync(SOURCE_ICON)) {
      console.error(`Source icon not found: ${SOURCE_ICON}`);
      return;
    }

    // Also create Apple touch icon (180x180px with no transparency)
    await sharp(SOURCE_ICON)
      .resize(180, 180)
      .flatten({ background: '#ffffff' }) // Remove transparency
      .toFile(path.join(ICON_OUTPUT_DIR, 'apple-touch-icon.png'));
    
    console.log('Created apple-touch-icon.png');

    // Generate regular icons
    for (const size of ICON_SIZES) {
      await sharp(SOURCE_ICON)
        .resize(size, size)
        .toFile(path.join(ICON_OUTPUT_DIR, `icon-${size}x${size}.png`));
      
      console.log(`Created icon-${size}x${size}.png`);
    }

    console.log('All PWA icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
  }
}

generatePWAIcons();