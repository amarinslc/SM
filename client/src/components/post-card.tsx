import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Post, User } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const { data: author } = useQuery<User>({
    queryKey: [`/api/users/${post.userId}`],
  });

  if (!author) return null;

  return (
    <Card className="w-full">
      <CardHeader className="flex-row space-x-4 items-center">
        <Avatar>
          <AvatarImage src={author.avatar} />
          <AvatarFallback>{author.name[0]}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-semibold">{author.name}</span>
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap">{post.content}</p>
        {post.media && post.media.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {post.media.map((media: any, index: number) => (
              <div key={index} className="relative aspect-square">
                {media.type === "image" ? (
                  <img
                    src={media.url}
                    alt=""
                    className="object-cover w-full h-full rounded-md"
                  />
                ) : (
                  <video
                    src={media.url}
                    controls
                    className="object-cover w-full h-full rounded-md"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
