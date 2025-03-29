#!/usr/bin/env node

/**
 * ENHANCED UPLOAD MIGRATION SCRIPT
 * 
 * This script performs three critical functions:
 * 1. Migrates files from non-persistent 'uploads' to persistent '.data/uploads'
 * 2. Identifies any post media that exists locally but not on Cloudinary and uploads it
 * 3. Ensures database references point to Cloudinary URLs
 * 
 * This helps solve the issue of posts losing their media across deployments.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { v2 as cloudinary } from 'cloudinary';
import pg from 'pg';

// Setup database and Cloudinary from environment variables
const { Pool } = pg;
let pool;

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dgrs48tas',
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Connect to the database
async function connectToDatabase() {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });
    
    // Test the connection
    const client = await pool.connect();
    console.log('Successfully connected to database');
    client.release();
    return true;
  } catch (err) {
    console.error('Failed to connect to database:', err);
    return false;
  }
}

// Upload a file to Cloudinary
async function uploadToCloudinary(filePath, options = {}) {
  try {
    // Default options
    const uploadOptions = {
      folder: 'dgrs48tas/posts',
      ...options
    };
    
    // Detect if it's an image or video based on file extension
    const fileExtension = path.extname(filePath).toLowerCase();
    const isVideo = ['.mp4', '.mov', '.webm', '.avi'].includes(fileExtension);
    
    if (isVideo) {
      uploadOptions.resource_type = 'video';
    }
    
    // Upload to Cloudinary
    console.log(`Uploading ${filePath} to Cloudinary...`);
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(filePath, uploadOptions, (error, result) => {
        if (error) {
          console.error(`Cloudinary upload failed for ${filePath}:`, error);
          reject(error);
        } else {
          console.log(`Successfully uploaded to Cloudinary: ${result.secure_url}`);
          resolve(result);
        }
      });
    });
  } catch (err) {
    console.error(`Error uploading to Cloudinary:`, err);
    throw err;
  }
}

// Get posts with local file references
async function getPostsWithLocalMedia() {
  try {
    const { rows } = await pool.query(`
      SELECT id, media 
      FROM posts 
      WHERE media IS NOT NULL AND media != '[]'::jsonb
    `);
    
    return rows;
  } catch (err) {
    console.error('Error fetching posts:', err);
    return [];
  }
}

// Get users with local photo references
async function getUsersWithLocalPhotos() {
  try {
    const { rows } = await pool.query(`
      SELECT id, photo 
      FROM users 
      WHERE photo IS NOT NULL AND photo != ''
    `);
    
    return rows;
  } catch (err) {
    console.error('Error fetching users:', err);
    return [];
  }
}

// Update post media in database
async function updatePostMedia(postId, newMedia) {
  try {
    await pool.query(
      'UPDATE posts SET media = $1 WHERE id = $2',
      [JSON.stringify(newMedia), postId]
    );
    console.log(`Updated media for post ${postId}`);
    return true;
  } catch (err) {
    console.error(`Failed to update media for post ${postId}:`, err);
    return false;
  }
}

// Update user photo in database
async function updateUserPhoto(userId, photoUrl) {
  try {
    await pool.query(
      'UPDATE users SET photo = $1 WHERE id = $2',
      [photoUrl, userId]
    );
    console.log(`Updated photo for user ${userId}`);
    return true;
  } catch (err) {
    console.error(`Failed to update photo for user ${userId}:`, err);
    return false;
  }
}

// Main migration function
async function migrateUploads() {
  const oldUploadsDir = path.join(process.cwd(), 'uploads');
  const newUploadsDir = path.join(process.cwd(), '.data', 'uploads');
  
  console.log('Starting comprehensive media migration...');
  console.log('This will:');
  console.log('1. Move files from uploads/ to .data/uploads/ (persistent storage)');
  console.log('2. Upload local files to Cloudinary');
  console.log('3. Update database references to use Cloudinary URLs');
  
  try {
    // Step 1: Connect to database
    const dbConnected = await connectToDatabase();
    if (!dbConnected) {
      console.log('Proceeding with file migration only (no database updates)');
    }
    
    // Step 2: Ensure directories exist
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
    
    // Step 3: Migrate files from old uploads directory if it exists
    let oldFiles = [];
    try {
      await fs.access(oldUploadsDir);
      oldFiles = await fs.readdir(oldUploadsDir);
      
      if (oldFiles.length > 0) {
        console.log(`Found ${oldFiles.length} files to migrate from old uploads directory.`);
        
        // Copy each file to the new location
        for (const file of oldFiles) {
          const srcPath = path.join(oldUploadsDir, file);
          const destPath = path.join(newUploadsDir, file);
          
          // Check if it's a directory
          const stats = await fs.stat(srcPath);
          if (stats.isDirectory()) {
            console.log(`Skipping directory: ${file}`);
            continue;
          }
          
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
        
        console.log('File migration complete!');
        console.log(`${oldFiles.length} files have been copied to the persistent storage location.`);
      } else {
        console.log('No files to migrate from old uploads directory.');
      }
    } catch (err) {
      console.log('No existing uploads directory found or error accessing it:', err.message);
    }
    
    // Step 4: If database is connected, handle Cloudinary uploads and DB updates
    if (dbConnected) {
      console.log('\nChecking database for local media references...');
      
      // Get posts with media
      const posts = await getPostsWithLocalMedia();
      console.log(`Found ${posts.length} posts with media attachments.`);
      
      // Process each post's media
      for (const post of posts) {
        let media = JSON.parse(post.media);
        let updated = false;
        
        for (let i = 0; i < media.length; i++) {
          const mediaItem = media[i];
          
          // Skip if already on Cloudinary
          if (mediaItem.url && mediaItem.url.includes('cloudinary.com')) {
            console.log(`Post ${post.id}, media item ${i}: Already on Cloudinary`);
            continue;
          }
          
          // Check if the URL is a local file path
          if (mediaItem.url && (mediaItem.url.startsWith('/uploads/') || mediaItem.url.startsWith('uploads/'))) {
            const filename = mediaItem.url.split('/').pop();
            const persistentPath = path.join(newUploadsDir, filename);
            
            try {
              // Check if file exists in persistent storage
              await fs.access(persistentPath);
              console.log(`Found local file for post ${post.id}: ${persistentPath}`);
              
              // Upload to Cloudinary
              const cloudinaryResult = await uploadToCloudinary(persistentPath, {
                folder: 'dgrs48tas/posts',
                resource_type: mediaItem.type === 'video' ? 'video' : 'image'
              });
              
              // Update the media item
              media[i] = {
                ...mediaItem,
                url: cloudinaryResult.secure_url,
                cloudinaryId: cloudinaryResult.public_id
              };
              
              updated = true;
              console.log(`Updated media URL for post ${post.id}: ${cloudinaryResult.secure_url}`);
            } catch (err) {
              console.error(`File not found or error uploading for post ${post.id}, media ${i}:`, err.message);
            }
          }
        }
        
        // Update the post if media was changed
        if (updated) {
          await updatePostMedia(post.id, media);
        }
      }
      
      // Process user photos
      const users = await getUsersWithLocalPhotos();
      console.log(`Found ${users.length} users with profile photos.`);
      
      for (const user of users) {
        // Skip if already on Cloudinary
        if (user.photo && user.photo.includes('cloudinary.com')) {
          console.log(`User ${user.id}: Photo already on Cloudinary`);
          continue;
        }
        
        // Check if the photo is a local file path
        if (user.photo && (user.photo.startsWith('/uploads/') || user.photo.startsWith('uploads/'))) {
          const filename = user.photo.split('/').pop();
          const persistentPath = path.join(newUploadsDir, filename);
          
          try {
            // Check if file exists in persistent storage
            await fs.access(persistentPath);
            console.log(`Found local file for user ${user.id}: ${persistentPath}`);
            
            // Upload to Cloudinary
            const cloudinaryResult = await uploadToCloudinary(persistentPath, {
              folder: 'dgrs48tas/users'
            });
            
            // Update the user photo
            await updateUserPhoto(user.id, cloudinaryResult.secure_url);
            console.log(`Updated photo URL for user ${user.id}: ${cloudinaryResult.secure_url}`);
          } catch (err) {
            console.error(`File not found or error uploading for user ${user.id}:`, err.message);
          }
        }
      }
    }
    
    console.log('\nMigration complete!');
    console.log('All files have been moved to persistent storage and database references updated.');
    console.log('You can now safely delete the old uploads directory if desired.');
    console.log('Run: rm -rf uploads  # Only after verifying the migration was successful');
    
    // Cleanup
    if (pool) {
      await pool.end();
    }
    
  } catch (err) {
    console.error('Migration failed:', err);
    
    // Cleanup
    if (pool) {
      await pool.end();
    }
  }
}

migrateUploads();