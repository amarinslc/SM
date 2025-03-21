import { PostCard } from "@/components/post-card";
import { PostForm } from "@/components/post-form";
import { UserCard } from "@/components/user-card";
import { PendingRequests } from "@/components/pending-requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut, Search, User as UserIcon } from "lucide-react";
import { useState } from "react";
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

  const { data: requests, isLoading: isRequestsLoading } = useQuery({
    queryKey: [`/api/users/${user?.id}/requests`],
    enabled: !!user?.id,
  });

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-primary mb-2 rounded-full bg-card p-8 inline-block">Dunbar</h1>
          <p className="text-lg text-muted-foreground italic rounded-full bg-card p-4">
            no more than 150 connections at once...because real relationships matter.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-[1fr_2fr_1fr]">
          <div className="space-y-4">
            <div className="rounded-full overflow-hidden bg-card p-4">
              <UserCard user={user} />
              <Button
                variant="ghost"
                className="w-full mt-2 rounded-full"
                onClick={() => logoutMutation.mutate()}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
            {requests && requests.length > 0 && (
              <div className="rounded-full overflow-hidden bg-card p-4">
                <PendingRequests requests={requests} />
              </div>
            )}
          </div>

          <div className="space-y-4">
            <PostForm />
            {isFeedLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-4">
                {feed?.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="rounded-full overflow-hidden bg-card p-4 sticky top-4">
              <div className="space-y-4">
                <Input
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-full"
                />
                {isFollowingLoading ? (
                  <div className="flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="font-medium">Following ({following?.length || 0}/150)</h3>
                    {following?.map((followedUser) => (
                      <Link key={followedUser.id} href={`/profile/${followedUser.id}`}>
                        <a className="flex items-center space-x-2 p-2 rounded-full hover:bg-muted">
                          <UserIcon className="h-4 w-4" />
                          <span>{followedUser.username}</span>
                        </a>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}