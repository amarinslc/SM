import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { insertPostSchema } from "@shared/schema";

interface MediaItem {
  type: "image" | "video";
  file: File;
  previewUrl: string;
}

export function PostForm() {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("content", content);
      media.forEach((item, index) => {
        formData.append(`media_${index}`, item.file);
      });

      const res = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to create post");
      }

      return res.json();
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

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const newMedia: MediaItem[] = [];
    for (const file of Array.from(files)) {
      // Check file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload only image files",
          variant: "destructive",
        });
        continue;
      }

      // Check file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Image size should be less than 5MB",
          variant: "destructive",
        });
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newMedia.push({
        type: "image",
        file,
        previewUrl,
      });
    }

    setMedia([...media, ...newMedia]);
    e.target.value = ""; // Reset input
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => {
      const newMedia = [...prev];
      URL.revokeObjectURL(newMedia[index].previewUrl);
      newMedia.splice(index, 1);
      return newMedia;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() && !media.length) return;
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
          {media.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-4">
              {media.map((item, index) => (
                <div key={index} className="relative">
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="w-full aspect-square object-cover rounded-md"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => removeMedia(index)}
                    type="button"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              ref={fileInputRef}
              onChange={handleImageSelect}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => {
                toast({
                  description: "Video upload will be implemented soon",
                });
              }}
            >
              <Video className="h-4 w-4" />
            </Button>
          </div>
          <Button
            type="submit"
            disabled={createPostMutation.isPending || (!content.trim() && !media.length)}
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