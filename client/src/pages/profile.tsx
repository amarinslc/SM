import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Post } from "@shared/schema";
import { ProfileEditor } from "@/components/profile-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Loader2 } from "lucide-react";
import { useParams } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostCard } from "@/components/post-card";

function ProfileView({ user, onEdit, isOwnProfile }: { user: User; onEdit?: () => void; isOwnProfile: boolean }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-muted-foreground">@{user.username}</p>
          </div>
          {isOwnProfile && onEdit && (
            <Button onClick={onEdit} variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-2" />
              Edit Profile
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div>
            <label className="font-medium">Email</label>
            <p>{user.email}</p>
          </div>

          {user.bio && (
            <div>
              <label className="font-medium">Bio</label>
              <p>{user.bio}</p>
            </div>
          )}

          <div className="flex gap-4 text-sm text-muted-foreground">
            <div>Following: {user.followingCount}/200</div>
            <div>Followers: {user.followerCount}/200</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ProfilePage() {
  const [isEditing, setIsEditing] = useState(false);
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();

  const { data: user, isLoading: isUserLoading } = useQuery<User>({
    queryKey: id ? [`/api/users/${id}`] : ["/api/user"],
  });

  const { data: posts, isLoading: isPostsLoading } = useQuery<Post[]>({
    queryKey: [`/api/posts/${id || currentUser?.id}`],
    enabled: !!user,
  });

  if (isUserLoading || isPostsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <div>User not found</div>;
  }

  const isOwnProfile = !id || (currentUser && currentUser.id === parseInt(id));

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Profile</h1>

      <div className="max-w-2xl space-y-6">
        {isEditing && isOwnProfile ? (
          <>
            <ProfileEditor user={user} onSuccess={() => setIsEditing(false)} />
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setIsEditing(false)}
            >
              Cancel
            </Button>
          </>
        ) : (
          <ProfileView 
            user={user} 
            onEdit={isOwnProfile ? () => setIsEditing(true) : undefined}
            isOwnProfile={isOwnProfile}
          />
        )}

        <div className="mt-8">
          <h2 className="text-xl font-semibold mb-4">Posts</h2>
          {posts?.length ? (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No posts yet</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfilePage;