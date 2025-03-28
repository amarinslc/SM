import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Post, User, Comment } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow, differenceInHours, format } from "date-fns";
import { CommentView } from "./comment";
import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";

interface PostCardProps {
  post: Post;
}

export function PostCard({ post }: PostCardProps) {
  const [newComment, setNewComment] = useState("");
  const { toast } = useToast();
  const { user: currentUser } = useAuth();

  const { data: author } = useQuery<User>({
    queryKey: [`/api/users/${post.userId}`],
  });

  const { data: comments } = useQuery<Comment[]>({
    queryKey: [`/api/posts/${post.id}/comments`],
  });

  const deletePostMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/posts/${post.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${post.userId}`] });
      toast({
        title: "Post deleted",
        description: "Your post has been removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createCommentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/posts/${post.id}/comments`, {
        content: newComment,
      });
      return res.json();
    },
    onSuccess: () => {
      setNewComment("");
      queryClient.invalidateQueries({ queryKey: [`/api/posts/${post.id}/comments`] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to post comment",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!author) return null;

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    createCommentMutation.mutate();
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex-row space-x-4 items-center">
        <Link href={`/profile/${author.id}`}>
          <Avatar className="cursor-pointer">
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
        </Link>
        <div className="flex flex-col">
          <Link href={`/profile/${author.id}`}>
            <a className="font-semibold hover:underline">{author.name}</a>
          </Link>
          <span className="text-sm text-muted-foreground">
            {differenceInHours(new Date(), new Date(post.createdAt || new Date())) < 24 
              ? formatDistanceToNow(new Date(post.createdAt || new Date()), { addSuffix: true })
              : format(new Date(post.createdAt || new Date()), 'MMMM d, yyyy')}
          </span>
        </div>
        {currentUser?.id === author.id && (
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto"
            onClick={() => deletePostMutation.mutate()}
            disabled={deletePostMutation.isPending}
          >
            {deletePostMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap">{post.content}</p>
        {Array.isArray(post.media) && post.media.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {post.media.map((media: { type: string; url: string }, index: number) => (
              <div key={index} className="relative aspect-square">
                {media.type === "video" ? (
                  <video
                    src={media.url}
                    controls
                    className="object-cover w-full h-full rounded-md"
                  />
                ) : (
                  <img
                    src={media.url}
                    alt=""
                    className="object-cover w-full h-full rounded-md"
                  />
                )}
              </div>
            ))}
          </div>
        )}
        {comments && comments.length > 0 && (
          <div className="mt-4 space-y-2 border-t pt-4">
            {comments.map((comment) => (
              <CommentView key={comment.id} comment={comment} />
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmitComment} className="w-full space-y-2">
          <Textarea
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="resize-none"
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={createCommentMutation.isPending || !newComment.trim()}
            >
              {createCommentMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Comment"
              )}
            </Button>
          </div>
        </form>
      </CardFooter>
    </Card>
  );
}