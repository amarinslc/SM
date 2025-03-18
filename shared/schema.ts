import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(), // Added unique constraint
  password: text("password").notNull(),
  name: text("name").notNull(),
  bio: text("bio"),
  photo: text("photo").default(""), // Added default value
  followerCount: integer("follower_count").default(0),
  followingCount: integer("following_count").default(0),
});

export const follows = pgTable("follows", {
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  media: jsonb("media").default([]),
  createdAt: timestamp("created_at").defaultNow(),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    email: true,
    password: true,
    name: true,
    bio: true,
    photo:true,
  })
  .extend({
    email: z.string().email("Invalid email address"),
  });

export const insertPostSchema = createInsertSchema(posts).pick({
  content: true,
  media: true,
});

export const insertCommentSchema = createInsertSchema(comments).pick({
  content: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;