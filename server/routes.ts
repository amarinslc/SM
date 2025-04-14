import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { users, follows } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import express from 'express';
import { hashPassword } from './auth';
import { db, pool } from './db';
import { and, eq } from 'drizzle-orm';
import { uploadToCloudinary, checkCloudinaryHealth } from './cloudinary';
import { 
  checkFileExists,
  verifyAndRepairUserPhotos, 
  verifyAndRepairPostMedia,
  runFullVerification
} from './file-verification';
import { isAdmin } from './middlewares/admin-check';

// Use ONLY Replit's persistent .data folder for file storage
// This is critical for file persistence across deployments
const DATA_DIR = path.join(process.cwd(), '.data');
const uploadsDir = path.join(DATA_DIR, 'uploads');

try {
  await fs.access(uploadsDir);
} catch {
  // Create the .data directory first if it doesn't exist
  try {
    await fs.access(DATA_DIR);
  } catch {
    console.log('Creating persistent .data directory');
    await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o755 });
  }
  console.log('Creating persistent uploads directory at', uploadsDir);
  await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
}

// Ensure the temp directory exists in .data for temporary files
const tempDir = path.join(DATA_DIR, 'temp');
try {
  await fs.access(tempDir);
} catch {
  console.log('Creating persistent temp directory at', tempDir);
  await fs.mkdir(tempDir, { recursive: true, mode: 0o755 });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      // Always use the persistent .data/uploads directory
      // This is critical for file persistence across deployments
      fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 })
        .then(() => {
          console.log('Uploading to persistent directory:', uploadsDir);
          cb(null, uploadsDir);
        })
        .catch(err => {
          console.error('Error using persistent uploads directory:', err);
          // Try fallback to temp directory as last resort
          fs.mkdir(tempDir, { recursive: true, mode: 0o755 })
            .then(() => {
              console.warn('Using fallback temp directory for upload');
              cb(null, tempDir);
            })
            .catch(tempErr => {
              console.error('Critical error - both upload directories unavailable:', tempErr);
              cb(tempErr, '');
            });
        });
    },
    filename: (_req, file, cb) => {
      // Make filenames more unique with timestamp and random string
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
      const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      cb(null, `${uniqueSuffix}-${sanitizedFilename}`);
    },
  }),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (_req, file, cb) => {
    // Only accept image and video files
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif|mp4|webm|mov)$/i)) {
      return cb(new Error('Only image and video files are allowed!'));
    }
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Add this before other user routes to avoid conflicts
  app.get("/api/users/search", async (req, res) => {
    try {
      const query = req.query.q?.toString() || "";

      // If no query provided, return empty array
      if (!query.trim()) {
        return res.json([]);
      }

      const users = await storage.searchUsers(query);
      return res.json(users);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ 
        error: "Failed to search users",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    try {
      const userId = parseInt(req.params.id);

      // If the user is requesting their own profile, return full data
      if (req.isAuthenticated() && req.user!.id === userId) {
        const user = await storage.getFullUserData(userId);
        if (!user) return res.status(404).send("User not found");
        
        // Return with relationship status (always false for own profile)
        return res.json({
          user,
          isFollowing: false,
          isPending: false
        });
      }

      // For other users' profiles, get profile with relationship status
      const profile = await storage.getUserProfile(
        userId, 
        req.isAuthenticated() ? req.user!.id : undefined
      );
      
      if (!profile) return res.status(404).send("User not found");
      
      return res.json(profile);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      res.status(500).json({ error: "Failed to fetch user profile" });
    }
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const user = await storage.getFullUserData(req.user!.id);
      if (!user) return res.status(404).send("User not found");
      
      // Return with relationship status (always false for own profile)
      res.json({
        user,
        isFollowing: false,
        isPending: false
      });
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });


  app.patch("/api/user/profile", (req, res, next) => {
    // Global error handler for this route to always return JSON
    const handleError = (status: number, message: string) => {
      console.error(`Profile update error: ${message}`);
      return res.status(status).json({ 
        success: false,
        error: message
      });
    };
    
    // Authentication check
    if (!req.isAuthenticated()) {
      return handleError(401, "Authentication required");
    }
    
    // Pass control to multer middleware with error handling
    upload.single('photo')(req, res, async (err) => {
      if (err) {
        // Handle multer errors properly as JSON
        return handleError(400, err.message || "Invalid file upload");
      }
      
      console.log("Profile update request received:");
      console.log("Body:", req.body);
      console.log("File:", req.file ? "✅ File present" : "❌ No file");
      
      try {
        const updateData: Record<string, any> = {};
  
        // Handle text fields - supporting both snake_case and camelCase for iOS compatibility
        // Also support JSON parameters from URL-encoded form data
        if (req.body.name !== undefined) {
          updateData.name = req.body.name.trim();
        } else if (req.body.display_name !== undefined) {
          updateData.name = req.body.display_name.trim();
        } else if (req.body.displayName !== undefined) {
          updateData.name = req.body.displayName.trim();
        }
  
        if (req.body.bio !== undefined) {
          updateData.bio = req.body.bio.trim();
        }
  
        // Handle isPrivate field if present (support both formats)
        if (req.body.isPrivate !== undefined) {
          const isPrivateValue = req.body.isPrivate;
          // Handle string "true"/"false" vs boolean values
          updateData.isPrivate = typeof isPrivateValue === 'string' 
            ? isPrivateValue.toLowerCase() === 'true'
            : Boolean(isPrivateValue);
        } else if (req.body.is_private !== undefined) {
          const isPrivateValue = req.body.is_private;
          updateData.isPrivate = typeof isPrivateValue === 'string' 
            ? isPrivateValue.toLowerCase() === 'true'
            : Boolean(isPrivateValue);
        }
  
        console.log("Processed update data:", updateData);
  
        // Handle photo upload - strict Cloudinary-only approach
        if (req.file) {
          try {
            console.log("Processing file upload:", req.file.path);
            // Upload to Cloudinary
            const result = await uploadToCloudinary(req.file.path, {
              folder: 'dgrs48tas/users',
            });
            
            // Use the Cloudinary secure URL for the photo
            updateData.photo = result.secure_url;
            
            console.log(`Uploaded user photo to Cloudinary: ${result.secure_url}`);
          } catch (err) {
            console.error('Cloudinary upload failed:', err);
            // No fallback - return error to client as JSON
            return handleError(500, "Failed to upload profile photo. Please try again later.");
          }
        }
  
        // Check if there are any changes to update
        if (Object.keys(updateData).length === 0) {
          return handleError(400, "No changes detected");
        }
  
        const updatedUser = await storage.updateUser(req.user!.id, updateData);
        
        // Return a properly formatted response that matches what the iOS client expects
        // The updateUser method now ensures the user data is sanitized
        return res.status(200).json({
          success: true,
          user: updatedUser
        });
      } catch (error) {
        // Any error in the process returns a JSON response
        return handleError(400, error instanceof Error ? error.message : "Failed to update profile");
      }
    });
  });

  app.post("/api/users/:id/follow", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const targetId = parseInt(req.params.id);
      if (isNaN(targetId)) {
        return res.status(400).send("Invalid user ID");
      }

      const targetUser = await storage.getUser(targetId);
      if (!targetUser) {
        return res.status(404).send("User not found");
      }

      await storage.followUser(req.user!.id, targetId);

      // Return different message based on account privacy
      if (targetUser.isPrivate) {
        res.status(202).json({ message: "Follow request sent" });
      } else {
        res.status(200).json({ message: "Following" });
      }
    } catch (error) {
      console.error("Follow error:", error);
      res.status(400).send((error as Error).message);
    }
  });

  app.post("/api/users/:id/unfollow", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.unfollowUser(req.user!.id, parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
      res.status(400).send((error as Error).message);
    }
  });
  
  // New endpoint to remove a follower
  app.post("/api/users/:id/remove-follower", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const followerId = parseInt(req.params.id);
      const userId = req.user!.id;
      
      if (isNaN(followerId)) {
        return res.status(400).json({ error: "Invalid follower ID" });
      }
      
      await storage.removeFollower(userId, followerId);
      res.status(200).json({ message: "Follower removed successfully" });
    } catch (error) {
      console.error("Error removing follower:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/users/:id/followers", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const requestedUserId = parseInt(req.params.id);
    const currentUserId = req.user!.id;
    
    // Only allow access to the user's own followers
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "You can only view your own followers" });
    }
    
    const followers = await storage.getFollowers(requestedUserId);
    res.json(followers);
  });

  app.get("/api/users/:id/following", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const requestedUserId = parseInt(req.params.id);
    const currentUserId = req.user!.id;
    
    // Only allow access to the user's own following list
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "You can only view your own following list" });
    }
    
    const following = await storage.getFollowing(requestedUserId);
    res.json(following);
  });

  app.get("/api/users/:id/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const requestedUserId = parseInt(req.params.id);
    const currentUserId = req.user!.id;
    
    // Only allow access to the user's own requests
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "You can only view your own requests" });
    }
    
    try {
      const requests = await storage.getPendingFollowRequests(requestedUserId);
      res.json(requests);
    } catch (error) {
      console.error("Error getting requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });
  
  app.get("/api/users/:id/outgoing-requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    const requestedUserId = parseInt(req.params.id);
    const currentUserId = req.user!.id;
    
    // Only allow access to the user's own outgoing requests
    if (requestedUserId !== currentUserId) {
      return res.status(403).json({ error: "You can only view your own outgoing requests" });
    }
    
    try {
      const requests = await storage.getOutgoingFollowRequests(requestedUserId);
      res.json(requests);
    } catch (error) {
      console.error("Error getting outgoing requests:", error);
      res.status(500).json({ error: "Failed to get outgoing requests" });
    }
  });

  // Add routes matching documentation for iOS client compatibility
  app.get("/api/follow-requests/pending", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const requests = await storage.getPendingFollowRequests(req.user!.id);
      res.json(requests);
    } catch (error) {
      console.error("Error getting requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
    }
  });
  
  app.get("/api/follow-requests/outgoing", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const requests = await storage.getOutgoingFollowRequests(req.user!.id);
      res.json(requests);
    } catch (error) {
      console.error("Error getting outgoing requests:", error);
      res.status(500).json({ error: "Failed to get outgoing requests" });
    }
  });

  app.post("/api/users/requests/:id/accept", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.acceptFollowRequest(parseInt(req.params.id), req.user!.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error accepting request:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/users/requests/:id/reject", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.rejectFollowRequest(parseInt(req.params.id), req.user!.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error rejecting request:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  // Add routes matching documentation for iOS client compatibility
  app.post("/api/follow-requests/:id/accept", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.acceptFollowRequest(parseInt(req.params.id), req.user!.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error accepting request:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  // Privacy Settings endpoints
  
  // Get user's privacy settings
  app.get("/api/user/privacy-settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const privacySettings = await storage.getPrivacySettings(req.user!.id);
      res.status(200).json(privacySettings);
    } catch (error) {
      console.error("Error getting privacy settings:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  // Update user's privacy settings
  app.patch("/api/user/privacy-settings", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      // Validate and update privacy settings
      const updatedSettings = await storage.updatePrivacySettings(
        req.user!.id, 
        req.body
      );
      
      res.status(200).json(updatedSettings);
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  // Account deletion endpoint
  app.delete("/api/user/delete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      // Attempt to delete the account with password verification
      const result = await storage.deleteUserAccount(req.user!.id, password);
      
      if (result) {
        // Log the user out after account deletion
        req.logout((err) => {
          if (err) {
            console.error("Error logging out after account deletion:", err);
          }
          res.status(200).json({ message: "Account deleted successfully" });
        });
      } else {
        res.status(400).json({ error: "Failed to delete account" });
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/follow-requests/:id/reject", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.rejectFollowRequest(parseInt(req.params.id), req.user!.id);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error rejecting request:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  // iOS compatible routes with different naming conventions
  app.get("/api/privacy", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const privacySettings = await storage.getPrivacySettings(req.user!.id);
      res.status(200).json(privacySettings);
    } catch (error) {
      console.error("Error getting privacy settings:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });
  
  app.patch("/api/privacy", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const updatedSettings = await storage.updatePrivacySettings(
        req.user!.id, 
        req.body
      );
      
      res.status(200).json(updatedSettings);
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  app.post("/api/account/delete", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    
    try {
      const { password } = req.body;
      
      if (!password) {
        return res.status(400).json({ error: "Password is required" });
      }
      
      const result = await storage.deleteUserAccount(req.user!.id, password);
      
      if (result) {
        req.logout((err) => {
          if (err) {
            console.error("Error logging out after account deletion:", err);
          }
          res.status(200).json({ message: "Account deleted successfully" });
        });
      } else {
        res.status(400).json({ error: "Failed to delete account" });
      }
    } catch (error) {
      console.error("Error deleting account:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.post("/api/register", upload.single('photo'), async (req, res, next) => {
    console.log("Register attempt:", req.body.username);
    console.log("Photo file:", req.file);

    try {
      // Check for existing username
      const existingUser = await storage.getUserByUsername(req.body.username);
      if (existingUser) {
        console.log("Registration failed: Username exists");
        return res.status(400).send("Username already exists");
      }

      // Check for existing email - removed email check as per instruction.
      //const existingEmail = await storage.getUserByEmail(req.body.email);
      //if (existingEmail) {
      //  console.log("Registration failed: Email exists");
      //  return res.status(400).send("Email already exists");
      //}

      const hashedPassword = await hashPassword(req.body.password);

      // Generate photo path if file was uploaded
      let photoPath = '';
      if (req.file) {
        try {
          // Upload to Cloudinary
          const result = await uploadToCloudinary(req.file.path, {
            folder: 'dgrs48tas/users',
          });
          
          // Use the Cloudinary secure URL for the photo
          photoPath = result.secure_url;
          
          console.log(`Uploaded user photo to Cloudinary: ${photoPath}`);
        } catch (err) {
          console.error('Cloudinary upload failed during registration:', err);
          // No fallback - return error to client
          return res.status(500).json({ 
            error: "Failed to upload profile photo. Please try registration again later." 
          });
        }
      }

      const user = await storage.createUser({
        ...req.body,
        password: hashedPassword,
        photo: photoPath,
        isPrivate: true // Set default privacy to true
      });

      console.log("Registration successful:", user.username);
      req.login(user, (err) => {
        if (err) return next(err);
        
        // Return with relationship status (always false for own profile)
        res.status(201).json({
          user,
          isFollowing: false,
          isPending: false
        });
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(400).send((error as Error).message);
    }
  });

  // Update post creation to handle video files and use Cloudinary
  app.post("/api/posts", upload.array('media'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('Received post creation request:', {
        body: req.body,
        files: req.files ? (req.files as Express.Multer.File[]).length : 0
      });

      const files = req.files as Express.Multer.File[] | undefined;
      const media = [];

      if (files && files.length > 0) {
        for (const file of files) {
          console.log('Processing file:', file.originalname, 'mimetype:', file.mimetype);
          
          const fileType = file.mimetype.startsWith('video/') ? 'video' : 'image';
          
          try {
            // Upload to Cloudinary
            const result = await uploadToCloudinary(file.path, {
              folder: 'dgrs48tas/posts',
              resource_type: fileType === 'video' ? 'video' : 'image'
            });
            
            // Add the media with Cloudinary URL
            media.push({
              type: fileType,
              url: result.secure_url,
              cloudinaryId: result.public_id
            });
            
            console.log(`Uploaded media to Cloudinary: ${result.secure_url}`);
          } catch (err) {
            console.error('Cloudinary upload failed:', err);
            // No fallback - return error to client for the entire upload
            return res.status(500).json({ 
              error: "Failed to upload media. Please try creating your post again later." 
            });
          }
        }
      }

      const post = await storage.createPost(
        req.user!.id,
        req.body.content,
        media
      );

      // Log successful post creation
      console.log('Post created successfully:', post);
      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(400).send((error as Error).message);
    }
  });

  // Add new route for deleting posts
  app.delete("/api/posts/:id", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.id);
      const post = await storage.getPost(postId);

      if (!post) {
        return res.status(404).json({ error: "Post not found" });
      }

      if (post.userId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized to delete this post" });
      }

      await storage.deletePost(postId);
      res.sendStatus(200);
    } catch (error) {
      console.error("Error deleting post:", error);
      res.status(500).json({ error: "Failed to delete post" });
    }
  });

  // Support both path and query parameters for posts lookup
  app.get("/api/posts/:userId?", async (req, res) => {
    try {
      // Get userId from either path parameter or query parameter
      const userIdParam = req.params.userId || req.query.userId || '';
      
      if (!userIdParam) {
        return res.status(400).json({ error: "Missing userId parameter" });
      }
      
      const userId = parseInt(userIdParam.toString());
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId parameter" });
      }
      
      const posts = await storage.getPosts(
        userId,
        req.isAuthenticated() ? req.user!.id : undefined
      );
      
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ error: "Failed to fetch posts" });
    }
  });
  
  // Add specific route for user posts for iOS API compatibility
  app.get("/api/users/:userId/posts", async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid userId parameter" });
      }
      
      const posts = await storage.getPosts(
        userId,
        req.isAuthenticated() ? req.user!.id : undefined
      );
      
      res.json(posts);
    } catch (error) {
      console.error("Error fetching user posts:", error);
      res.status(500).json({ error: "Failed to fetch user posts" });
    }
  });

  app.get("/api/feed", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const posts = await storage.getFeed(req.user!.id);
      res.json(posts);
    } catch (error) {
      console.error("Error fetching feed:", error);
      res.status(500).json({ error: "Failed to fetch feed" });
    }
  });

  app.post("/api/posts/:postId/comments", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.postId);
      const comment = await storage.createComment(
        postId,
        req.user!.id,
        req.body.content
      );
      res.status(201).json(comment);
    } catch (error) {
      res.status(400).send((error as Error).message);
    }
  });

  app.get("/api/posts/:postId/comments", async (req, res) => {
    try {
      const postId = parseInt(req.params.postId);
      const comments = await storage.getComments(postId);
      res.json(comments);
    } catch (error) {
      res.status(400).send((error as Error).message);
    }
  });
  
  // Post Reporting Endpoints
  
  // Report a post
  app.post("/api/posts/:postId/report", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.postId);
      const userId = req.user!.id;
      const { reason } = req.body;
      
      // Check if the post ID is valid
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }
      
      // Validate report reason
      const validReasons = ["Hateful", "Harmful_or_Abusive", "Criminal_Activity", "Sexually_Explicit"];
      if (!reason || !validReasons.includes(reason)) {
        return res.status(400).json({ 
          error: "Invalid report reason", 
          message: "Reason must be one of: Hateful, Harmful_or_Abusive, Criminal_Activity, Sexually_Explicit" 
        });
      }
      
      // Check if the user has already reported this post
      const hasReported = await storage.hasUserReportedPost(postId, userId);
      if (hasReported) {
        return res.status(400).json({ error: "You have already reported this post" });
      }
      
      // Report the post
      const postRemoved = await storage.reportPost(postId, userId, reason);
      
      res.status(200).json({ 
        success: true, 
        message: "Post reported successfully",
        postRemoved: postRemoved,
        autoRemoved: postRemoved ? "Post has been automatically removed due to multiple reports" : null
      });
    } catch (error) {
      console.error("Error reporting post:", error);
      res.status(400).json({ 
        success: false,
        error: (error as Error).message 
      });
    }
  });
  
  // iOS compatible post reporting endpoint
  app.post("/api/report/post/:postId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.postId);
      const userId = req.user!.id;
      const { reason } = req.body;
      
      // Check if the post ID is valid
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }
      
      // Validate report reason
      const validReasons = ["Hateful", "Harmful_or_Abusive", "Criminal_Activity", "Sexually_Explicit"];
      if (!reason || !validReasons.includes(reason)) {
        return res.status(400).json({ 
          error: "Invalid report reason", 
          message: "Reason must be one of: Hateful, Harmful_or_Abusive, Criminal_Activity, Sexually_Explicit" 
        });
      }
      
      // Check if the user has already reported this post
      const hasReported = await storage.hasUserReportedPost(postId, userId);
      if (hasReported) {
        return res.status(400).json({ error: "You have already reported this post" });
      }
      
      // Report the post
      const postRemoved = await storage.reportPost(postId, userId, reason);
      
      res.status(200).json({ 
        success: true, 
        message: "Post reported successfully",
        postRemoved: postRemoved
      });
    } catch (error) {
      console.error("Error reporting post:", error);
      res.status(400).json({ 
        success: false,
        error: (error as Error).message 
      });
    }
  });
  
  // Admin review endpoints for content moderation
  app.post("/api/admin/review-post/:postId", isAdmin, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.postId);
      const adminId = req.user!.id;
      const { action } = req.body;
      
      // Check if the post ID is valid
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }
      
      // Validate action
      if (!action || !['approve', 'remove'].includes(action)) {
        return res.status(400).json({ 
          error: "Invalid action", 
          message: "Action must be either 'approve' or 'remove'" 
        });
      }
      
      // Process the review
      const success = await storage.reviewPost(postId, adminId, action as 'approve' | 'remove');
      
      if (success) {
        res.status(200).json({ 
          success: true, 
          message: action === 'approve' 
            ? "Post has been approved and report cleared" 
            : "Post has been removed and user violation recorded",
          action
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: "Failed to process review" 
        });
      }
    } catch (error) {
      console.error("Error reviewing post:", error);
      res.status(400).json({ 
        success: false,
        error: (error as Error).message 
      });
    }
  });
  
  // Get reported posts for admin
  app.get("/api/admin/reported-posts", isAdmin, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const adminId = req.user!.id;
      const reportedPosts = await storage.getReportedPosts(adminId);
      
      res.json(reportedPosts);
    } catch (error) {
      console.error("Error fetching reported posts:", error);
      res.status(400).json({ error: (error as Error).message });
    }
  });
  
  // iOS compatible reported posts endpoint
  app.get("/api/moderation/posts", isAdmin, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const adminId = req.user!.id;
      const reportedPosts = await storage.getReportedPosts(adminId);
      
      res.json({
        posts: reportedPosts,
        count: reportedPosts.length,
        priorityCount: reportedPosts.filter((post: any) => post.is_priority_review).length
      });
    } catch (error) {
      console.error("Error fetching reported posts:", error);
      res.status(400).json({ 
        success: false,
        error: (error as Error).message 
      });
    }
  });
  
  // iOS compatible post review endpoint
  app.post("/api/moderation/review/:postId", isAdmin, async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const postId = parseInt(req.params.postId);
      const adminId = req.user!.id;
      const { action } = req.body;
      
      // Check if the post ID is valid
      if (isNaN(postId)) {
        return res.status(400).json({ error: "Invalid post ID" });
      }
      
      // Validate action
      if (!action || !['approve', 'remove'].includes(action)) {
        return res.status(400).json({ 
          error: "Invalid action", 
          message: "Action must be either 'approve' or 'remove'" 
        });
      }
      
      // Process the review
      const success = await storage.reviewPost(postId, adminId, action as 'approve' | 'remove');
      
      if (success) {
        res.status(200).json({ 
          success: true, 
          message: action === 'approve' 
            ? "Post has been approved and reports cleared" 
            : "Post has been removed and user violation recorded",
          action
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: "Failed to process review" 
        });
      }
    } catch (error) {
      console.error("Error reviewing post:", error);
      res.status(400).json({ 
        success: false,
        error: (error as Error).message 
      });
    }
  });

  // Admin user management
  // Special bootstrap endpoint to create the first admin user
  // This endpoint requires a secret key for security
  app.post("/api/bootstrap/admin/:username", async (req, res) => {
    // Check for secret key in request body
    const { secret } = req.body;
    
    // This should match an environment variable or a predefined secure value
    // For simplicity, we're using a hardcoded secret in this example
    // In production, use process.env.ADMIN_BOOTSTRAP_SECRET
    const ADMIN_BOOTSTRAP_SECRET = "dunbar_admin_bootstrap_2025";
    
    if (secret !== ADMIN_BOOTSTRAP_SECRET) {
      return res.status(403).json({ error: "Invalid bootstrap secret" });
    }
    
    try {
      const username = req.params.username;
      
      // Find the user by username
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update the user's role to admin
      const updatedUser = await storage.updateUser(user.id, { role: "admin" });
      
      res.json({
        message: `User ${username} has been bootstrapped as the first admin`,
        user: updatedUser
      });
    } catch (error) {
      console.error("Error bootstrapping admin:", error);
      res.status(500).json({
        error: "Failed to bootstrap admin user",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.post("/api/admin/promote/:username", isAdmin, async (req, res) => {
    try {
      const username = req.params.username;
      
      // Find the user by username
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Update the user's role to admin
      const updatedUser = await storage.updateUser(user.id, { role: "admin" });
      
      res.json({
        message: `User ${username} has been promoted to admin`,
        user: updatedUser
      });
    } catch (error) {
      console.error("Error promoting user to admin:", error);
      res.status(500).json({
        error: "Failed to promote user",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // Add route for admin to delete users
  // Get all users for admin management
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Failed to get all users:", error);
      res.status(500).json({ error: "Failed to retrieve users" });
    }
  });

  app.delete("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const userId = parseInt(req.params.id);
      
      if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
      }
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Don't allow admins to delete themselves
      if (userId === req.user!.id) {
        return res.status(400).json({ error: "Cannot delete your own account" });
      }
      
      await storage.deleteUser(userId);
      
      res.json({
        message: `User with ID ${userId} has been deleted`
      });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({
        error: "Failed to delete user",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  // File verification and repair routes
  app.post("/api/admin/verify-files", isAdmin, async (req, res) => {
    try {
      // Start file verification process
      const results = await runFullVerification();
      res.json(results);
    } catch (error) {
      console.error("Error during file verification:", error);
      res.status(500).json({
        error: "File verification failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.post("/api/admin/verify-user-photos", isAdmin, async (req, res) => {
    try {
      // Verify and repair user photos only
      const results = await verifyAndRepairUserPhotos();
      res.json(results);
    } catch (error) {
      console.error("Error verifying user photos:", error);
      res.status(500).json({
        error: "User photo verification failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.post("/api/admin/verify-post-media", isAdmin, async (req, res) => {
    try {
      // Verify and repair post media only
      const results = await verifyAndRepairPostMedia();
      res.json(results);
    } catch (error) {
      console.error("Error verifying post media:", error);
      res.status(500).json({
        error: "Post media verification failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  app.get("/api/files/check", isAdmin, async (req, res) => {
    const filePath = req.query.path?.toString();
    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }
    
    try {
      const result = await checkFileExists(filePath);
      res.json(result);
    } catch (error) {
      console.error("Error checking file:", error);
      res.status(500).json({
        error: "File check failed",
        details: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Lightweight wake-up endpoint (no DB or external service checks)
  app.get("/api/wake", (req, res) => {
    res.status(200).json({
      status: "awake",
      timestamp: new Date().toISOString(),
      service: "Dunbar Social API",
      message: "Server is awake and responding"
    });
  });

  // Simple ping endpoint for iOS app health checks
  app.get("/api/ping", (req, res) => {
    res.status(200).json({ 
      status: "ok", 
      timestamp: new Date().toISOString() 
    });
  });

  // Add a health check endpoint for Cloudinary
  app.get("/api/storage/health", async (req, res) => {
    // Track components that fail to avoid cascading errors
    const status = {
      server: "healthy",
      database: "unknown",
      cloudinary: "unknown",
      storage: "unknown"
    };

    let shouldReturnEarly = false;
    
    // Phase 1: Check database connection (minimal)
    try {
      // Try to get a client but don't run any query yet
      const client = await pool.connect();
      
      try {
        // Simple database ping
        await client.query('SELECT 1');
        status.database = "healthy";
      } catch (dbQueryErr) {
        console.error('Database query error during health check:', 
                     (dbQueryErr as Error).message || 'Unknown error');
        status.database = "error";
        shouldReturnEarly = true;
      } finally {
        // Always release the client
        try {
          client.release();
        } catch (releaseErr) {
          console.error('Error releasing client during health check');
        }
      }
    } catch (dbConnErr) {
      console.error('Database connection error during health check:', 
                   (dbConnErr as Error).message || 'Unknown error');
      status.database = "error";
      shouldReturnEarly = true;
    }

    // Return early if database is down to avoid cascading errors
    if (shouldReturnEarly) {
      return res.status(200).json({  // Return 200 even on error for wake-up compatibility
        status: "partial",
        components: status,
        timestamp: new Date().toISOString(),
        message: "Health check completed with some components in error state"
      });
    }

    // Phase 2: Check Cloudinary and storage
    try {
      // Check Cloudinary (with timeout)
      const cloudinaryPromise = checkCloudinaryHealth();
      const cloudinaryTimeout = new Promise<any>((resolve) => {
        setTimeout(() => resolve({ status: 'timeout', configured: false }), 5000);
      });
      
      const cloudinaryStatus = await Promise.race([cloudinaryPromise, cloudinaryTimeout]);
      
      if (cloudinaryStatus.status === 'timeout') {
        status.cloudinary = "timeout";
      } else if (cloudinaryStatus.status === 'healthy') {
        status.cloudinary = "healthy";
      } else {
        status.cloudinary = "error";
      }

      // Check persistent directory health
      const persistentStatus = {
        dataDir: false,
        uploadsDir: false,
        tempDir: false,
        accessRights: false
      };

      try {
        // Check .data directory
        await fs.access(DATA_DIR);
        persistentStatus.dataDir = true;

        // Check uploads directory
        await fs.access(uploadsDir);
        persistentStatus.uploadsDir = true;

        // Check temp directory
        await fs.access(tempDir);
        persistentStatus.tempDir = true;

        // Check write permissions by creating a test file
        const testFile = path.join(uploadsDir, `.test-${Date.now()}.txt`);
        await fs.writeFile(testFile, 'test', { encoding: 'utf8' });
        await fs.unlink(testFile);
        persistentStatus.accessRights = true;
        
        status.storage = "healthy";
      } catch (storageErr) {
        console.error('Error checking persistent directories:', storageErr);
        status.storage = "error";
      }

      // Return full health check response
      res.status(200).json({
        status: Object.values(status).every(s => s === "healthy") ? "healthy" : "degraded",
        components: status,
        details: {
          cloudinary: cloudinaryStatus,
          persistentStorage: {
            status: Object.values(persistentStatus).every(v => v) ? 'healthy' : 'issues',
            details: persistentStatus
          }
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Health check error:', error);
      res.status(200).json({  // Return 200 even on error for wake-up compatibility
        status: "error",
        components: status,
        error: (error as Error).message,
        timestamp: new Date().toISOString()
      });
    }
  });
  
  // Admin-only endpoint to automatically fix storage issues
  app.post("/api/storage/repair", isAdmin, async (req, res) => {
    try {
      console.log("Starting storage repair process...");
      
      // Step 1: Ensure persistent directories exist
      try {
        await fs.access(DATA_DIR);
      } catch {
        await fs.mkdir(DATA_DIR, { recursive: true, mode: 0o755 });
        console.log("Created .data directory");
      }
      
      try {
        await fs.access(uploadsDir);
      } catch {
        await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
        console.log("Created uploads directory");
      }
      
      try {
        await fs.access(tempDir);
      } catch {
        await fs.mkdir(tempDir, { recursive: true, mode: 0o755 });
        console.log("Created temp directory");
      }
      
      // Step 2: Run the file verification process
      const verificationResults = await runFullVerification();

      // Step 3: Update health status
      const healthFile = path.join(DATA_DIR, 'health', 'storage_health.json');
      try {
        await fs.mkdir(path.join(DATA_DIR, 'health'), { recursive: true });
        await fs.writeFile(
          healthFile, 
          JSON.stringify({
            lastCheck: new Date().toISOString(),
            status: "healthy",
            verificationResults
          }), 
          { encoding: 'utf8' }
        );
      } catch (err) {
        console.error("Failed to write health status:", err);
      }
      
      res.json({
        status: "success",
        message: "Storage repair completed successfully",
        results: verificationResults
      });
    } catch (error) {
      console.error("Error repairing storage:", error);
      res.status(500).json({
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error" 
      });
    }
  });
  
  // Serve uploaded files ONLY from the persistent .data directory
  // This ensures consistent file access across deployments
  const persistentUploadsPath = path.join(process.cwd(), '.data', 'uploads');
  
  // Create a middleware to log file access attempts
  app.use('/uploads', (req, res, next) => {
    const requestedFile = req.path;
    console.log(`File access attempt: ${requestedFile}`);
    
    // Check if file exists in persistent storage
    const fullPath = path.join(persistentUploadsPath, requestedFile);
    fs.access(fullPath)
      .then(() => {
        console.log(`Serving file from persistent storage: ${fullPath}`);
        next();
      })
      .catch(() => {
        console.warn(`File not found in persistent storage: ${fullPath}`);
        // If we're here, we'll continue to the static middleware which will return 404
        next();
      });
  });
  
  // Only serve files from the persistent storage
  app.use('/uploads', express.static(persistentUploadsPath));

  const httpServer = createServer(app);
  return httpServer;
}