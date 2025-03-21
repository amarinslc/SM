import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { User, Post } from "@shared/schema";
import { ProfileEditor } from "@/components/profile-editor";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Home, Loader2 } from "lucide-react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { PostCard } from "@/components/post-card";
import { UserListDrawer } from "@/components/user-list-drawer";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type ListType = "followers" | "following" | null;

function ProfileView({ user, onEdit, isOwnProfile }: { user: User; onEdit?: () => void; isOwnProfile: boolean }) {
  const [listType, setListType] = useState<ListType>(null);

  // Fetch followers and following lists when needed
  const { data: followers, isLoading: isFollowersLoading } = useQuery<User[]>({
    queryKey: [`/api/users/${user.id}/followers`],
    enabled: listType === "followers",
  });

  const { data: following, isLoading: isFollowingLoading } = useQuery<User[]>({
    queryKey: [`/api/users/${user.id}/following`],
    enabled: listType === "following",
  });

  return (
    <>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20">
                <AvatarImage src={user.photo || undefined} />
                <AvatarFallback>{user.name[0].toUpperCase()}</AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-2xl font-bold">{user.name}</h2>
                <p className="text-muted-foreground">@{user.username}</p>
              </div>
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

            <div className="flex gap-4 text-sm">
              <button
                onClick={() => setListType("following")}
                className="text-muted-foreground hover:text-foreground"
              >
                Following: {user.followingCount}/150
              </button>
              <button
                onClick={() => setListType("followers")}
                className="text-muted-foreground hover:text-foreground"
              >
                Followers: {user.followerCount}
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <UserListDrawer
        open={listType !== null}
        onClose={() => setListType(null)}
        title={listType === "followers" ? "Followers" : "Following"}
        users={listType === "followers" ? followers : following}
        isLoading={listType === "followers" ? isFollowersLoading : isFollowingLoading}
      />
    </>
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Profile</h1>
        <Link href="/">
          <Button variant="ghost" size="sm">
            <Home className="h-4 w-4 mr-2" />
            Back to Feed
          </Button>
        </Link>
      </div>

      <div className="max-w-2xl space-y-6">
        {isEditing && isOwnProfile ? (
          <>
            <ProfileEditor user={user} onSuccess={() => setIsEditing(false)} />
            <Button variant="outline" className="mt-4" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <ProfileView user={user} onEdit={isOwnProfile ? () => setIsEditing(true) : undefined} isOwnProfile={!!isOwnProfile} />
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