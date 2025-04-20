import { pgTable, text, serial, integer, boolean, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  bio: text("bio"),
  photo: text("photo").default(""),
  phoneNumber: text("phone_number").unique(), // Added phone number field with index for contact search
  followerCount: integer("follower_count").default(0),
  followingCount: integer("following_count").default(0),
  isPrivate: boolean("is_private").default(true),
  emailVerified: boolean("email_verified").default(false),
  verificationToken: text("verification_token"),
  resetPasswordToken: text("reset_password_token"),
  resetPasswordExpires: timestamp("reset_password_expires"),
  role: text("role").default("user"), // Available roles: "user", "admin"
  removedPostCount: integer("removed_post_count").default(0), // Track number of posts removed for violations
  privacySettings: jsonb("privacy_settings").default({
    showEmail: false,
    showPhoneNumber: false, // Added privacy setting for phone number
    allowTagging: true,
    allowDirectMessages: true,
    activityVisibility: "followers", // public, followers, none
    notificationPreferences: {
      likes: true,
      comments: true,
      follows: true,
      messages: true
    }
  }),
});

export const follows = pgTable("follows", {
  followerId: integer("follower_id").notNull(),
  followingId: integer("following_id").notNull(),
  isPending: boolean("is_pending").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  media: jsonb("media").default([]),
  createdAt: timestamp("created_at").defaultNow(),
  reportCount: integer("report_count").default(0),
  isRemoved: boolean("is_removed").default(false),
  isPriorityReview: boolean("is_priority_review").default(false),
});

export const comments = pgTable("comments", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const postReports = pgTable("post_reports", {
  postId: integer("post_id").notNull(),
  userId: integer("user_id").notNull(),
  reason: text("reason").notNull(),
  status: text("status").default("pending").notNull(), // 'pending', 'reviewed_ok', 'removed'
  reviewedBy: integer("reviewed_by"), // admin user ID who reviewed the post
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => {
  return {
    // Each user can only report a post once
    pk: primaryKey({ columns: [table.postId, table.userId] })
  };
});

export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  name: z.string().min(1, "Name is required"),
  bio: z.string().optional(),
  photo: z.any().optional(),
  phoneNumber: z.string().optional(),
  isPrivate: z.boolean().default(true),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Privacy settings schema for validation
// Report reason schema with strict validation
export const reportReasonEnum = z.enum([
  "Hateful",
  "Harmful_or_Abusive",
  "Criminal_Activity",
  "Sexually_Explicit"
]);

export type ReportReason = z.infer<typeof reportReasonEnum>;

export const reportSchema = z.object({
  postId: z.number(),
  reason: reportReasonEnum
});

export const privacySettingsSchema = z.object({
  showEmail: z.boolean().default(false),
  showPhoneNumber: z.boolean().default(false),
  allowTagging: z.boolean().default(true),
  allowDirectMessages: z.boolean().default(true),
  activityVisibility: z.enum(["public", "followers", "none"]).default("followers"),
  notificationPreferences: z.object({
    likes: z.boolean().default(true),
    comments: z.boolean().default(true),
    follows: z.boolean().default(true),
    messages: z.boolean().default(true)
  }).default({
    likes: true,
    comments: true,
    follows: true,
    messages: true
  })
}).default({
  showEmail: false,
  showPhoneNumber: false,
  allowTagging: true,
  allowDirectMessages: true,
  activityVisibility: "followers",
  notificationPreferences: {
    likes: true,
    comments: true,
    follows: true,
    messages: true
  }
});

// Schema for contact search (used by iOS client)
export const contactSearchSchema = z.object({
  phoneNumbers: z.array(z.string()).optional(),
  emails: z.array(z.string()).optional()
});

// Schema for simplified user data returned to clients
export const simpleUserSchema = z.object({
  id: z.number(),
  username: z.string(),
  name: z.string(),
  photo: z.string().optional(),
  isFollowing: z.boolean().optional(),
  isPending: z.boolean().optional()
});

export type ContactSearch = z.infer<typeof contactSearchSchema>;
export type SimpleUser = z.infer<typeof simpleUserSchema>;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type PostReport = typeof postReports.$inferSelect;
export type PrivacySettings = z.infer<typeof privacySettingsSchema>;