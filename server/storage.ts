import session from "express-session";
import createMemoryStore from "memorystore";
import { InsertUser, User, Post } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private follows: Map<number, Set<number>>;
  private posts: Map<number, Post>;
  private currentUserId: number;
  private currentPostId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.follows = new Map();
    this.posts = new Map();
    this.currentUserId = 1;
    this.currentPostId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Looking up user by username: ${username}`);
    console.log(`Current users in storage: ${Array.from(this.users.values()).length}`);
    const user = Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
    console.log(`User found:`, user ? 'yes' : 'no');
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      followerCount: 0,
      followingCount: 0,
    };
    console.log(`Creating new user with ID ${id}:`, user.username);
    this.users.set(id, user);
    this.follows.set(id, new Set());
    return user;
  }

  async followUser(followerId: number, followingId: number): Promise<void> {
    if (followerId === followingId) throw new Error("Cannot follow yourself");
    
    const follower = await this.getUser(followerId);
    const following = await this.getUser(followingId);
    if (!follower || !following) throw new Error("User not found");

    const followerFollowing = this.follows.get(followerId);
    if (!followerFollowing) throw new Error("Follower not found");

    if (followerFollowing.size >= 200) {
      throw new Error("You can only follow up to 200 users");
    }

    if (follower.followerCount >= 200) {
      throw new Error("User has reached maximum followers");
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

  async createPost(userId: number, content: string, media: any[]): Promise<Post> {
    const user = await this.getUser(userId);
    if (!user) throw new Error("User not found");

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
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async getFeed(userId: number): Promise<Post[]> {
    const following = this.follows.get(userId);
    if (!following) return [];
    return Array.from(this.posts.values())
      .filter((post) => following.has(post.userId) || post.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async searchUsers(query: string): Promise<User[]> {
    console.log(`Searching users with query: "${query}"`);
    console.log(`Current users in storage: ${Array.from(this.users.values()).length}`);

    const lowercaseQuery = query.toLowerCase();
    const results = Array.from(this.users.values()).filter((user) => {
      const matchesName = user.name.toLowerCase().includes(lowercaseQuery);
      const matchesUsername = user.username.toLowerCase().includes(lowercaseQuery);
      return matchesName || matchesUsername;
    });

    console.log(`Found ${results.length} matching users`);
    return results;
  }
}

export const storage = new MemStorage();