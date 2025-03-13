import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface UserCardProps {
  user: User;
  isFollowing: boolean;
}

export function UserCard({ user, isFollowing }: UserCardProps) {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const { data: followRequests } = useQuery({
    queryKey: [`/api/users/${user.id}/requests`],
    enabled: currentUser?.id === user.id,
  });

  const hasPendingRequest = followRequests?.some(
    (req) => req.targetId === user.id && req.requesterId === currentUser?.id
  );

  const followMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/users/${user.id}/${isFollowing ? "unfollow" : "follow"}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/users/${currentUser?.id}/following`],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({
        title: isFollowing ? "Unfollowed" : user.isPrivate ? "Request sent" : "Following",
        description: isFollowing
          ? `You unfollowed ${user.name}`
          : user.isPrivate
          ? `Follow request sent to ${user.name}`
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

  const acceptRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      await apiRequest("POST", `/api/users/requests/${requestId}/accept`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/requests`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${currentUser?.id}/followers`] });
      toast({
        title: "Follow request accepted",
        description: "User can now see your posts",
      });
    },
  });

  const rejectRequestMutation = useMutation({
    mutationFn: async (requestId: number) => {
      await apiRequest("POST", `/api/users/requests/${requestId}/reject`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/requests`] });
      toast({
        title: "Follow request rejected",
      });
    },
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.avatar || undefined} />
          <AvatarFallback>{(user.name || "?")[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold">{user.name}</span>
          <span className="text-sm text-muted-foreground">@{user.username}</span>
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
        {currentUser?.id !== user.id && (
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
        {currentUser?.id === user.id && followRequests && followRequests.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="font-semibold">Follow Requests</h3>
            {followRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between border-b py-2">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={request.requester?.avatar || undefined} />
                    <AvatarFallback>{request.requester?.name[0].toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold text-sm">{request.requester?.name}</div>
                    <div className="text-xs text-muted-foreground">@{request.requester?.username}</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => acceptRequestMutation.mutate(request.id)}
                    disabled={acceptRequestMutation.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => rejectRequestMutation.mutate(request.id)}
                    disabled={rejectRequestMutation.isPending}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}