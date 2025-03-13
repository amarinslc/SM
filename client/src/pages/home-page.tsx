import { PostCard } from "@/components/post-card";
import { PostForm } from "@/components/post-form";
import { UserCard } from "@/components/user-card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";

export default function HomePage() {
  const { user, logoutMutation } = useAuth();

  const { data: feed, isLoading: isFeedLoading } = useQuery<Post[]>({
    queryKey: ["/api/feed"],
  });

  const { data: following, isLoading: isFollowingLoading } = useQuery<User[]>({
    queryKey: [`/api/users/${user?.id}/following`],
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container flex justify-between items-center h-16">
          <h1 className="text-2xl font-bold">Dunbar</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </header>

      <main className="container py-6">
        <div className="grid md:grid-cols-[1fr_300px] gap-6">
          <div className="space-y-6">
            <PostForm />
            {isFeedLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {feed?.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="rounded-lg bg-card p-4">
              <h2 className="font-semibold mb-2">Your Network</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div>
                  Following: {user.followingCount}/200
                </div>
                <div className="w-px h-4 bg-border" />
                <div>
                  Followers: {user.followerCount}/200
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="font-semibold">People You Follow</h2>
              {isFollowingLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                following?.map((followedUser) => (
                  <UserCard
                    key={followedUser.id}
                    user={followedUser}
                    isFollowing={true}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
