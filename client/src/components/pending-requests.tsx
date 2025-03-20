import { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { Link } from "wouter";

interface PendingRequestsProps {
  requests: Array<{
    id: number;
    follower: User;
    createdAt: string;
  }>;
}

export function PendingRequests({ requests }: PendingRequestsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const acceptMutation = useMutation({
    mutationFn: async (followerId: number) => {
      await apiRequest("POST", `/api/users/requests/${followerId}/accept`);
    },
    onSuccess: () => {
      // Use consistent query key pattern for invalidation
      queryClient.invalidateQueries({ 
        queryKey: ["/api/users"],
        refetchType: "all" 
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/feed"],
        refetchType: "all"
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/users", "requests"],
        refetchType: "all"
      });
      toast({ title: "Follow request accepted" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (followerId: number) => {
      await apiRequest("POST", `/api/users/requests/${followerId}/reject`);
    },
    onSuccess: () => {
      // Use consistent query key pattern for invalidation
      queryClient.invalidateQueries({ 
        queryKey: ["/api/users"],
        refetchType: "all"
      });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/users", "requests"],
        refetchType: "all"
      });
      toast({ title: "Follow request rejected" });
    },
  });

  if (!requests.length) {
    return null;
  }

  return (
    <div className="rounded-lg bg-card p-4 space-y-4">
      <h2 className="font-semibold">Follow Requests</h2>
      <div className="space-y-3">
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between">
            <Link href={`/profile/${request.follower.id}`}>
              <div className="flex items-center gap-2 cursor-pointer">
                <Avatar>
                  <AvatarImage src={request.follower.photo || undefined} />
                  <AvatarFallback>{request.follower.name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{request.follower.name}</div>
                  <div className="text-sm text-muted-foreground">@{request.follower.username}</div>
                </div>
              </div>
            </Link>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => acceptMutation.mutate(request.id)}
                disabled={acceptMutation.isPending || rejectMutation.isPending}
              >
                {acceptMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Accept"
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => rejectMutation.mutate(request.id)}
                disabled={acceptMutation.isPending || rejectMutation.isPending}
              >
                {rejectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Reject"
                )}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}