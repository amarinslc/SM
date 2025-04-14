import React from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface ReportPostDialogProps {
  isOpen: boolean;
  onClose: () => void;
  postId: number;
}

export function ReportPostDialog({ isOpen, onClose, postId }: ReportPostDialogProps) {
  const [reason, setReason] = React.useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reportMutation = useMutation({
    mutationFn: async (data: { postId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/posts/${data.postId}/report`, { reason: data.reason });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/feed"] }); 
      toast({
        title: "Post reported",
        description: "Thank you for helping keep our community safe.",
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Failed to report post",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason) {
      toast({
        title: "Please select a reason",
        description: "You must select a reason for reporting this post.",
        variant: "destructive",
      });
      return;
    }

    reportMutation.mutate({ postId, reason });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Report Post</DialogTitle>
          <DialogDescription>
            Please select the reason why you&apos;re reporting this post.
            Posts that violate community guidelines will be removed.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="reason">Reason for reporting</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="reason">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Hateful">Hateful content</SelectItem>
                  <SelectItem value="Harmful_or_Abusive">Harmful or abusive content</SelectItem>
                  <SelectItem value="Criminal_Activity">Criminal activity</SelectItem>
                  <SelectItem value="Sexually_Explicit">Sexually explicit content</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              type="button" 
              onClick={onClose}
              disabled={reportMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={!reason || reportMutation.isPending}
            >
              {reportMutation.isPending ? "Reporting..." : "Report Post"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}