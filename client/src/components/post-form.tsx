import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImagePlus, Loader2, Video, X } from "lucide-react";
import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";

interface MediaItem {
  type: "image" | "video";
  file: File;
  previewUrl: string;
}

export function PostForm() {
  const [content, setContent] = useState("");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const createPostMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("content", content);
      media.forEach((item) => {
        formData.append("media", item.file);
      });

      const res = await fetch("/api/posts", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to create post");
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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>, type: "image" | "video") => {
    const files = e.target.files;
    if (!files?.length) return;

    const newMedia: MediaItem[] = [];
    for (const file of Array.from(files)) {
      // Check file type
      if (type === "image" && !file.type.startsWith("image/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload only image files",
          variant: "destructive",
        });
        continue;
      }

      if (type === "video" && !file.type.startsWith("video/")) {
        toast({
          title: "Invalid file type",
          description: "Please upload only video files",
          variant: "destructive",
        });
        continue;
      }

      // Check file size (50MB limit for videos, 5MB for images)
      const maxSize = type === "video" ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast({
          title: "File too large",
          description: `${type === "video" ? "Video" : "Image"} size should be less than ${maxSize / (1024 * 1024)}MB`,
          variant: "destructive",
        });
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      newMedia.push({
        type,
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
                  {item.type === "video" ? (
                    <video
                      src={item.previewUrl}
                      controls
                      className="w-full aspect-square object-cover rounded-md"
                    />
                  ) : (
                    <img
                      src={item.previewUrl}
                      alt=""
                      className="w-full aspect-square object-cover rounded-md"
                    />
                  )}
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
              onChange={(e) => handleFileSelect(e, "image")}
            />
            <input
              type="file"
              accept="video/*"
              className="hidden"
              ref={videoInputRef}
              onChange={(e) => handleFileSelect(e, "video")}
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
              onClick={() => videoInputRef.current?.click()}
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