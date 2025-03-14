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
  createUser(user: InsertUser): Promise<User>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  createPost(userId: number, content: string, media: any[]): Promise<Post>;
  getPosts(userId: number): Promise<Post[]>;
  getFeed(userId: number): Promise<Post[]>;
  sessionStore: session.Store;
  searchUsers(query: string): Promise<User[]>;
  createComment(postId: number, userId: number, content: string): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
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

    // Check if already following
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
      throw new Error("Already following this user");
    }

    // Start a transaction to ensure consistency
    await db.transaction(async (tx) => {
      // Create follow relationship
      await tx.insert(follows).values({
        followerId: followerIdInt,
        followingId: followingIdInt,
      });

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
    });
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
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

      // Update follower count
      await tx
        .update(users)
        .set({ followingCount: users.followingCount - 1 })
        .where(eq(users.id, followerId));

      // Update following count
      await tx
        .update(users)
        .set({ followerCount: users.followerCount - 1 })
        .where(eq(users.id, followingId));
    });
  }

  async getFollowers(userId: number): Promise<User[]> {
    const followData = await db
      .select({
        follower: users,
      })
      .from(follows)
      .where(eq(follows.followingId, userId))
      .innerJoin(users, eq(users.id, follows.followerId));

    return followData.map((d) => d.follower);
  }

  async getFollowing(userId: number): Promise<User[]> {
    const followData = await db
      .select({
        following: users,
      })
      .from(follows)
      .where(eq(follows.followerId, userId))
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

  async getPosts(userId: number): Promise<Post[]> {
    return db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(posts.createdAt);
  }

  async getFeed(userId: number): Promise<Post[]> {
    // Get users that the current user follows
    const following = await this.getFollowing(userId);
    const followingIds = following.map((u) => u.id);

    // Only get posts from followed users and own posts
    const feed = await db
      .select()
      .from(posts)
      .where(
        or(
          eq(posts.userId, userId),
          // Only include posts from users we follow if we have any
          followingIds.length > 0 ? inArray(posts.userId, followingIds) : sql`false`
        )
      )
      .orderBy(sql`${posts.createdAt} DESC`);

    return feed;
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
}

export const storage = new DatabaseStorage();