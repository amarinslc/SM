import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { db } from './db';
import { users, posts } from '@shared/schema';
import { eq, gt } from 'drizzle-orm';
import { uploadToCloudinary } from './cloudinary';

// Promisify fs methods
const existsAsync = promisify(fs.exists);
const readFileAsync = promisify(fs.readFile);

// Paths for local storage
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const DATA_UPLOADS_DIR = path.join(process.cwd(), '.data', 'uploads');

/**
 * Check if a file exists in either the uploads directory or the .data/uploads directory
 * 
 * @param filePath - The relative path to the file (e.g., '/uploads/file.jpg')
 * @returns Object with exists flag and absolute path if found
 */
export async function checkFileExists(filePath: string): Promise<{ exists: boolean, path?: string }> {
  if (!filePath || typeof filePath !== 'string') {
    console.log(`Invalid file path: ${filePath}`);
    return { exists: false };
  }

  // Extract the filename from the path
  const filename = path.basename(filePath);
  
  console.log(`Checking for file: ${filename}`);
  console.log(`Full path provided: ${filePath}`);
  
  // Check standard uploads directory
  const standardPath = path.join(UPLOADS_DIR, filename);
  console.log(`Checking standard path: ${standardPath}`);
  if (await existsAsync(standardPath)) {
    console.log(`File found at: ${standardPath}`);
    return { exists: true, path: standardPath };
  }
  
  // Check .data/uploads directory
  const dataPath = path.join(DATA_UPLOADS_DIR, filename);
  console.log(`Checking data path: ${dataPath}`);
  if (await existsAsync(dataPath)) {
    console.log(`File found at: ${dataPath}`);
    return { exists: true, path: dataPath };
  }
  
  // Remove /uploads/ prefix if present and check again
  if (filePath.startsWith('/uploads/')) {
    const filenameOnly = filePath.replace('/uploads/', '');
    const standardPathAlt = path.join(UPLOADS_DIR, filenameOnly);
    console.log(`Checking alt standard path: ${standardPathAlt}`);
    
    if (await existsAsync(standardPathAlt)) {
      console.log(`File found at: ${standardPathAlt}`);
      return { exists: true, path: standardPathAlt };
    }
    
    const dataPathAlt = path.join(DATA_UPLOADS_DIR, filenameOnly);
    console.log(`Checking alt data path: ${dataPathAlt}`);
    if (await existsAsync(dataPathAlt)) {
      console.log(`File found at: ${dataPathAlt}`);
      return { exists: true, path: dataPathAlt };
    }
  }
  
  console.log(`File not found: ${filePath}`);
  return { exists: false };
}

/**
 * Verify and repair user profile photos
 * Checks if photos exist and uploads them to Cloudinary if they do
 * Updates the database with the new URLs
 */
export async function verifyAndRepairUserPhotos(): Promise<{
  total: number;
  missing: number;
  repaired: number;
  failed: number;
}> {
  const stats = { total: 0, missing: 0, repaired: 0, failed: 0 };
  
  try {
    // Get all users
    const allUsers = await db
      .select()
      .from(users);
    
    // Filter users with photos client-side
    const usersWithPhotos = allUsers.filter(user => user.photo);
    
    stats.total = usersWithPhotos.length;
    console.log(`Verifying ${stats.total} user photos...`);
    
    for (const user of usersWithPhotos) {
      try {
        // Skip if the photo is already a Cloudinary URL or is empty
        if (!user.photo || (user.photo && user.photo.includes('cloudinary.com'))) {
          continue;
        }
        
        // Check if the file exists locally
        const fileCheck = await checkFileExists(user.photo);
        
        if (!fileCheck.exists || !fileCheck.path) {
          console.log(`Missing user photo: ${user.photo} for user ${user.username}`);
          stats.missing++;
          
          try {
            // Clear the broken photo reference
            await db
              .update(users)
              .set({ photo: null })
              .where(eq(users.id, user.id));
            
            console.log(`Cleared broken photo reference for user ${user.username}`);
            stats.repaired++;
          } catch (error) {
            console.error(`Failed to clear photo for user ${user.id}:`, error);
            stats.failed++;
          }
          continue;
        }
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(fileCheck.path, {
          folder: 'dgrs48tas/users',
        });
        
        // Update the user record with the Cloudinary URL
        await db
          .update(users)
          .set({ photo: result.secure_url })
          .where(eq(users.id, user.id));
        
        console.log(`Repaired user photo for ${user.username}: ${result.secure_url}`);
        stats.repaired++;
      } catch (error) {
        console.error(`Failed to repair photo for user ${user.id}:`, error);
        stats.failed++;
      }
    }
    
    return stats;
  } catch (error) {
    console.error('Failed to verify and repair user photos:', error);
    throw error;
  }
}

