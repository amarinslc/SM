/**
 * Utility functions for handling images, especially dealing with 
 * both local uploads and Cloudinary URLs
 */

// Default avatar image to use when a user has no profile photo
export const DEFAULT_AVATAR = '/Vector.png';

// Default image to show when a post image is missing
export const DEFAULT_POST_IMAGE = '/Frame 2.png';

/**
 * Check if a URL is a Cloudinary URL
 * 
 * @param url - The URL to check
 * @returns true if the URL is from Cloudinary
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes('cloudinary.com');
}

/**
 * Get the appropriate image URL for display, handling various cases:
 * - Cloudinary URLs are returned as-is
 * - Local uploads paths are passed through
 * - Empty/null values return the default image
 * 
 * @param imagePath - The image path to process
 * @param defaultImage - The default image to use if no image is provided
 * @returns The final image URL to use
 */
export function getImageUrl(
  imagePath: string | null | undefined,
  defaultImage: string = DEFAULT_AVATAR
): string {
  if (!imagePath) return defaultImage;
  
  // If it's a Cloudinary URL, return it as-is
  if (isCloudinaryUrl(imagePath)) {
    return imagePath;
  }
  
  // Otherwise, it's a local path, return as-is
  return imagePath;
}

/**
 * Handle image loading errors by falling back to a default image
 * 
 * @param event - The error event from the image
 * @param defaultImage - The default image to use (optional)
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement, Event>,
  defaultImage: string = DEFAULT_AVATAR
): void {
  const target = event.target as HTMLImageElement;
  
  // Prevent infinite reload loops
  if (target.src === defaultImage) return;
  
  console.warn(`Failed to load image: ${target.src}, falling back to default`);
  target.src = defaultImage;
}

/**
 * Format a Cloudinary URL to adjust various parameters:
 * - Different sizes
 * - Format conversion
 * - Quality adjustments
 * - Face detection for avatars
 * 
 * @param url - The Cloudinary URL to format
 * @param options - Formatting options
 * @returns The formatted Cloudinary URL
 */
export function formatCloudinaryUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    crop?: 'fill' | 'limit' | 'thumb';
    gravity?: 'face' | 'auto';
    quality?: number;
    format?: 'webp' | 'jpg' | 'png';
  } = {}
): string {
  if (!isCloudinaryUrl(url)) return url;
  
  // Extract the base URL and version path
  const uploadIndex = url.indexOf('/upload/');
  if (uploadIndex === -1) return url;
  
  const baseUrl = url.substring(0, uploadIndex + 8); // include '/upload/'
  const versionAndPath = url.substring(baseUrl.length);
  
  // Build transformation string
  const transformations = [];
  
  if (options.width) transformations.push(`w_${options.width}`);
  if (options.height) transformations.push(`h_${options.height}`);
  if (options.crop) transformations.push(`c_${options.crop}`);
  if (options.gravity) transformations.push(`g_${options.gravity}`);
  if (options.quality) transformations.push(`q_${options.quality}`);
  if (options.format) transformations.push(`f_${options.format}`);
  
  if (transformations.length === 0) return url;
  
  // Assemble the final URL with transformations
  return `${baseUrl}${transformations.join(',')}/${versionAndPath}`;
}

/**
 * Get an optimized avatar URL from either Cloudinary or local path
 * 
 * @param photoUrl - The original photo URL
 * @param size - The desired size
 * @returns An optimized avatar URL
 */
export function getAvatarUrl(photoUrl: string | null | undefined, size: number = 150): string {
  const imageUrl = getImageUrl(photoUrl);
  
  if (isCloudinaryUrl(imageUrl)) {
    return formatCloudinaryUrl(imageUrl, {
      width: size,
      height: size,
      crop: 'fill',
      gravity: 'face',
      quality: 80,
      format: 'webp'
    });
  }
  
  return imageUrl;
}