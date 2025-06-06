import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserMinus } from "lucide-react";
import { Link } from "wouter";

interface UserCardProps {
  user: User;
  isFollowing: boolean;
  showRemoveFollower?: boolean;
}

export function UserCard({ user, isFollowing, showRemoveFollower = false }: UserCardProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  // Fetch follow requests for the current user
  const { data: followRequestsData } = useQuery<any[]>({
    queryKey: currentUser?.id ? [`/api/users/${currentUser.id}/requests`] : [],
    enabled: !!currentUser?.id, 
  });
  
  // Make sure we extract the data correctly if it's in a nested structure
  const followRequests = Array.isArray(followRequestsData) ? followRequestsData : [];

  // Safely check if there's a pending request from this user
  const hasPendingRequest = !!(
    Array.isArray(followRequests) && 
    followRequests.some((request: any) => 
      request && request.follower && request.follower.id === user.id
    )
  );

  const followMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isFollowing ? "unfollow" : "follow";
      const response = await apiRequest("POST", `/api/users/${user.id}/${endpoint}`);
      return isFollowing ? undefined : response.json();
    },
    onSuccess: (data) => {
      // Invalidate all relevant queries for proper cache updating
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}`] });
      
      if (currentUser?.id) {
        // Invalidate current user's following list
        queryClient.invalidateQueries({
          queryKey: [`/api/users/${currentUser.id}/following`],
        });
        
        // Invalidate current user's followers list
        queryClient.invalidateQueries({
          queryKey: [`/api/users/${currentUser.id}/followers`],
        });
        
        // Invalidate requests (both incoming and outgoing)
        queryClient.invalidateQueries({ 
          queryKey: [`/api/users/${currentUser.id}/requests`],
        });
        
        // Invalidate outgoing requests
        queryClient.invalidateQueries({ 
          queryKey: [`/api/users/${currentUser.id}/outgoing-requests`],
        });
        
        // Also invalidate the current user data
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
      
      // Always invalidate feed
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });

      toast({
        title: isFollowing ? "Unfollowed" : data?.message ?? "Following",
        description: isFollowing
          ? `You unfollowed ${user.name}`
          : user.isPrivate 
            ? `Your follow request has been sent to ${user.name}`
            : `You are now following ${user.name}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation for removing a follower
  const removeFollowerMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/users/${user.id}/remove-follower`);
    },
    onSuccess: () => {
      // Invalidate all relevant queries
      if (currentUser?.id) {
        // Invalidate followers list
        queryClient.invalidateQueries({
          queryKey: [`/api/users/${currentUser.id}/followers`],
        });
        
        // Invalidate the current user data
        queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      }
      
      toast({
        title: "Follower Removed",
        description: `${user.name} has been removed from your followers`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Action failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (currentUser?.id === user.id) return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-4">
        <Link href={`/profile/${user.id}`}>
          <Avatar className="h-12 w-12 cursor-pointer">
            {user.photo ? (
              <AvatarImage 
                // Try to fix the path if it doesn't start with /
                src={user.photo && (user.photo.startsWith('/') || user.photo.startsWith('http')) 
                  ? user.photo 
                  : user.photo ? `/${user.photo}` : ''} 
                alt={`${user.name}'s profile photo`} 
                onError={(e) => {
                  // If image fails to load, show fallback
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('[role="img"]') as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <AvatarFallback>{user.name[0].toUpperCase()}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex flex-col">
          <Link href={`/profile/${user.id}`}>
            <span className="font-semibold hover:underline cursor-pointer">{user.name}</span>
          </Link>
          <Link href={`/profile/${user.id}`}>
            <span className="text-sm text-muted-foreground hover:underline cursor-pointer">@{user.username}</span>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{user.bio || "No bio available"}</p>
        <div className="flex gap-4">
          <div>
            <span className="font-semibold">{user.followerCount || 0}</span>
            <span className="text-sm text-muted-foreground ml-1">followers</span>
          </div>
          <div>
            <span className="font-semibold">{user.followingCount || 0}</span>
            <span className="text-sm text-muted-foreground ml-1">following</span>
          </div>
        </div>
        
        {showRemoveFollower ? (
          <Button
            variant="outline"
            className="w-full mt-4"
            onClick={() => removeFollowerMutation.mutate()}
            disabled={removeFollowerMutation.isPending}
          >
            {removeFollowerMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <>
                <UserMinus className="h-4 w-4 mr-2" />
                Remove Follower
              </>
            )}
          </Button>
        ) : (
          <Button
            variant={isFollowing ? "outline" : "default"}
            className="w-full mt-4"
            onClick={() => followMutation.mutate()}
            disabled={followMutation.isPending || hasPendingRequest}
          >
            {followMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : hasPendingRequest ? (
              "Request Pending"
            ) : isFollowing ? (
              "Unfollow"
            ) : (
              "Follow"
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}