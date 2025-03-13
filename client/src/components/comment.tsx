import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Comment, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface CommentProps {
  comment: Comment;
}

export function CommentView({ comment }: CommentProps) {
  const { data: author } = useQuery<User>({
    queryKey: [`/api/users/${comment.userId}`],
  });

  if (!author) return null;

  return (
    <div className="flex gap-2 py-2">
      <Avatar className="h-8 w-8">
        <AvatarImage src={author.avatar || undefined} />
        <AvatarFallback>{author.name[0]}</AvatarFallback>
      </Avatar>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm">{author.name}</span>
          <span className="text-xs text-muted-foreground">
            {formatDistanceToNow(comment.createdAt || new Date(), { addSuffix: true })}
          </span>
        </div>
        <p className="text-sm">{comment.content}</p>
      </div>
    </div>
  );
}
