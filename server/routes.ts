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

// Ensure uploads directory exists with proper permissions
const uploadsDir = path.join(process.cwd(), 'uploads');
try {
  await fs.access(uploadsDir);
} catch {
  await fs.mkdir(uploadsDir, { recursive: true, mode: 0o755 });
}

// Configure multer with improved error handling
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
      const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
  }),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
      return cb(new Error('Only image files are allowed!'));
    }
    cb(null, true);
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Add new profile update endpoint
  app.patch("/api/user/profile", upload.single('photo'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      console.log('Profile update request body:', req.body);
      console.log('Profile photo:', req.file);

      // Only allow updating specific fields
      const allowedFields = ['email', 'name', 'bio', 'photo', 'isPrivate'];
      const updateData = Object.fromEntries(
        Object.entries(req.body)
          .filter(([key]) => allowedFields.includes(key))
          .filter(([_, value]) => value !== undefined)
      );

      // Handle photo upload
      if (req.file) {
        updateData.photo = `/uploads/${req.file.filename}`;
      }

      // Convert isPrivate to boolean if present
      if ('isPrivate' in updateData) {
        updateData.isPrivate = updateData.isPrivate === 'true';
      }

      console.log('Filtered update data:', updateData);

      if (Object.keys(updateData).length === 0 && !req.file) {
        return res.status(400).send("No valid data provided for update");
      }

      const updatedUser = await storage.updateUser(req.user!.id, updateData);
      console.log('Profile updated successfully:', updatedUser);

      res.json(updatedUser);
    } catch (error) {
      console.error('Profile update error:', error);
      res.status(400).send((error as Error).message);
    }
  });

  // Search endpoint should be before dynamic routes to avoid conflicts
  app.get("/api/users/search", async (req, res) => {
    const query = req.query.q?.toString() || "";
    console.log(`Search query received: "${query}"`);
    if (!query) {
      console.log("Empty query, returning empty results");
      return res.json([]);
    }

    try {
      const users = await storage.searchUsers(query);
      console.log(`Found ${users.length} users matching query "${query}"`);
      console.log("Search results:", users.map(u => u.username));
      res.json(users);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.get("/api/users/:id", async (req, res) => {
    const user = await storage.getUser(parseInt(req.params.id));
    if (!user) return res.status(404).send("User not found");

    // If the user is private and the requester is not authenticated,
    // only return basic public information
    if (user.isPrivate && !req.isAuthenticated()) {
      const { password, email, ...publicInfo } = user;
      return res.json(publicInfo);
    }

    // If authenticated, check if the requester is an approved follower
    if (user.isPrivate && req.isAuthenticated() && req.user!.id !== user.id) {
      const [isFollower] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, req.user!.id),
            eq(follows.followingId, user.id),
            eq(follows.isPending, false)
          )
        );

      if (!isFollower) {
        const { password, email, ...publicInfo } = user;
        return res.json(publicInfo);
      }
    }

    const { password, ...userInfo } = user;
    res.json(userInfo);
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

  app.get("/api/users/:id/followers", async (req, res) => {
    const followers = await storage.getFollowers(parseInt(req.params.id));
    res.json(followers);
  });

  app.get("/api/users/:id/following", async (req, res) => {
    const following = await storage.getFollowing(parseInt(req.params.id));
    res.json(following);
  });

  app.get("/api/users/:id/requests", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const requests = await storage.getPendingFollowRequests(parseInt(req.params.id));
      res.json(requests);
    } catch (error) {
      console.error("Error getting requests:", error);
      res.status(500).json({ error: "Failed to get requests" });
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

      // Check for existing email
      const existingEmail = await storage.getUserByEmail(req.body.email);
      if (existingEmail) {
        console.log("Registration failed: Email exists");
        return res.status(400).send("Email already exists");
      }

      const hashedPassword = await hashPassword(req.body.password);

      // Generate photo path if file was uploaded
      let photoPath = '';
      if (req.file) {
        photoPath = `/uploads/${req.file.filename}`;
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
          console.log('Processing file:', file.originalname);
          const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
          const filePath = path.join('uploads', filename);

          await fs.writeFile(path.join(process.cwd(), filePath), file.buffer);
          media.push({
            type: 'image',
            url: `/uploads/${filename}`
          });
        }
      }

      const post = await storage.createPost(
        req.user!.id,
        req.body.content,
        media
      );

      console.log('Post created successfully:', post);
      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(400).send((error as Error).message);
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

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}