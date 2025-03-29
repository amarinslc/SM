import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { promisify } from 'util';

// Configure Cloudinary
// Always set cloud_name to dgrs48tas
cloudinary.config({
  cloud_name: 'dgrs48tas', // Always use this cloud name
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
console.log('Configured Cloudinary with cloud_name: dgrs48tas');

// Promisify fs methods
const unlinkAsync = promisify(fs.unlink);

// Interface for upload options
interface UploadOptions {
  folder?: string;
  resource_type?: 'image' | 'video' | 'auto' | 'raw';
}

// Interface for the uploaded file result
export interface CloudinaryUploadResult {
  url: string;
  secure_url: string;
  public_id: string;
  format: string;
  resource_type: string;
}

/**
 * Upload a file to Cloudinary
 * 
 * @param filePath - The file path on the local system
 * @param options - Upload options (folder, resource_type, etc.)
 * @returns Promise with upload result
 */
export async function uploadToCloudinary(
  filePath: string,
  options: UploadOptions = {}
): Promise<CloudinaryUploadResult> {
  try {
    // Set default options
    const uploadOptions = {
      folder: options.folder || 'dgrs48tas',
      resource_type: options.resource_type || 'auto',
      use_filename: true,
      unique_filename: true,
    };

    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    // Delete local file after successful upload
    try {
      await unlinkAsync(filePath);
    } catch (err) {
      console.warn(`Failed to delete local file ${filePath}:`, err);
    }

    return {
      url: result.url,
      secure_url: result.secure_url,
      public_id: result.public_id,
      format: result.format,
      resource_type: result.resource_type
    };
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to upload file to Cloudinary: ${errorMessage}`);
  }
}

/**
 * Delete a file from Cloudinary
 * 
 * @param publicId - The public ID of the file to delete
 * @param options - Delete options (resource_type, etc.)
 * @returns Promise with deletion result
 */
export async function deleteFromCloudinary(
  publicId: string,
  options: { resource_type?: 'image' | 'video' | 'raw' } = {}
): Promise<{ result: string }> {
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: options.resource_type || 'image'
    });
    return { result };
  } catch (err) {
    console.error('Cloudinary deletion failed:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    throw new Error(`Failed to delete file from Cloudinary: ${errorMessage}`);
  }
}

/**
 * Extract public ID from a Cloudinary URL
 * 
 * @param url - The Cloudinary URL
 * @returns The public ID or null if not a Cloudinary URL
 */
export function extractPublicIdFromUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Check if it's a Cloudinary URL
  if (!url.includes('cloudinary.com')) return null;
  
  // Example URL: https://res.cloudinary.com/dgrs48tas/image/upload/v1234567890/dgrs48tas/filename.jpg
  // We want to extract: dgrs48tas/filename
  
  try {
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    
    if (uploadIndex === -1 || uploadIndex + 2 >= parts.length) return null;
    
    // Get everything after "upload" and the version segment
    const folderAndFile = parts.slice(uploadIndex + 2).join('/');
    
    // Remove file extension
    return folderAndFile.replace(/\.[^/.]+$/, '');
  } catch (err) {
    console.error('Failed to extract public ID:', err);
    return null;
  }
}