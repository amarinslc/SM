import { useState } from "react";
import { PostCard } from "@/components/post-card";
import { PostForm } from "@/components/post-form";
import { UserCard } from "@/components/user-card";
import { PendingRequests } from "@/components/pending-requests";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, Search, User as UserIcon, ShieldAlert } from "lucide-react";
import { Link } from "wouter";
import { useDebounce } from "@/hooks/use-debounce";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data: feed, isLoading: isFeedLoading } = useQuery<Post[]>({
    queryKey: ["/api/feed"],
  });

  const { data: following, isLoading: isFollowingLoading } = useQuery<User[]>({
    queryKey: [`/api/users/${user?.id}/following`],
  });

  const { data: requests, isLoading: isRequestsLoading } = useQuery<any[]>({
    queryKey: [`/api/users/${user?.id}/requests`],
    enabled: !!user?.id,
  });
  
  // Get reported posts count for admin badge
  const { data: reportedPosts } = useQuery<any[]>({
    queryKey: ['/api/admin/reported-posts'],
    enabled: !!user?.id && user.role === 'admin',
  });

  const { data: searchResults, isLoading: isSearching, error: searchError } = useQuery<User[]>({
    queryKey: ["/api/users/search", debouncedSearch],
    queryFn: async () => {
      if (!debouncedSearch.trim()) {
        return [];
      }

      const response = await fetch(
        `/api/users/search?q=${encodeURIComponent(debouncedSearch.trim())}`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to search users');
      }

      const data = await response.json();
      return data;
    },
    enabled: debouncedSearch.trim().length > 0,
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold">Dunbar</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                type="search"
                placeholder="Search users..."
                className="w-64 pl-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Link href="/profile">
              <Button variant="ghost" size="icon">
                <UserIcon className="h-5 w-5" />
              </Button>
            </Link>
            {user.role === 'admin' && (
              <Link href="/admin">
                <Button variant="ghost" className="text-sm relative">
                  <div className="flex items-center gap-1">
                    <ShieldAlert className="h-4 w-4 mr-1" />
                    Admin
                    {reportedPosts && reportedPosts.length > 0 && (
                      <Badge variant="destructive" className="text-[10px] px-1 h-5 min-w-5 flex items-center justify-center">
                        {reportedPosts.filter((post: any) => post.is_priority_review).length > 0 
                          ? reportedPosts.filter((post: any) => post.is_priority_review).length
                          : reportedPosts.length}
                      </Badge>
                    )}
                  </div>
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {searchQuery && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-4">Search Results</h2>
            {isSearching ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : searchError ? (
              <p className="text-red-500">Failed to search users. Please try again.</p>
            ) : searchResults?.length ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {searchResults.map((searchedUser) => (
                  <UserCard
                    key={searchedUser.id}
                    user={searchedUser}
                    isFollowing={following?.some((f) => f.id === searchedUser.id) ?? false}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No users found</p>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-[1fr_300px] gap-6">
          <div className="space-y-6">
            <PostForm />
            {isFeedLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : feed?.length ? (
              <div className="space-y-4">
                {feed.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground">
                No posts in your feed. Follow some users to see their posts!
              </p>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg bg-card p-4">
              <h2 className="font-semibold mb-2">Your Network</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div>Following: {user.followingCount}/150</div>
                <div className="w-px h-4 bg-border" />
                <div>Followers: {user.followerCount}</div>
              </div>
            </div>

            {requests && requests.length > 0 && (
              <PendingRequests requests={requests} />
            )}

            <div className="space-y-4">
              <h2 className="font-semibold">People You Follow</h2>
              {isFollowingLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : following?.length ? (
                following.map((followedUser) => (
                  <UserCard
                    key={followedUser.id}
                    user={followedUser}
                    isFollowing={true}
                  />
                ))
              ) : (
                <p className="text-muted-foreground">You're not following anyone yet</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}