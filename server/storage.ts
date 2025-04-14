import session from "express-session";
import { users, type User, type InsertUser, Post, Comment, comments, follows, posts, postReports, PrivacySettings, privacySettingsSchema, PostReport } from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, or, sql, gt, desc } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { promisify } from 'util';
import { comparePasswords } from "./auth";

/**
 * Sanitize user data by removing sensitive fields before sending to client
 * @param user User object from database
 * @returns Sanitized user object without sensitive information
 */
// The SanitizedUser type should remove sensitive fields but keep all other user properties
export type SanitizedUser = Omit<User, 'password' | 'verificationToken' | 'resetPasswordToken' | 'resetPasswordExpires'>;

export function sanitizeUser(user: User): SanitizedUser;
export function sanitizeUser(user: undefined): undefined;
export function sanitizeUser(user: User | undefined): SanitizedUser | undefined {
  if (!user) return undefined;
  
  // Create a new object with just the fields we want to return
  // This ensures that even if the type definition changes, we only return safe fields
  const sanitizedUser: SanitizedUser = {
    id: user.id,
    username: user.username,
    email: user.email,
    name: user.name,
    bio: user.bio,
    photo: user.photo,
    followerCount: user.followerCount,
    followingCount: user.followingCount,
    isPrivate: user.isPrivate,
    emailVerified: user.emailVerified,
    role: user.role,
    privacySettings: user.privacySettings || privacySettingsSchema.parse({})
  };
  
  return sanitizedUser;
}

/**
 * Sanitize an array of user objects
 * @param users Array of user objects
 * @returns Array of sanitized user objects
 */
export function sanitizeUsers(users: User[]): SanitizedUser[] {
  return users.map(user => sanitizeUser(user));
}

const resend = new Resend(process.env.RESEND_API_KEY);
const randomBytesAsync = promisify(randomBytes);

const PostgresSessionStore = connectPg(session);

// Define a user profile with relationship data
export interface UserProfileWithRelationship {
  user: SanitizedUser;
  isFollowing: boolean;
  isPending: boolean;
}

export interface IStorage {
  // Methods that need full user data for internal operations
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Methods that return sanitized user data to clients
  updateUser(id: number, data: Partial<Omit<User, 'id' | 'username'>>): Promise<SanitizedUser>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  removeFollower(userId: number, followerId: number): Promise<void>;
  getFollowers(userId: number): Promise<SanitizedUser[]>;
  getFollowing(userId: number): Promise<SanitizedUser[]>;
  
  // Post and comment operations
  createPost(userId: number, content: string, media: any[]): Promise<Post>;
  getPosts(userId: number, viewerId?: number): Promise<Post[]>;
  getFeed(userId: number): Promise<Post[]>;
  createComment(postId: number, userId: number, content: string): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  getPost(id: number): Promise<Post | undefined>;
  deletePost(id: number): Promise<void>;
  
  // Post reporting operations
  reportPost(postId: number, userId: number, reason?: string): Promise<boolean>;
  hasUserReportedPost(postId: number, userId: number): Promise<boolean>;
  getReportedPosts(adminId: number): Promise<Post[]>;
  
  // Follow request operations
  getPendingFollowRequests(userId: number): Promise<any[]>;
  getOutgoingFollowRequests(userId: number): Promise<any[]>;
  acceptFollowRequest(followerId: number, followingId: number): Promise<void>;
  rejectFollowRequest(followerId: number, followingId: number): Promise<void>;
  
