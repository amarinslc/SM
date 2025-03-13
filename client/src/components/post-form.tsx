import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImagePlus, Loader2, Video } from "lucide-react";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { insertPostSchema } from "@shared/schema";

interface MediaItem {
  type: "image" | "video";
  url: string;
}

export function PostForm() {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const { toast } = useToast();

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const result = insertPostSchema.safeParse({
        content,
        media,
      });

      if (!result.success) {
        throw new Error("Invalid post data");
      }

      const res = await apiRequest("POST", "/api/posts", result.data);
      return await res.json();
    },
    onSuccess: () => {
      setContent("");
      setMedia([]);
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] });
      toast({
        title: "Post created",
        description: "Your post has been shared successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create post",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    createPostMutation.mutate();
  };

  return (
    <Card>
      <form onSubmit={handleSubmit}>
        <CardContent className="pt-6">
          <Textarea
            placeholder="What's on your mind?"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="min-h-[100px]"
          />
        </CardContent>
        <CardFooter className="justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                toast({
                  description: "Image upload not implemented in this demo",
                });
              }}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                toast({
                  description: "Video upload not implemented in this demo",
                });
              }}
            >
              <Video className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="submit"
            disabled={createPostMutation.isPending || !content.trim()}
          >
            {createPostMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Post"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}