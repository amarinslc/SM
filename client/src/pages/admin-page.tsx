import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from "date-fns";
import { ShieldAlert, Users } from "lucide-react";

type ReportedPost = {
  id: number;
  content: string;
  media: { type: string; url: string }[];
  is_removed: boolean;
  is_priority_review: boolean;
  report_count: number;
  user_id: number;
  username: string;
  name: string;
  reports: {
    reason: string;
    status: string;
    created_at: string;
    user_id: number;
  }[];
};

function formatReportReason(reason: string): string {
  switch (reason) {
    case "Hateful":
      return "Hateful content";
    case "Harmful_or_Abusive":
      return "Harmful or abusive content";
    case "Criminal_Activity":
      return "Criminal activity";
    case "Sexually_Explicit":
      return "Sexually explicit content";
    default:
      return reason;
  }
}

function ReportedPostCard({ post, onReview }: { post: ReportedPost; onReview: (postId: number, action: 'approve' | 'remove') => void }) {
  const uniqueReasons = [...new Set(post.reports.map(report => report.reason))];
  
  return (
    <Card className={post.is_priority_review ? "border-red-500" : ""}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {post.name && <AvatarFallback>{post.name[0].toUpperCase()}</AvatarFallback>}
            </Avatar>
            <div>
              <div className="font-semibold">{post.name}</div>
              <div className="text-sm text-muted-foreground">@{post.username}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant={post.is_priority_review ? "destructive" : "outline"}>
              {post.report_count} {post.report_count === 1 ? "report" : "reports"}
            </Badge>
            {post.is_removed && <Badge variant="secondary">Removed</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="whitespace-pre-wrap">{post.content}</p>
        {post.media && post.media.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mt-4">
            {post.media.map((media, index) => (
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
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-2">Reported For:</h4>
          <div className="flex flex-wrap gap-1">
            {uniqueReasons.map(reason => (
              <Badge key={reason} variant="outline">
                {formatReportReason(reason)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-2">Report History:</h4>
          <div className="space-y-2 max-h-40 overflow-y-auto text-sm">
            {post.reports.map((report, index) => (
              <div key={index} className="flex justify-between items-center border-b pb-1">
                <div>{formatReportReason(report.reason)}</div>
                <div className="text-muted-foreground">
                  {report.created_at ? format(new Date(report.created_at), 'MMM d, yyyy') : 'Unknown date'}
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <div className="flex gap-2 w-full">
          <Button 
            variant="outline" 
            className="w-1/2" 
            onClick={() => onReview(post.id, 'approve')}
          >
            Approve
          </Button>
          <Button 
            variant="destructive" 
            className="w-1/2" 
            onClick={() => onReview(post.id, 'remove')}
          >
            Remove
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}

type User = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: string;
  followerCount: number;
  followingCount: number;
  removedPostCount: number;
};

function UserManagementCard({ user, onDeleteUser }: { user: User; onDeleteUser: (userId: number) => void }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              {user.name && <AvatarFallback>{user.name[0].toUpperCase()}</AvatarFallback>}
            </Avatar>
            <div>
              <div className="font-semibold">{user.name}</div>
              <div className="text-sm text-muted-foreground">@{user.username}</div>
            </div>
          </div>
          <Badge variant={user.role === 'admin' ? "default" : "outline"}>
            {user.role}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Email:</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Followers:</span>
            <span>{user.followerCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Following:</span>
            <span>{user.followingCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Removed Posts:</span>
            <span>{user.removedPostCount}</span>
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button 
          variant="destructive" 
          size="sm" 
          className="w-full"
          onClick={() => onDeleteUser(user.id)}
          disabled={user.role === 'admin'}
        >
          Delete User
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mainSection, setMainSection] = useState<"moderation" | "users">("moderation");
  const [activeTab, setActiveTab] = useState("all");

  // Redirect if not logged in or not an admin
  if (!user) {
    return <Redirect to="/auth" />;
  }
  
  if (user.role !== 'admin') {
    return <Redirect to="/" />;
  }

  // Query for reported posts
  const { 
    data: reportedPosts, 
    isLoading: isPostsLoading, 
    isError: isPostsError, 
    error: postsError 
  } = useQuery<ReportedPost[]>({
    queryKey: ['/api/admin/reported-posts'],
    enabled: mainSection === "moderation",
  });

  // Query for all users for user management
  const {
    data: allUsers,
    isLoading: isUsersLoading,
    isError: isUsersError,
    error: usersError
  } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
    enabled: mainSection === "users",
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ postId, action }: { postId: number; action: 'approve' | 'remove' }) => {
      const res = await apiRequest("POST", `/api/admin/review-post/${postId}`, { action });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/reported-posts'] });
      toast({
        title: "Post review completed",
        description: "The post has been successfully reviewed."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Review failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleReview = (postId: number, action: 'approve' | 'remove') => {
    reviewMutation.mutate({ postId, action });
  };
  
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({
        title: "User deleted",
        description: "The user has been successfully removed from the platform."
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleDeleteUser = (userId: number) => {
    if (confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
      deleteUserMutation.mutate(userId);
    }
  };

  const filteredPosts = (reportedPosts || []).filter(post => {
    if (activeTab === "all") return true;
    if (activeTab === "priority") return post.is_priority_review;
    if (activeTab === "removed") return post.is_removed;
    return false;
  });

  const priorityCount = (reportedPosts || []).filter(post => post.is_priority_review).length;
  const removedCount = (reportedPosts || []).filter(post => post.is_removed).length;

  // Loading states
  const isLoading = (mainSection === "moderation" && isPostsLoading) || 
                   (mainSection === "users" && isUsersLoading);
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading data...</p>
        </div>
      </div>
    );
  }

  // Error states
  if (mainSection === "moderation" && isPostsError) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <p className="text-destructive">Error loading reported posts: {postsError instanceof Error ? postsError.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
  
  if (mainSection === "users" && isUsersError) {
    return (
      <div className="flex justify-center items-center h-96">
        <div className="text-center">
          <p className="text-destructive">Error loading users: {usersError instanceof Error ? usersError.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <div className="flex space-x-2">
          <Button
            variant={mainSection === "moderation" ? "default" : "outline"}
            onClick={() => setMainSection("moderation")}
            className="flex items-center gap-1"
          >
            <ShieldAlert className="h-4 w-4 mr-1" />
            <span>Content Moderation</span>
            {reportedPosts && reportedPosts.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {reportedPosts.filter(post => post.is_priority_review).length > 0
                  ? reportedPosts.filter(post => post.is_priority_review).length
                  : reportedPosts.length}
              </Badge>
            )}
          </Button>
          <Button
            variant={mainSection === "users" ? "default" : "outline"}
            onClick={() => setMainSection("users")}
            className="flex items-center gap-1"
          >
            <Users className="h-4 w-4 mr-1" />
            User Management
          </Button>
        </div>
      </div>
      
      {mainSection === "moderation" && (
        <>
          <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">
                All Reports ({reportedPosts?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="priority">
                Priority ({priorityCount})
              </TabsTrigger>
              <TabsTrigger value="removed">
                Removed ({removedCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-4">
              {filteredPosts.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">No reported posts to review</p>
                  </CardContent>
                </Card>
              ) : (
                filteredPosts.map(post => (
                  <ReportedPostCard 
                    key={post.id} 
                    post={post} 
                    onReview={handleReview} 
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="priority" className="space-y-4">
              {filteredPosts.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">No priority reports to review</p>
                  </CardContent>
                </Card>
              ) : (
                filteredPosts.map(post => (
                  <ReportedPostCard 
                    key={post.id} 
                    post={post} 
                    onReview={handleReview} 
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="removed" className="space-y-4">
              {filteredPosts.length === 0 ? (
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-center text-muted-foreground">No removed posts</p>
                  </CardContent>
                </Card>
              ) : (
                filteredPosts.map(post => (
                  <ReportedPostCard 
                    key={post.id} 
                    post={post} 
                    onReview={handleReview} 
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
      
      {mainSection === "users" && (
        <>
          <h2 className="text-2xl font-semibold mb-4">User Management</h2>
          
          {allUsers && allUsers.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {allUsers.map(userData => (
                <UserManagementCard 
                  key={userData.id} 
                  user={userData} 
                  onDeleteUser={handleDeleteUser} 
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No users found</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}