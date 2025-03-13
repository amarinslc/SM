import session from "express-session";
import createMemoryStore from "memorystore";
import { InsertUser, User, Post, Comment, FollowRequest } from "@shared/schema";

const MemoryStore = createMemoryStore(session);

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  followUser(followerId: number, followingId: number): Promise<void>;
  unfollowUser(followerId: number, followingId: number): Promise<void>;
  requestFollow(requesterId: number, targetId: number): Promise<FollowRequest>;
  getPendingFollowRequests(userId: number): Promise<FollowRequest[]>;
  acceptFollowRequest(requestId: number): Promise<void>;
  rejectFollowRequest(requestId: number): Promise<void>;
  getFollowers(userId: number): Promise<User[]>;
  getFollowing(userId: number): Promise<User[]>;
  createPost(userId: number, content: string, media: any[]): Promise<Post>;
  getPosts(userId: number): Promise<Post[]>;
  getFeed(userId: number): Promise<Post[]>;
  sessionStore: session.Store;
  searchUsers(query: string): Promise<User[]>;
  createComment(postId: number, userId: number, content: string): Promise<Comment>;
  getComments(postId: number): Promise<Comment[]>;
  canComment(userId: number, postId: number): Promise<boolean>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private follows: Map<number, Set<number>>;
  private followRequests: Map<number, FollowRequest>;
  private posts: Map<number, Post>;
  private comments: Map<number, Comment[]>;
  private currentUserId: number;
  private currentPostId: number;
  private currentCommentId: number;
  private currentRequestId: number;
  sessionStore: session.Store;

  constructor() {
    this.users = new Map();
    this.follows = new Map();
    this.followRequests = new Map();
    this.posts = new Map();
    this.comments = new Map();
    this.currentUserId = 1;
    this.currentPostId = 1;
    this.currentCommentId = 1;
    this.currentRequestId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async searchUsers(query: string): Promise<User[]> {
    console.log(`Searching users with query: "${query}"`);
    const allUsers = Array.from(this.users.values());
    console.log(`Current users in storage: ${allUsers.length}`);
    console.log('All users:', allUsers.map(u => ({ id: u.id, username: u.username })));

    //No filtering for search
    return allUsers;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    console.log(`Looking up user by username: ${username}`);
    const users = Array.from(this.users.values());
    console.log(`Current users in storage: ${users.length}`);
    console.log('All users:', users.map(u => u.username));
    const user = users.find((user) => user.username === username);
    console.log(`User found:`, user ? 'yes' : 'no');
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      isPrivate: true,
      followerCount: 0,
      followingCount: 0,
    };
    console.log(`Creating new user with ID ${id}:`, user.username);
    this.users.set(id, user);
    this.follows.set(id, new Set());
    return user;
  }

  async requestFollow(requesterId: number, targetId: number): Promise<FollowRequest> {
    const requester = await this.getUser(requesterId);
    const target = await this.getUser(targetId);

    if (!requester || !target) {
      throw new Error("User not found");
    }

    if (requesterId === targetId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if already following
    const following = this.follows.get(requesterId);
    if (following?.has(targetId)) {
      throw new Error("Already following this user");
    }

    // Check if request already exists
    const existingRequest = Array.from(this.followRequests.values()).find(
      (req) => req.requesterId === requesterId && req.targetId === targetId
    );
    if (existingRequest) {
      throw new Error("Follow request already sent");
    }

    const request: FollowRequest = {
      id: this.currentRequestId++,
      requesterId,
      targetId,
      createdAt: new Date(),
    };

    this.followRequests.set(request.id, request);
    return request;
  }

  async getPendingFollowRequests(userId: number): Promise<FollowRequest[]> {
    console.log(`Getting pending follow requests for user ${userId}`);
    const requests = Array.from(this.followRequests.values()).filter(
      (req) => req.targetId === userId
    );
    console.log(`Found ${requests.length} pending requests:`, requests);
    return requests;
  }

  async acceptFollowRequest(requestId: number): Promise<void> {
    const request = this.followRequests.get(requestId);
    if (!request) {
      throw new Error("Follow request not found");
    }

    await this.followUser(request.requesterId, request.targetId);
    this.followRequests.delete(requestId);
  }

  async rejectFollowRequest(requestId: number): Promise<void> {
    const request = this.followRequests.get(requestId);
    if (!request) {
      throw new Error("Follow request not found");
    }

    this.followRequests.delete(requestId);
  }

  async followUser(followerId: number, followingId: number): Promise<void> {
    const follower = await this.getUser(followerId);
    const following = await this.getUser(followingId);
    if (!follower || !following) throw new Error("User not found");

    const followerFollowing = this.follows.get(followerId);
    if (!followerFollowing) throw new Error("Follower not found");

    if (followerFollowing.size >= 200) {
      throw new Error("You can only follow up to 200 users");
    }

    if (following.followerCount >= 200) {
      throw new Error("User has reached maximum followers");
    }

    followerFollowing.add(followingId);
    this.users.set(followerId, {
      ...follower,
      followingCount: (follower.followingCount || 0) + 1,
    });
    this.users.set(followingId, {
      ...following,
      followerCount: (following.followerCount || 0) + 1,
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
      followingCount: (follower.followingCount || 0) - 1,
    });
    this.users.set(followingId, {
      ...following,
      followerCount: (following.followerCount || 0) - 1,
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
    console.log(`Getting feed for user ${userId}`);
    const following = this.follows.get(userId);

    // By default, only show user's own posts
    let feedPosts = Array.from(this.posts.values())
      .filter(post => post.userId === userId);

    // If user follows others, add their posts too
    if (following && following.size > 0) {
      const followedPosts = Array.from(this.posts.values())
        .filter(post => following.has(post.userId));
      feedPosts = [...feedPosts, ...followedPosts];
    }

    // Sort by date
    return feedPosts.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
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
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
  }

  async canComment(userId: number, postId: number): Promise<boolean> {
    const post = Array.from(this.posts.values()).find(p => p.id === postId);
    if (!post) return false;

    // Users can always comment on their own posts
    if (post.userId === userId) return true;

    // Check if the user follows the post creator
    const following = this.follows.get(userId);
    return following ? following.has(post.userId) : false;
  }

  async createComment(postId: number, userId: number, content: string): Promise<Comment> {
    if (!await this.canComment(userId, postId)) {
      throw new Error("You can only comment on posts from users you follow");
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