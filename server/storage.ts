import session from "express-session";
import createMemoryStore from "memorystore";
import { InsertUser, User, Post, Comment } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

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

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private follows: Map<number, Set<number>>;
  private posts: Map<number, Post>;
  private comments: Map<number, Comment[]>;
  private currentUserId: number;
  private currentPostId: number;
  private currentCommentId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.follows = new Map();
    this.posts = new Map();
    this.comments = new Map();
    this.currentUserId = 1;
    this.currentPostId = 1;
    this.currentCommentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async searchUsers(query: string): Promise<User[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.users.values()).filter(user =>
      user.username.toLowerCase().includes(lowercaseQuery)
    );
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      followerCount: 0,
      followingCount: 0,
    };
    this.users.set(id, user);
    this.follows.set(id, new Set());
    return user;
  }

  async followUser(followerId: number, followingId: number): Promise<void> {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }

    const follower = await this.getUser(followerId);
    const following = await this.getUser(followingId);
    if (!follower || !following) throw new Error("User not found");

    const followerFollowing = this.follows.get(followerId);
    if (!followerFollowing) throw new Error("Follower not found");

    if (followerFollowing.size >= 200) {
      throw new Error("You can only follow up to 200 users");
    }

    followerFollowing.add(followingId);
    this.users.set(followerId, {
      ...follower,
      followingCount: follower.followingCount + 1,
    });
    this.users.set(followingId, {
      ...following,
      followerCount: following.followerCount + 1,
    });
  }

  async unfollowUser(followerId: number, followingId: number): Promise<void> {
    const follower = await this.getUser(followerId);
    const following = await this.getUser(followingId);
    if (!follower || !following) throw new Error("User not found");

    const followerFollowing = this.follows.get(followerId);
    if (!followerFollowing) throw new Error("Follower not found");

    followerFollowing.delete(followingId);
    this.users.set(followerId, {
      ...follower,
      followingCount: follower.followingCount - 1,
    });
    this.users.set(followingId, {
      ...following,
      followerCount: following.followerCount - 1,
    });
  }

  async getFollowers(userId: number): Promise<User[]> {
    const users = Array.from(this.follows.entries())
      .filter(([_, following]) => following.has(userId))
      .map(([id]) => this.users.get(id))
      .filter((user): user is User => user !== undefined);
    return users;
  }

  async getFollowing(userId: number): Promise<User[]> {
    const following = this.follows.get(userId);
    if (!following) return [];
    return Array.from(following)
      .map((id) => this.users.get(id))
      .filter((user): user is User => user !== undefined);
  }

  async getFeed(userId: number): Promise<Post[]> {
    const following = this.follows.get(userId);
    const feed = Array.from(this.posts.values())
      .filter((post) => {
        const isOwnPost = post.userId === userId;
        const isFollowingPost = following?.has(post.userId) ?? false;
        return isOwnPost || isFollowingPost;
      })
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
    return feed;
  }

  async createPost(userId: number, content: string, media: any[]): Promise<Post> {
    const post: Post = {
      id: this.currentPostId++,
      userId,
      content,
      media,
      createdAt: new Date(),
    };
    this.posts.set(post.id, post);
    return post;
  }

  async getPosts(userId: number): Promise<Post[]> {
    return Array.from(this.posts.values())
      .filter((post) => post.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async createComment(postId: number, userId: number, content: string): Promise<Comment> {
    const post = Array.from(this.posts.values()).find(p => p.id === postId);
    if (!post) throw new Error("Post not found");

    const following = this.follows.get(userId);
    const canComment = post.userId === userId || following?.has(post.userId);

    if (!canComment) {
      throw new Error("You can only comment on your own posts or posts from users you follow");
    }

    const comment: Comment = {
      id: this.currentCommentId++,
      postId,
      userId,
      content,
      createdAt: new Date(),
    };

    const postComments = this.comments.get(postId) || [];
    postComments.push(comment);
    this.comments.set(postId, postComments);

    return comment;
  }

  async getComments(postId: number): Promise<Comment[]> {
    return this.comments.get(postId) || [];
  }
}

export const storage = new MemStorage();