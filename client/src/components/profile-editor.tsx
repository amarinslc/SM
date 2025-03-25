import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { User } from "@shared/schema";
import { Loader2, Image as ImageIcon } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  bio: z.string().optional(),
  photo: z.any().optional(),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export function ProfileEditor({ user, onSuccess }: { user: User; onSuccess?: () => void }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user.photo || null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user.name || "",
      bio: user.bio || "",
    },
  });

  const onSubmit = async (data: ProfileFormData) => {
    setIsSubmitting(true);
    try {
      // Create FormData for multipart/form-data submission
      const formData = new FormData();

      // Only include fields that have changed
      if (data.name !== user.name) {
        formData.append('name', data.name);
      }

      if (data.bio !== user.bio) {
        formData.append('bio', data.bio || '');
      }

      // Handle photo upload
      const photoInput = form.watch('photo');
      if (photoInput instanceof FileList && photoInput.length > 0) {
        formData.append('photo', photoInput[0]);
      }

      // Only proceed if there are actual changes
      if (formData.entries().next().done) {
        toast({
          title: "No changes detected",
          description: "Make some changes before saving.",
        });
        return;
      }

      const response = await fetch('/api/user/profile', {
        method: 'PATCH',
        body: formData, // FormData automatically sets the correct Content-Type
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || 'Failed to update profile');
      }

      const updatedUser = await response.json();

      // Invalidate user queries to refresh the data
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });

      toast({
        title: "Success",
        description: "Your profile has been updated.",
      });

      onSuccess?.();
    } catch (error) {
      console.error('Profile update error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="p-6">
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Photo upload section */}
          <div className="flex flex-col items-center space-y-4">
            <Avatar className="w-24 h-24">
              {photoPreview ? (
                <AvatarImage src={photoPreview} alt="Profile" />
              ) : (
                <AvatarFallback>
                  <ImageIcon className="w-12 h-12 text-muted-foreground" />
                </AvatarFallback>
              )}
            </Avatar>

            <FormField
              control={form.control}
              name="photo"
              render={({ field: { onChange, value, ...field } }) => (
                <FormItem>
                  <FormLabel className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
                    Change Photo
                    <Input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          onChange(e.target.files);
                          setPhotoPreview(URL.createObjectURL(file));
                        }
                      }}
                      {...field}
                    />
                  </FormLabel>
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="bio"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bio</FormLabel>
                <FormControl>
                  <Textarea {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </form>
      </Form>
    </Card>
  );
}