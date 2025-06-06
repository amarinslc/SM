import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Comment, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Link } from "wouter";

interface CommentProps {
  comment: Comment;
}

export function CommentView({ comment }: CommentProps) {
  const { data: authorData } = useQuery<{ user: User; isFollowing: boolean; isPending: boolean }>({
    queryKey: [`/api/users/${comment.userId}`],
  });
  
  // Extract author from the response
  const author = authorData?.user;

  if (!author) return null;

  return (
    <div className="flex gap-2 py-2">
      <Link href={`/profile/${author.id}`}>
        <a>
          <Avatar className="h-8 w-8">
            {author.photo ? (
              <AvatarImage 
                src={author.photo.startsWith('/') || author.photo.startsWith('http') 
                  ? author.photo 
                  : `/${author.photo}`}
                onError={(e) => {
                  // Hide the image immediately if it fails to load
                  e.currentTarget.style.display = 'none';
                  // Make sure fallback is visible
                  const fallback = e.currentTarget.parentElement?.querySelector('[role="img"]') as HTMLElement;
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <AvatarFallback>{author.name[0].toUpperCase()}</AvatarFallback>
          </Avatar>
        </a>
      </Link>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <Link href={`/profile/${author.id}`}>
            <a className="font-semibold text-sm hover:underline">{author.name}</a>
          </Link>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(comment.createdAt || new Date(), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm">{comment.content}</p>
      </div>
    </div>
  );
}