  // Email and account operations
  verifyEmail(token: string): Promise<boolean>;
  sendVerificationEmail(userId: number, email: string): Promise<void>;
  isEmailVerified(userId: number): Promise<boolean>;
  sendPasswordResetEmail(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  
  // Privacy and account management
  getPrivacySettings(userId: number): Promise<PrivacySettings>;
  updatePrivacySettings(userId: number, settings: PrivacySettings): Promise<PrivacySettings>;
  deleteUserAccount(userId: number, password: string): Promise<boolean>;
  
  // Special operations
  getFullUserData(id: number): Promise<Omit<User, 'password' | 'verificationToken' | 'resetPasswordToken' | 'resetPasswordExpires'> | undefined>;
  searchUsers(query: string): Promise<SanitizedUser[]>;
  deleteUser(id: number): Promise<void>;
  getUserProfile(userId: number, viewerId?: number): Promise<UserProfileWithRelationship | undefined>;
  
  // Relationship checks
  isFollowing(followerId: number, followingId: number): Promise<boolean>;
  hasFollowRequest(followerId: number, followingId: number): Promise<boolean>;
  
  // Session management
  sessionStore: session.Store;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: false, // Don't try to create the table as it already exists
      tableName: 'session', // Default table name used by connect-pg-simple
      // Connection handling settings
      pruneSessionInterval: 60, // How frequently to delete expired sessions (in seconds)
      // Error handling - don't crash on session store errors
      errorLog: (err) => console.error('Session store error:', err),
    });
  }
  
  // Get user privacy settings
  async getPrivacySettings(userId: number): Promise<PrivacySettings> {
    const [user] = await db
      .select({ privacySettings: users.privacySettings })
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Set default privacy settings if not set
    if (!user.privacySettings) {
      const defaultSettings = privacySettingsSchema.parse({});
      return defaultSettings;
    }
    
    // Validate and return the privacy settings
    return privacySettingsSchema.parse(user.privacySettings);
  }
  
  // Update user privacy settings
  async updatePrivacySettings(userId: number, settings: PrivacySettings): Promise<PrivacySettings> {
    // Validate settings with Zod schema
    const validatedSettings = privacySettingsSchema.parse(settings);
    
    // Update the user's privacy settings
    const [updatedUser] = await db
      .update(users)
      .set({ privacySettings: validatedSettings })
      .where(eq(users.id, userId))
      .returning({ privacySettings: users.privacySettings });
    
    if (!updatedUser) {
      throw new Error("User not found");
    }
    
    return validatedSettings;
  }
  
  // Delete user account with password verification
  async deleteUserAccount(userId: number, password: string): Promise<boolean> {
    // Get user with password for verification
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) {
      throw new Error("User not found");
    }
    
    // Verify password
    const passwordMatch = await comparePasswords(password, user.password);
    if (!passwordMatch) {
      throw new Error("Invalid password");
    }
    
    // Prevent deleting admin users without special consideration
    if (user.role === 'admin') {
      throw new Error("Cannot delete admin account through this endpoint");
    }
    
    // Delegate to the existing deleteUser method
    await this.deleteUser(userId);
    
    return true;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    
    if (!user) return undefined;
    
    // For now, return the complete user object
    // Sanitization should be done at the API response level
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, username));
    return user; // Keep all fields for auth purposes
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    // Check for existing username
    const existingUsername = await this.getUserByUsername(user.username);
    if (existingUsername) {
      throw new Error("Username already exists");
    }

    // Check for existing email
    const existingEmail = await this.getUserByEmail(user.email);
    if (existingEmail) {
      throw new Error("Email already exists");
    }

    const [newUser] = await db.insert(users).values(user).returning();
    return newUser;
  }

  async followUser(followerId: number, followingId: number): Promise<void> {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if the target user exists
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, followingId));

    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Check if already following or has pending request
    const [existing] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );

    if (existing) {
      throw new Error("Already following or requested to follow this user");
    }

    // Get follower user and check limits
    const [follower] = await db
      .select()
      .from(users)
      .where(eq(users.id, followerId));

    if (!follower) {
      throw new Error("Follower user not found");
    }

    if ((follower.followingCount ?? 0) >= 150) {
      throw new Error("You have reached the maximum number of follows (150)");
    }

    // Create follow relationship with pending status if account is private
    await db.insert(follows).values({
      followerId,
      followingId,
      isPending: targetUser.isPrivate,
    });
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    // Check if the relationship exists first
    const [existing] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );

    if (!existing) {
      throw new Error("Not following this user");
    }

    await db.transaction(async (tx) => {
      // Remove follow relationship
      await tx
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, followingId)
          )
        );

      // Update follower count using SQL expression
      await tx
        .update(users)
        .set({
          followingCount: sql`GREATEST(${users.followingCount} - 1, 0)`
        })
        .where(eq(users.id, followerId));

      // Update following count
      await tx
        .update(users)
        .set({
          followerCount: sql`GREATEST(${users.followerCount} - 1, 0)`
        })
        .where(eq(users.id, followingId));
    });
  }
  
  async removeFollower(userId: number, followerId: number): Promise<void> {
    // Check if the relationship exists first (follower follows this user)
    const [existing] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, userId),
          eq(follows.isPending, false) // Only remove confirmed followers
        )
      );

    if (!existing) {
      throw new Error("This user is not your follower");
    }

    await db.transaction(async (tx) => {
      // Remove follow relationship
      await tx
        .delete(follows)
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, userId)
          )
        );

      // Update follower count for the user removing the follower
      await tx
        .update(users)
        .set({
          followerCount: sql`GREATEST(${users.followerCount} - 1, 0)`
        })
        .where(eq(users.id, userId));

      // Update following count for the removed follower
      await tx
        .update(users)
        .set({
          followingCount: sql`GREATEST(${users.followingCount} - 1, 0)`
        })
        .where(eq(users.id, followerId));
    });
  }

  async getFollowers(userId: number): Promise<SanitizedUser[]> {
    const followData = await db
      .select({
        follower: users,
      })
      .from(follows)
      .where(
        and(
          eq(follows.followingId, userId),
          eq(follows.isPending, false)
        )
      )
      .innerJoin(users, eq(users.id, follows.followerId));

    // Sanitize follower data before returning
    return sanitizeUsers(followData.map((d) => d.follower));
  }

  async getFollowing(userId: number): Promise<SanitizedUser[]> {
    const followData = await db
      .select({
        following: users,
      })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.isPending, false)
        )
      )
      .innerJoin(users, eq(users.id, follows.followingId));

    // Sanitize following data before returning
    return sanitizeUsers(followData.map((d) => d.following));
  }

  async createPost(userId: number, content: string, media: any[]): Promise<Post> {
    const [post] = await db
      .insert(posts)
      .values({
        userId,
        content,
        media,
      })
      .returning();
    return post;
  }

  async getPosts(userId: number, viewerId?: number): Promise<Post[]> {
    // If no viewer ID is provided, return no posts (must be authenticated)
    if (!viewerId) {
      return [];
    }

    // If viewing own posts, return all posts
    if (viewerId === userId) {
      return db
        .select()
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(sql`${posts.createdAt} DESC`);
    }

    // Check if viewer is an approved follower
    const [isApprovedFollower] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, viewerId),
          eq(follows.followingId, userId),
          eq(follows.isPending, false)
        )
      );

    // If not an approved follower, return no posts
    if (!isApprovedFollower) {
      return [];
    }

    // Return posts if viewer is an approved follower
    return db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(sql`${posts.createdAt} DESC`);
  }

  async getFeed(userId: number): Promise<Post[]> {
    // Get list of users that the current user is actively following (not pending)
    const following = await db
      .select({
        followingId: follows.followingId,
      })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.isPending, false)
        )
      );

    // Get all following IDs plus the user's own ID
    const followingIds = [...following.map((f) => f.followingId), userId];

    // Get posts from followed users and own posts
    return db
      .select()
      .from(posts)
      .where(inArray(posts.userId, followingIds))
      .orderBy(sql`${posts.createdAt} DESC`);
  }

  async createComment(postId: number, userId: number, content: string): Promise<Comment> {
    // Check if user can comment (follows the post author or is the author)
    const post = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!post.length) throw new Error("Post not found");

    const canComment = post[0].userId === userId || await this.isFollowing(userId, post[0].userId);
    if (!canComment) {
      throw new Error("You can only comment on your own posts or posts from users you follow");
    }

    const [comment] = await db
      .insert(comments)
      .values({
        postId,
        userId,
        content,
      })
      .returning();
    return comment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    return db
      .select()
      .from(comments)
      .where(eq(comments.postId, postId))
      .orderBy(comments.createdAt);
  }

  async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
          eq(follows.isPending, false)
        )
      );
    return !!follow;
  }
  
  async hasFollowRequest(followerId: number, followingId: number): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
          eq(follows.isPending, true)
        )
      );
    return !!follow;
  }
  
  async getUserProfile(userId: number, viewerId?: number): Promise<UserProfileWithRelationship | undefined> {
    // Get the base user data
    const user = await this.getUser(userId);
    if (!user) return undefined;
    
    // Always sanitize the user data to remove sensitive information
    const sanitizedUser = sanitizeUser(user);
    
    if (!viewerId) {
      // Return profile without relationship data for unauthenticated users
      return {
        user: sanitizedUser,
        isFollowing: false,
        isPending: false
      };
    }
    
    // If it's the same user, they're not following themselves
    if (userId === viewerId) {
      return {
        user: sanitizedUser,
        isFollowing: false,
        isPending: false
      };
    }
    
    // Check if the viewer is following the user
    const isFollowing = await this.isFollowing(viewerId, userId);
    
    // Check if the viewer has a pending follow request to the user
    const isPending = await this.hasFollowRequest(viewerId, userId);
    
    return {
      user: sanitizedUser,
      isFollowing,
      isPending
    };
  }

  async updateUser(id: number, data: Partial<Omit<User, 'id' | 'username'>>): Promise<SanitizedUser> {
    console.log('Storage: updateUser called with data:', data);

    // Ensure we have data to update
    if (!data || Object.keys(data).length === 0) {
      throw new Error('No data provided for update');
    }

    // Remove any undefined values
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    console.log('Storage: Filtered update data:', updateData);

    // Perform the update
    const [updatedUser] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    if (!updatedUser) {
      throw new Error('User not found');
    }

    // IMPORTANT: Sanitize user data before returning it
    const sanitizedUser = sanitizeUser(updatedUser);
    
    if (!sanitizedUser) {
      throw new Error('Failed to sanitize updated user data');
    }
    
    return sanitizedUser;
  }
  async getPendingFollowRequests(userId: number): Promise<any[]> {
    const requests = await db
      .select({
        id: follows.followerId,
        follower: users,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .where(
        and(
          eq(follows.followingId, userId),
          eq(follows.isPending, true)
        )
      )
      .innerJoin(users, eq(users.id, follows.followerId));

    // Sanitize user data in the requests
    return requests.map(request => ({
      ...request,
      follower: sanitizeUser(request.follower)
    }));
  }
  
  async getOutgoingFollowRequests(userId: number): Promise<any[]> {
    const requests = await db
      .select({
        id: follows.followingId,
        following: users,
        createdAt: follows.createdAt,
      })
      .from(follows)
      .where(
        and(
          eq(follows.followerId, userId),
          eq(follows.isPending, true)
        )
      )
      .innerJoin(users, eq(users.id, follows.followingId));

    // Sanitize user data in the requests
    return requests.map(request => ({
      ...request,
      following: sanitizeUser(request.following)
    }));
  }

  async acceptFollowRequest(followerId: number, followingId: number): Promise<void> {
    await db.transaction(async (tx) => {
      // Get the follow request
      const [followRequest] = await tx
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, followingId),
            eq(follows.isPending, true)
          )
        );

      if (!followRequest) {
        throw new Error("Follow request not found");
      }

      // Update the follow status to approved
      await tx
        .update(follows)
        .set({ isPending: false })
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, followingId)
          )
        );

      // Update follower counts
      await tx
        .update(users)
        .set({ followingCount: sql`${users.followingCount} + 1` })
        .where(eq(users.id, followerId));

      await tx
        .update(users)
        .set({ followerCount: sql`${users.followerCount} + 1` })
        .where(eq(users.id, followingId));
    });
  }

  async rejectFollowRequest(followerId: number, followingId: number): Promise<void> {
    // Simply delete the follow request
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId),
          eq(follows.isPending, true)
        )
      );
  }

  async getPost(id: number): Promise<Post | undefined> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts.id, id));
    return post;
  }

  async deletePost(id: number): Promise<void> {
    await db.transaction(async (tx) => {
      // First delete all comments for this post
      await tx.delete(comments).where(eq(comments.postId, id));
      
      // Delete any reports for this post
      await tx.delete(postReports).where(eq(postReports.postId, id));
      
      // Then delete the post itself
      await tx.delete(posts).where(eq(posts.id, id));
    });
  }
  
  // Report a post - returns true if post was auto-removed (3+ reports)
  async reportPost(postId: number, userId: number, reason: string): Promise<boolean> {
    // Validate that the reason is one of our allowed reasons
    const validReasons = ["Hateful", "Harmful_or_Abusive", "Criminal_Activity", "Sexually_Explicit"];
    if (!validReasons.includes(reason)) {
      throw new Error("Invalid report reason. Must be one of: Hateful, Harmful_or_Abusive, Criminal_Activity, Sexually_Explicit");
    }

    // Check if post exists
    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) {
      throw new Error("Post not found");
    }
    
    // Check if user has already reported this post
    const hasReported = await this.hasUserReportedPost(postId, userId);
    if (hasReported) {
      throw new Error("You have already reported this post");
    }
    
    // Create the report and update report count atomically
    let postRemoved = false;
    await db.transaction(async (tx) => {
      // Create the report
      await tx.insert(postReports).values({
        postId,
        userId,
        reason,
        status: 'pending'
      });
      
      // Increment the report count
      const [updatedPost] = await tx
        .update(posts)
        .set({
          reportCount: sql`${posts.reportCount} + 1`
        })
        .where(eq(posts.id, postId))
        .returning();
      
      // Check if post should be auto-removed (3+ reports)
      const reportCount = updatedPost.reportCount || 0;
      if (reportCount >= 3) {
        await tx
          .update(posts)
          .set({ 
            isRemoved: true,
            isPriorityReview: true // Mark for priority review
          })
          .where(eq(posts.id, postId));
        
        postRemoved = true;
        
        // Increment the user's removed post count
        await this.incrementUserRemovedPostCount(tx, post.userId);
      }
    });
    
    return postRemoved;
  }
  
  // Helper method to increment a user's removed post count
  // If count reaches 5, delete the account
  async incrementUserRemovedPostCount(tx: any, userId: number): Promise<void> {
    try {
      // Get current count
      const [user] = await tx
        .select({ removedPostCount: users.removedPostCount })
        .from(users)
        .where(eq(users.id, userId));
      
      if (!user) return;
      
      const newCount = (user.removedPostCount || 0) + 1;
      
      // Update the count
      await tx
        .update(users)
        .set({ removedPostCount: newCount })
        .where(eq(users.id, userId));
      
      // If user has had 5 or more posts removed, delete their account
      // unless they are an admin
      if (newCount >= 5) {
        const [userToDelete] = await tx
          .select({ role: users.role })
          .from(users)
          .where(eq(users.id, userId));
          
        if (userToDelete && userToDelete.role !== 'admin') {
          // Mark for deletion after transaction completes
          setTimeout(() => this.deleteUser(userId), 100);
        }
      }
    } catch (err) {
      console.error("Error incrementing user removed post count:", err);
    }
  }
  
  // Check if a user has already reported a post
  async hasUserReportedPost(postId: number, userId: number): Promise<boolean> {
    const [report] = await db
      .select()
      .from(postReports)
      .where(
        and(
          eq(postReports.postId, postId),
          eq(postReports.userId, userId)
        )
      );
    
    return !!report;
  }
  
  // Get all reported posts for admin review
  async getReportedPosts(adminId: number): Promise<Post[]> {
    // Check if user is an admin
    const [admin] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.id, adminId),
          eq(users.role, "admin")
        )
      );
    
    if (!admin) {
      throw new Error("Unauthorized: Only admins can access reported posts");
    }
    
    // Get posts with at least one report, ordered by report count descending
    return db
      .select()
      .from(posts)
      .where(gt(posts.reportCount, 0))
      .orderBy(desc(posts.reportCount));
  }

  async verifyEmail(token: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.verificationToken, token));

    if (!user) {
      return false;
    }

    await db
      .update(users)
      .set({
        emailVerified: true,
        verificationToken: null,
      })
      .where(eq(users.id, user.id));

    return true;
  }

  async sendVerificationEmail(userId: number, email: string): Promise<void> {
    try {
      console.log(`Starting verification email process for user ${userId} (${email})`);
      const token = (await randomBytesAsync(32)).toString('hex');

      await db
        .update(users)
        .set({ verificationToken: token })
        .where(eq(users.id, userId));

      const verificationLink = `${process.env.APP_URL || 'http://localhost:5000'}/verify-email?token=${token}`;
      console.log(`Generated verification link: ${verificationLink}`);

      const emailResponse = await resend.emails.send({
        from: 'Dunbar <verify@example.com>', // Generic "from" address
        to: email,
        subject: 'Verify your email address',
        html: `
          <h1>Welcome to Dunbar!</h1>
          <p>Please verify your email address by clicking the link below:</p>
          <a href="${verificationLink}">Verify Email</a>
          <p>This link will expire in 24 hours.</p>
        `
      });

      console.log('Resend API Response:', emailResponse);
    } catch (error) {
      console.error('Detailed error in sendVerificationEmail:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to send verification email. Please try again later.');
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      console.log(`Starting password reset email process for ${email}`);
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email));

      if (!user) {
        console.log(`No user found with email ${email}`);
        return;
      }

      const token = (await randomBytesAsync(32)).toString('hex');
      const expires = new Date();
      expires.setHours(expires.getHours() + 1);

      await db
        .update(users)
        .set({
          resetPasswordToken: token,
          resetPasswordExpires: expires,
        })
        .where(eq(users.id, user.id));

      const resetLink = `${process.env.APP_URL || 'http://localhost:5000'}/reset-password?token=${token}`;
      console.log(`Generated reset link: ${resetLink}`);

      const emailResponse = await resend.emails.send({
        from: 'Dunbar <noreply@dgrs48tas.social>',
        to: email,
        subject: 'Reset your password',
        html: `
          <h1>Password Reset Request</h1>
          <p>You requested to reset your password. Click the link below to proceed:</p>
          <a href="${resetLink}">Reset Password</a>
          <p>This link will expire in 1 hour.</p>
          <p>If you didn't request this, please ignore this email.</p>
        `
      });

      console.log('Resend API Response:', emailResponse);
    } catch (error) {
      console.error('Detailed error in sendPasswordResetEmail:', error);
      if (error instanceof Error) {
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }
      throw new Error('Failed to send password reset email. Please try again later.');
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.resetPasswordToken, token),
          sql`${users.resetPasswordExpires} > NOW()`
        )
      );

    if (!user) {
      return false;
    }

    await db
      .update(users)
      .set({
        password: newPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      })
      .where(eq(users.id, user.id));

    return true;
  }

  async isEmailVerified(userId: number): Promise<boolean> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    return user?.emailVerified ?? false;
  }

  async getFullUserData(id: number): Promise<Omit<User, 'password' | 'verificationToken' | 'resetPasswordToken' | 'resetPasswordExpires'> | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    // Remove only security-sensitive fields, keep profile data including email
    const { password, verificationToken, resetPasswordToken, resetPasswordExpires, ...fullUser } = user;
    return fullUser;
  }

  async searchUsers(query: string): Promise<SanitizedUser[]> {
    try {
      // Normalize the search query
      const normalizedQuery = query.toLowerCase().trim();

      if (!normalizedQuery) {
        return [];
      }

      const searchResults = await db
        .select()
        .from(users)
        .where(
          and(
            or(
              sql`LOWER(${users.username}) LIKE ${`%${normalizedQuery}%`}`,
              sql`LOWER(${users.name}) LIKE ${`%${normalizedQuery}%`}`
            ),
            // Exclude admin users from search results
            sql`(${users.role} IS NULL OR ${users.role} != 'admin')`
          )
        )
        .orderBy(users.username)
        .limit(20);

      // Use sanitizeUsers helper function to remove sensitive fields and ensure defaults
      const sanitizedResults = sanitizeUsers(searchResults);
      
      return sanitizedResults.map(user => ({
        ...user,
        followerCount: user.followerCount ?? 0,
        followingCount: user.followingCount ?? 0,
        isPrivate: user.isPrivate ?? false
      }));
    } catch (error) {
      console.error("Search error:", error);
      throw new Error("Failed to search users");
    }
  }

  async deleteUser(id: number): Promise<void> {
    // Only admin users should be able to delete users, 
    // but the permission check should be done at the route level

    // Check if user exists
    const [userToDelete] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));

    if (!userToDelete) {
      throw new Error("User not found");
    }

    // Prevent deleting admin users for safety
    if (userToDelete.role === 'admin') {
      throw new Error("Cannot delete admin users");
    }

    await db.transaction(async (tx) => {
      // Delete user posts
      await tx
        .delete(posts)
        .where(eq(posts.userId, id));

      // Delete user comments
      await tx
        .delete(comments)
        .where(eq(comments.userId, id));

      // Delete user follow relationships (both as follower and following)
      await tx
        .delete(follows)
        .where(
          or(
            eq(follows.followerId, id),
            eq(follows.followingId, id)
          )
        );

      // Finally delete the user
      await tx
        .delete(users)
        .where(eq(users.id, id));
    });
  }
}

export const storage = new DatabaseStorage();