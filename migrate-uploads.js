#!/usr/bin/env node

/**
 * This script migrates files from the non-persistent 'uploads' directory
 * to the persistent '.data/uploads' directory to ensure file persistence
 * across redeployments.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateUploads() {
  const oldUploadsDir = path.join(process.cwd(), 'uploads');
  const newUploadsDir = path.join(process.cwd(), '.data', 'uploads');
  
  console.log('Starting migration of uploads to persistent storage...');
  
  try {
    // Check if old uploads directory exists
    try {
      await fs.access(oldUploadsDir);
    } catch (err) {
      console.log('No existing uploads directory found. Nothing to migrate.');
      return;
    }
    
    // Ensure .data directory exists
    try {
      await fs.access(path.join(process.cwd(), '.data'));
    } catch (err) {
      console.log('Creating .data directory...');
      await fs.mkdir(path.join(process.cwd(), '.data'), { recursive: true, mode: 0o755 });
    }
    
    // Ensure new uploads directory exists
    try {
      await fs.access(newUploadsDir);
    } catch (err) {
      console.log('Creating .data/uploads directory...');
      await fs.mkdir(newUploadsDir, { recursive: true, mode: 0o755 });
    }
    
    // Get list of files in old uploads directory
    const files = await fs.readdir(oldUploadsDir);
    
    if (files.length === 0) {
      console.log('No files to migrate. Uploads directory is empty.');
      return;
    }
    
    console.log(`Found ${files.length} files to migrate.`);
    
    // Copy each file to the new location
    for (const file of files) {
      const srcPath = path.join(oldUploadsDir, file);
      const destPath = path.join(newUploadsDir, file);
      
      // Check if file already exists in destination
      try {
        await fs.access(destPath);
        console.log(`File ${file} already exists in destination, skipping...`);
        continue;
      } catch (err) {
        // File doesn't exist, proceed with copy
      }
      
      console.log(`Copying ${file}...`);
      await fs.copyFile(srcPath, destPath);
    }
    
    console.log('Migration complete!');
    console.log(`${files.length} files have been copied to the persistent storage location.`);
    console.log('You can now safely delete the old uploads directory if desired.');
    console.log('Run: rm -rf uploads  # Only after verifying the migration was successful');
    
  } catch (err) {
    console.error('Migration failed:', err);
  }
}

migrateUploads();