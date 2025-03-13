import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertPostSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  setupAuth(app);

  // Search endpoint should be before dynamic routes to avoid conflicts
  app.get("/api/users/search", async (req, res) => {
    const query = req.query.q?.toString() || "";
    console.log(`Search query received: "${query}"`); // Add logging
    if (!query) {
      console.log("Empty query, returning empty results");
      return res.json([]);
    }

    const users = await storage.searchUsers(query);
    console.log(`Found ${users.length} users matching query "${query}"`);
    res.json(users);
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

  app.post("/api/posts", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const result = insertPostSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json(result.error);
    }
    const post = await storage.createPost(
      req.user!.id,
      result.data.content,
      result.data.media,
    );
    res.status(201).json(post);
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

  const httpServer = createServer(app);
  return httpServer;
}