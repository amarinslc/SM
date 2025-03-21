import session from "express-session";
import { db } from "./db";
import { InsertUser, User, Post, Comment, users, follows, posts, comments } from "@shared/schema";
import { eq, and, inArray, or, sql } from "drizzle-orm";
import connectPg from "connect-pg-simple";
import { pool } from "./db";

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
  searchUsers(query: string): Promise<User[]>;
  createComment(postId: number, userId: number, content: string): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  getPendingFollowRequests(userId: number): Promise<any[]>;
  acceptFollowRequest(followerId: number, followingId: number): Promise<void>;
  rejectFollowRequest(followerId: number, followingId: number): Promise<void>;
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
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async searchUsers(query: string): Promise<User[]> {
    // This will search all users with case-insensitive partial matches
    return db.select().from(users).where(
      or(
        sql`lower(${users.username}) like ${`%${query.toLowerCase()}%`}`,
        sql`lower(${users.name}) like ${`%${query.toLowerCase()}%`}`
      )
    );
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

    // Ensure both IDs are valid integers
    const followerIdInt = typeof followerId === 'number' ? followerId : parseInt(followerId as any);
    const followingIdInt = typeof followingId === 'number' ? followingId : parseInt(followingId as any);

    if (isNaN(followerIdInt) || isNaN(followingIdInt)) {
      throw new Error("Invalid user IDs");
    }

    // Check if the target user exists
    const [targetUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, followingIdInt));

    if (!targetUser) {
      throw new Error("Target user not found");
    }

    // Check if already following or has pending request
    const [existing] = await db
      .select()
      .from(follows)
      .where(
        and(
          eq(follows.followerId, followerIdInt),
          eq(follows.followingId, followingIdInt)
        )
      );

    if (existing) {
      throw new Error("Already following or requested to follow this user");
    }

    // Get follower user and check limits
    const [follower] = await db
      .select()
      .from(users)
      .where(eq(users.id, followerIdInt));

    if (!follower) {
      throw new Error("Follower user not found");
    }

    if (follower.followingCount >= 150) {
      throw new Error("You have reached the maximum number of follows (150)");
    }

    // Start a transaction to ensure consistency
    await db.transaction(async (tx) => {
      // Create follow relationship
      await tx.insert(follows).values({
        followerId: followerIdInt,
        followingId: followingIdInt,
        isPending: targetUser.isPrivate, // Set pending if account is private
      });

      // Only update counts if the account is not private
      if (!targetUser.isPrivate) {
        // Update follower count
        await tx
          .update(users)
          .set({ followingCount: sql`${users.followingCount} + 1` })
          .where(eq(users.id, followerIdInt));

        // Update following count
        await tx
          .update(users)
          .set({ followerCount: sql`${users.followerCount} + 1` })
          .where(eq(users.id, followingIdInt));
      }
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
    // Get the user's profile
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      return [];
    }

    // If viewing own posts
    if (viewerId === userId) {
      return db
        .select()
        .from(posts)
        .where(eq(posts.userId, userId))
        .orderBy(sql`${posts.createdAt} DESC`);
    }

    // If account is private, check if viewer is an approved follower
    if (user.isPrivate) {
      if (!viewerId) return []; // Not authenticated

      const [isFollower] = await db
        .select()
        .from(follows)
        .where(
          and(
            eq(follows.followerId, viewerId),
            eq(follows.followingId, userId),
            eq(follows.isPending, false)
          )
        );

      if (!isFollower) {
        return [];
      }
    }

    return db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(sql`${posts.createdAt} DESC`);
  }

  async getFeed(userId: number): Promise<Post[]> {
    // Get users that the current user actively follows (not pending)
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

    const followingIds = following.map((f) => f.followingId);

    // If not following anyone, return empty feed
    if (followingIds.length === 0) {
      return [];
    }

    // Get posts only from users being followed
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

    // Ensure we have valid data to update
    if (!data || Object.keys(data).length === 0) {
      throw new Error('No valid data provided for update');
    }

    // Remove any undefined values
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([_, value]) => value !== undefined)
    );

    console.log('Storage: Cleaned update data:', updateData);

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
      // Update follow status
      await tx
        .update(follows)
        .set({ isPending: false })
        .where(
          and(
            eq(follows.followerId, followerId),
            eq(follows.followingId, followingId)
          )
        );

      // Update follower count
      await tx
        .update(users)
        .set({ followingCount: sql`${users.followingCount} + 1` })
        .where(eq(users.id, followerId));

      // Update following count
      await tx
        .update(users)
        .set({ followerCount: sql`${users.followerCount} + 1` })
        .where(eq(users.id, followingId));
    });
  }

  async rejectFollowRequest(followerId: number, followingId: number): Promise<void> {
    await db
      .delete(follows)
      .where(
        and(
          eq(follows.followerId, followerId),
          eq(follows.followingId, followingId)
        )
      );
  }
}

export const storage = new DatabaseStorage();