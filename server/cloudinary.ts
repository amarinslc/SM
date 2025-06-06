import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { promisify } from 'util';

// Configure Cloudinary
// First try using CLOUDINARY_URL if available (preferred)
if (process.env.CLOUDINARY_URL) {
  // When CLOUDINARY_URL exists, let the SDK parse it automatically without overriding
  cloudinary.config();
  console.log('Configured Cloudinary using CLOUDINARY_URL');
} else {
  // Fall back to individual environment variables if needed
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dgrs48tas',
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  
  // Force cloud_name to always be dgrs48tas, overriding potential misconfiguration
  if (cloudinary.config().cloud_name !== 'dgrs48tas') {
    cloudinary.config({ cloud_name: 'dgrs48tas' });
    console.log('Overrode cloud_name to ensure correct Cloudinary configuration');
  }
  console.log('Configured Cloudinary using individual credential variables');
}

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
 * Check if Cloudinary is properly configured
 * Returns a health status object with details on configuration
 */
export async function checkCloudinaryHealth(): Promise<{
  configured: boolean;
  status: string;
  details: {
    cloud_name: string | undefined;
    api_key_configured: boolean;
    api_secret_configured: boolean;
  };
}> {
  const cloud_name = cloudinary.config().cloud_name;
  const api_key_configured = !!cloudinary.config().api_key;
  const api_secret_configured = !!cloudinary.config().api_secret;
  
  // Check if the service is properly configured
  const configured = !!cloud_name && api_key_configured && api_secret_configured;
  
  // Do a lightweight ping to verify connectivity
  if (configured) {
    try {
      // Try accessing account info as a connectivity test
      await cloudinary.api.ping();
      return {
        configured,
        status: 'healthy',
        details: {
          cloud_name,
          api_key_configured,
          api_secret_configured
        }
      };
    } catch (error) {
      return {
        configured,
        status: 'configured_but_unreachable',
        details: {
          cloud_name,
          api_key_configured,
          api_secret_configured
        }
      };
    }
  }
  
  return {
    configured,
    status: 'not_configured',
    details: {
      cloud_name,
      api_key_configured,
      api_secret_configured
    }
  };
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