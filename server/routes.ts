import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertPostSchema } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import express from 'express';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(null, false);
    }
  }
});

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Ensure uploads directory exists
  const uploadsDir = path.join(process.cwd(), 'uploads');
  try {
    await fs.access(uploadsDir);
  } catch {
    await fs.mkdir(uploadsDir, { recursive: true });
  }

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
    res.json(user);
  });

  app.post("/api/users/:id/follow", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.followUser(req.user!.id, parseInt(req.params.id));
      res.sendStatus(200);
    } catch (error) {
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

  app.post("/api/posts", upload.array('media'), async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const files = req.files as Express.Multer.File[] | undefined;
      const media = [];

      if (files && files.length > 0) {
        for (const file of files) {
          const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
          const filePath = path.join('uploads', filename);

          await fs.writeFile(filePath, file.buffer);
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

      res.status(201).json(post);
    } catch (error) {
      console.error('Error creating post:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  app.get("/api/posts/:userId", async (req, res) => {
    const posts = await storage.getPosts(parseInt(req.params.userId));
    res.json(posts);
  });

  app.get("/api/feed", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const posts = await storage.getFeed(req.user!.id);
    res.json(posts);
  });

  // Serve uploaded files
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

  const httpServer = createServer(app);
  return httpServer;
}