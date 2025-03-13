import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { User } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
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

  const followMutation = useMutation({
    mutationFn: async () => {
      await apiRequest(
        "POST",
        `/api/users/${user.id}/${isFollowing ? "unfollow" : "follow"}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}`] });
      queryClient.invalidateQueries({
        queryKey: [`/api/users/${currentUser?.id}/following`],
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

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={user.avatar} />
          <AvatarFallback>{user.name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold">{user.name}</span>
          <span className="text-sm text-muted-foreground">@{user.username}</span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">{user.bio}</p>
        <div className="flex gap-4">
          <div>
            <span className="font-semibold">{user.followerCount}</span>
            <span className="text-sm text-muted-foreground ml-1">followers</span>
          </div>
          <div>
            <span className="font-semibold">{user.followingCount}</span>
            <span className="text-sm text-muted-foreground ml-1">following</span>
          </div>
        </div>
        {currentUser?.id !== user.id && (
          <Button
            variant={isFollowing ? "outline" : "default"}
            className="w-full mt-4"
            onClick={() => followMutation.mutate()}
            disabled={followMutation.isPending}
          >
            {followMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
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