/**
 * Verify and repair post media
 * Checks if media exists and uploads it to Cloudinary if it does
 * Updates the database with the new URLs
 */
export async function verifyAndRepairPostMedia(): Promise<{
  total: number;
  postsWithMissingMedia: number;
  missingMediaItems: number;
  repairedMediaItems: number;
  failedMediaItems: number;
}> {
  const stats = {
    total: 0,
    postsWithMissingMedia: 0,
    missingMediaItems: 0,
    repairedMediaItems: 0,
    failedMediaItems: 0,
  };
  
  try {
    // Get all posts with media - using a simpler filter approach
    const allPosts = await db
      .select()
      .from(posts);
    
    // Filter posts with media client-side
    const postsWithMedia = allPosts.filter(post => {
      return Array.isArray(post.media) && post.media.length > 0;
    });
    
    stats.total = postsWithMedia.length;
    console.log(`Verifying media for ${stats.total} posts...`);
    
    for (const post of postsWithMedia) {
      let postHasMissingMedia = false;
      const updatedMedia: any[] = [];
      
      // Ensure media is an array before processing
      const mediaArray = Array.isArray(post.media) ? post.media : [];
      
      for (const mediaItem of mediaArray) {
        try {
          // Skip if the media is already a Cloudinary URL
          if (mediaItem.url && mediaItem.url.includes('cloudinary.com')) {
            updatedMedia.push(mediaItem);
            continue;
          }
          
          // Check if the file exists locally
          const fileCheck = await checkFileExists(mediaItem.url);
          
          if (!fileCheck.exists || !fileCheck.path) {
            console.log(`Missing media: ${mediaItem.url} for post ${post.id}`);
            stats.missingMediaItems++;
            postHasMissingMedia = true;
            
            // Instead of just marking it as broken, we'll clean it up
            // Remove the media item completely from this post
            stats.repairedMediaItems++;
            console.log(`Removed broken media reference for post ${post.id}`);
            
            // We don't push anything to updatedMedia, effectively removing this media item
            continue;
          }
          
          // Upload to Cloudinary
          const result = await uploadToCloudinary(fileCheck.path, {
            folder: 'dgrs48tas/posts',
            resource_type: mediaItem.type === 'video' ? 'video' : 'image',
          });
          
          // Add the updated media item
          updatedMedia.push({
            ...mediaItem,
            url: result.secure_url,
            cloudinaryId: result.public_id,
          });
          
          console.log(`Repaired media for post ${post.id}: ${result.secure_url}`);
          stats.repairedMediaItems++;
        } catch (error) {
          console.error(`Failed to repair media for post ${post.id}:`, error);
          stats.failedMediaItems++;
          
          // Instead of keeping broken references, we'll simply remove them
          console.log(`Removing failed media reference for post ${post.id}`);
          // We don't push anything to updatedMedia, effectively removing this media item
        }
      }
      
      if (postHasMissingMedia) {
        stats.postsWithMissingMedia++;
      }
      
      // Update the post with the new media
      await db
        .update(posts)
        .set({ media: updatedMedia })
        .where(eq(posts.id, post.id));
    }
    
    return stats;
  } catch (error) {
    console.error('Failed to verify and repair post media:', error);
    throw error;
  }
}

/**
 * Run a full verification and repair of all files
 * Checks all user photos and post media
 */
export async function runFullVerification(): Promise<{
  users: {
    total: number;
    missing: number;
    repaired: number;
    failed: number;
  };
  posts: {
    total: number;
    postsWithMissingMedia: number;
    missingMediaItems: number;
    repairedMediaItems: number;
    failedMediaItems: number;
  };
}> {
  console.log('Starting full file verification...');
  
  const userStats = await verifyAndRepairUserPhotos();
  const postStats = await verifyAndRepairPostMedia();
  
  console.log('File verification complete!');
  console.log('User photo stats:', userStats);
  console.log('Post media stats:', postStats);
  
  return {
    users: userStats,
    posts: postStats,
  };
}