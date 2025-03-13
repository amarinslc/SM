import { PostCard } from "@/components/post-card";
import { UserCard } from "@/components/user-card";
import { useAuth } from "@/hooks/use-auth";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useParams } from "wouter";

export default function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const userId = parseInt(id);

  const { data: user, isLoading: isUserLoading } = useQuery<User>({
    queryKey: [`/api/users/${userId}`],
  });

  const { data: posts, isLoading: isPostsLoading } = useQuery<Post[]>({
    queryKey: [`/api/posts/${userId}`],
  });

  const { data: following } = useQuery<User[]>({
    queryKey: [`/api/users/${currentUser?.id}/following`],
  });

  if (isUserLoading || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const isFollowing = following?.some((u) => u.id === user.id) ?? false;

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6">
        <div className="grid md:grid-cols-[300px_1fr] gap-6">
          <div>
            <UserCard user={user} isFollowing={isFollowing} />
          </div>

          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Posts</h2>
            {isPostsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                {posts?.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
