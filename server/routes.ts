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
import { db } from './db';
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

      if (req.isAuthenticated() && req.user!.id === userId) {
        const user = await storage.getFullUserData(userId);
        if (!user) return res.status(404).send("User not found");
        return res.json(user);
      }

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).send("User not found");
      return res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });

  app.get("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const user = await storage.getFullUserData(req.user!.id);
      if (!user) return res.status(404).send("User not found");
      res.json(user);
    } catch (error) {
      console.error("Error fetching current user:", error);
      res.status(500).json({ error: "Failed to fetch user data" });
    }
  });


  app.patch("/api/user/profile", upload.single('photo'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const updateData: Record<string, any> = {};

      // Handle text fields
      ['name', 'bio'].forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field].trim();
        }
      });

      // Handle photo upload - strict Cloudinary-only approach
      if (req.file) {
        try {
          // Upload to Cloudinary
          const result = await uploadToCloudinary(req.file.path, {
            folder: 'dgrs48tas/users',
          });
          
          // Use the Cloudinary secure URL for the photo
          updateData.photo = result.secure_url;
          
          console.log(`Uploaded user photo to Cloudinary: ${result.secure_url}`);
        } catch (err) {
          console.error('Cloudinary upload failed:', err);
          // No fallback - return error to client
          return res.status(500).json({ 
            error: "Failed to upload profile photo. Please try again later." 
          });
        }
      }

      // Check if there are any changes to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No changes detected" });
      }

      const updatedUser = await storage.updateUser(req.user!.id, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(400).json({ message: error instanceof Error ? error.message : "Failed to update profile" });
    }
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
        res.status(201).json(user);
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

  app.get("/api/posts/:userId", async (req, res) => {
    try {
      const posts = await storage.getPosts(
        parseInt(req.params.userId),
        req.isAuthenticated() ? req.user!.id : undefined
      );
      res.json(posts);
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ error: "Failed to fetch posts" });
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

  // Add a health check endpoint for Cloudinary
  app.get("/api/storage/health", async (req, res) => {
    try {
      const cloudinaryStatus = await checkCloudinaryHealth();

      // Also check persistent directory health
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
      } catch (err) {
        console.error('Error checking persistent directories:', err);
      }

      res.json({
        ...cloudinaryStatus,
        persistentStorage: {
          status: Object.values(persistentStatus).every(v => v) ? 'healthy' : 'issues',
          details: persistentStatus
        }
      });
    } catch (error) {
      console.error("Error checking Cloudinary health:", error);
      res.status(500).json({
        configured: false,
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : "Unknown error"
        }
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