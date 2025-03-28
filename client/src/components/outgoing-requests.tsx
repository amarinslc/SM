import { User } from "@shared/schema";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";

interface OutgoingRequestsProps {
  requests: Array<{
    id: number;
    following: User;
    createdAt: string;
  }>;
}

export function OutgoingRequests({ requests }: OutgoingRequestsProps) {
  if (!requests.length) {
    return null;
  }

  return (
    <div className="rounded-lg bg-card p-4 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold">Outgoing Follow Requests</h2>
        <Badge variant="secondary">{requests.length}</Badge>
      </div>
      <div className="space-y-3 max-h-60 overflow-y-auto">
        {requests.map((request) => (
          <div key={request.id} className="flex items-center justify-between">
            <Link href={`/profile/${request.following.id}`}>
              <div className="flex items-center gap-2 cursor-pointer">
                <Avatar>
                  {request.following.photo ? (
                    <AvatarImage 
                      src={request.following.photo} 
                      alt={`${request.following.name}'s profile photo`} 
                      onError={(e) => {
                        // If image fails to load, show fallback
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('[role="img"]') as HTMLElement;
                        if (fallback) fallback.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <AvatarFallback>{request.following.name[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{request.following.name}</div>
                  <div className="text-sm text-muted-foreground">@{request.following.username}</div>
                </div>
              </div>
            </Link>
            <Badge variant="outline">Pending</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}