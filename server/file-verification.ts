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
    return { exists: false };
  }

  // Extract the filename from the path
  const filename = path.basename(filePath);
  
  // Check standard uploads directory
  const standardPath = path.join(UPLOADS_DIR, filename);
  if (await existsAsync(standardPath)) {
    return { exists: true, path: standardPath };
  }
  
  // Check .data/uploads directory
  const dataPath = path.join(DATA_UPLOADS_DIR, filename);
  if (await existsAsync(dataPath)) {
    return { exists: true, path: dataPath };
  }
  
  // Remove /uploads/ prefix if present and check again
  if (filePath.startsWith('/uploads/')) {
    const filenameOnly = filePath.replace('/uploads/', '');
    const standardPathAlt = path.join(UPLOADS_DIR, filenameOnly);
    
    if (await existsAsync(standardPathAlt)) {
      return { exists: true, path: standardPathAlt };
    }
    
    const dataPathAlt = path.join(DATA_UPLOADS_DIR, filenameOnly);
    if (await existsAsync(dataPathAlt)) {
      return { exists: true, path: dataPathAlt };
    }
  }
  
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
          continue;
        }
        
        // Upload to Cloudinary
        const result = await uploadToCloudinary(fileCheck.path, {
          folder: 'dunbar/users',
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
            
            // Keep the original reference but mark it as broken
            updatedMedia.push({
              ...mediaItem,
              broken: true,
            });
            continue;
          }
          
          // Upload to Cloudinary
          const result = await uploadToCloudinary(fileCheck.path, {
            folder: 'dunbar/posts',
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
          
          // Keep the original reference but mark it as broken
          updatedMedia.push({
            ...mediaItem,
            broken: true,
          });
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