import session from "express-session";
import { users, type User, type InsertUser, Post, Comment, comments, follows, posts } from "@shared/schema";
import { db } from "./db";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { promisify } from 'util';

const resend = new Resend(process.env.RESEND_API_KEY);
const randomBytesAsync = promisify(randomBytes);

const PostgresSessionStore = connectPg(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<Omit<User, 'id' | 'username'>>): Promise<User>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  createPost(userId: number, content: string, media: any[]): Promise<Post>;
  getPosts(userId: number, viewerId?: number): Promise<Post[]>;
  getFeed(userId: number): Promise<Post[]>;
  sessionStore: session.Store;
  createComment(postId: number, userId: number, content: string): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  getPendingFollowRequests(userId: number): Promise<any[]>;
  acceptFollowRequest(followerId: number, followingId: number): Promise<void>;
  rejectFollowRequest(followerId: number, followingId: number): Promise<void>;
  getPost(id: number): Promise<Post | undefined>;
  deletePost(id: number): Promise<void>;
  verifyEmail(token: string): Promise<boolean>;
  sendVerificationEmail(userId: number, email: string): Promise<void>;
  isEmailVerified(userId: number): Promise<boolean>;
  sendPasswordResetEmail(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<boolean>;
  getFullUserData(id: number): Promise<User | undefined>;
  searchUsers(query: string): Promise<User[]>;
}

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, id));
    if (!user) return undefined;

    // Remove sensitive fields for public profile
    const { password, email, verificationToken, resetPasswordToken, resetPasswordExpires, ...safeUser } = user;
    return safeUser as User;
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

    if (follower.followingCount >= 150) {
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

  async getFollowers(userId: number): Promise<User[]> {
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

    return followData.map((d) => d.follower);
  }

  async getFollowing(userId: number): Promise<User[]> {
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

    return followData.map((d) => d.following);
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

  private async isFollowing(followerId: number, followingId: number): Promise<boolean> {
    const [follow] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );
    return !!follow;
  }

  async updateUser(id: number, data: Partial<Omit<User, 'id' | 'username'>>): Promise<User> {
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

    return updatedUser;
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

    return requests;
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
    await db
      .delete(posts)
      .where(eq(posts.id, id));
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
        from: 'Dunbar <noreply@dunbar.social>',
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

  async getFullUserData(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) return undefined;

    // Remove only security-sensitive fields, keep profile data including email
    const { password, verificationToken, resetPasswordToken, resetPasswordExpires, ...fullUser } = user;
    return fullUser as User;
  }

  async searchUsers(query: string): Promise<User[]> {
    try {
      const searchResults = await db
        .select({
          id: users.id,
          username: users.username,
          name: users.name,
          bio: users.bio,
          photo: users.photo,
          followerCount: sql`COALESCE(${users.followerCount}, 0)`,
          followingCount: sql`COALESCE(${users.followingCount}, 0)`,
          isPrivate: sql`COALESCE(${users.isPrivate}, false)`,
        })
        .from(users)
        .where(
          or(
            sql`LOWER(${users.username}) LIKE ${`%${query.toLowerCase()}%`}`,
            sql`LOWER(${users.name}) LIKE ${`%${query.toLowerCase()}%`}`
          )
        )
        .limit(20);

      return searchResults;
    } catch (error) {
      console.error("Search error:", error);
      throw new Error("Failed to search users");
    }
  }
}

export const storage = new DatabaseStorage();