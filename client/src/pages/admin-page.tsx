import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Search, UserX, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { User } from "@shared/schema";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [isVerifyingPhotos, setIsVerifyingPhotos] = useState(false);
  const [isVerifyingMedia, setIsVerifyingMedia] = useState(false);
  const [verificationResults, setVerificationResults] = useState<any>(null);

  // User search state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Only allow access if the user is authenticated
  if (!user) {
    return <Redirect to="/auth" />;
  }
  
  // Check if user has admin role
  if (user.role !== 'admin') {
    return (
      <div className="container mx-auto py-10">
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You do not have permission to access the admin area.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="mb-4">This area is restricted to administrators only.</p>
            <Button onClick={() => window.history.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Search users query
  const { data: searchResults, isLoading: isSearching } = useQuery<User[]>({
    queryKey: ["/api/users/search", debouncedSearchQuery],
    queryFn: async () => {
      if (!debouncedSearchQuery || debouncedSearchQuery.length < 2) return [];
      const response = await apiRequest("GET", `/api/users/search?q=${encodeURIComponent(debouncedSearchQuery)}`);
      return response.json();
    },
    enabled: debouncedSearchQuery.length >= 2,
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const response = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      // Close the dialog
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      
      // Invalidate search results
      queryClient.invalidateQueries({ queryKey: ["/api/users/search"] });
      
      toast({
        title: "User Deleted",
        description: "The user has been permanently removed from the platform.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Deletion Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const verifyAllFiles = async () => {
    setIsVerifyingAll(true);
    setVerificationResults(null);
    
    try {
      const response = await apiRequest("POST", "/api/admin/verify-files");
      const results = await response.json();
      setVerificationResults(results);
      
      toast({
        title: "Verification Complete",
        description: "All files have been verified and repaired where possible.",
      });
    } catch (error) {
      console.error("Error verifying files:", error);
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "An error occurred during verification",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingAll(false);
    }
  };

  const verifyUserPhotos = async () => {
    setIsVerifyingPhotos(true);
    setVerificationResults(null);
    
    try {
      const response = await apiRequest("POST", "/api/admin/verify-user-photos");
      const results = await response.json();
      setVerificationResults(results);
      
      toast({
        title: "User Photo Verification Complete",
        description: "User photos have been verified and repaired where possible.",
      });
    } catch (error) {
      console.error("Error verifying user photos:", error);
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "An error occurred during verification",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingPhotos(false);
    }
  };

  const verifyPostMedia = async () => {
    setIsVerifyingMedia(true);
    setVerificationResults(null);
    
    try {
      const response = await apiRequest("POST", "/api/admin/verify-post-media");
      const results = await response.json();
      setVerificationResults(results);
      
      toast({
        title: "Post Media Verification Complete",
        description: "Post media has been verified and repaired where possible.",
      });
    } catch (error) {
      console.error("Error verifying post media:", error);
      toast({
        title: "Verification Failed",
        description: error instanceof Error ? error.message : "An error occurred during verification",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingMedia(false);
    }
  };

  // State for user management
  const [usernameToPromote, setUsernameToPromote] = useState('');
  const [isPromoting, setIsPromoting] = useState(false);

  const promoteUser = async () => {
    if (!usernameToPromote.trim()) {
      toast({
        title: "Error",
        description: "Please enter a username",
        variant: "destructive",
      });
      return;
    }

    setIsPromoting(true);
    try {
      const response = await apiRequest("POST", `/api/admin/promote/${usernameToPromote}`);
      const result = await response.json();
      
      toast({
        title: "User Promoted",
        description: result.message,
      });
      
      // Clear the input field
      setUsernameToPromote('');
    } catch (error) {
      console.error("Error promoting user:", error);
      toast({
        title: "Promotion Failed",
        description: error instanceof Error ? error.message : "An error occurred while promoting the user",
        variant: "destructive",
      });
    } finally {
      setIsPromoting(false);
    }
  };

  return (
    <div className="container mx-auto py-10">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>User Management</CardTitle>
            <CardDescription>
              Promote users to administrator role
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <div className="flex items-center space-x-2">
                <input 
                  type="text" 
                  value={usernameToPromote}
                  onChange={(e) => setUsernameToPromote(e.target.value)}
                  placeholder="Enter username to promote"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                />
                <Button 
                  onClick={promoteUser} 
                  disabled={isPromoting || !usernameToPromote.trim()}
                >
                  {isPromoting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Promoting...
                    </>
                  ) : (
                    "Promote to Admin"
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                This will grant administrator privileges to the specified user.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Current Admin</CardTitle>
            <CardDescription>
              Your administrator profile
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-primary font-bold">{user.username.charAt(0).toUpperCase()}</span>
              </div>
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-muted-foreground">Role: {user.role}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Search and Delete Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>User Removal Tool</CardTitle>
          <CardDescription>
            Search and remove users from the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="flex items-center space-x-2 relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users by username or name"
                className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background"
              />
            </div>
            
            <div className="bg-muted rounded-md p-4 min-h-[120px]">
              {isSearching ? (
                <div className="flex justify-center items-center h-[120px]">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : !debouncedSearchQuery ? (
                <div className="flex flex-col items-center justify-center h-[120px] text-muted-foreground">
                  <Search className="h-8 w-8 mb-2" />
                  <p>Search for users to manage</p>
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="space-y-3 max-h-[400px] overflow-y-auto">
                  {searchResults.map((searchedUser) => (
                    <div key={searchedUser.id} className="flex justify-between items-center p-3 bg-background rounded-md">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          {searchedUser.photo ? (
                            <AvatarImage 
                              src={searchedUser.photo && (searchedUser.photo.startsWith('/') || searchedUser.photo.startsWith('http')) 
                                ? searchedUser.photo 
                                : searchedUser.photo ? `/${searchedUser.photo}` : ''}
                              alt={`${searchedUser.name}'s profile photo`}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.parentElement?.querySelector('[role="img"]') as HTMLElement;
                                if (fallback) fallback.style.display = 'flex';
                              }}
                            />
                          ) : null}
                          <AvatarFallback>{searchedUser.name[0].toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{searchedUser.name}</p>
                          <p className="text-sm text-muted-foreground">@{searchedUser.username}</p>
                        </div>
                      </div>
                      
                      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                        <DialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            disabled={searchedUser.id === user.id} // Can't delete yourself
                            onClick={() => setUserToDelete(searchedUser)}
                          >
                            <UserX className="h-4 w-4 mr-2" />
                            Remove
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                              <AlertTriangle className="h-5 w-5 text-destructive" />
                              Confirm User Deletion
                            </DialogTitle>
                            <DialogDescription>
                              This action is permanent and cannot be undone. The user's content, including posts and comments, will also be removed.
                            </DialogDescription>
                          </DialogHeader>
                          
                          {userToDelete && (
                            <div className="flex items-center gap-3 p-4 bg-muted rounded-md">
                              <Avatar className="h-10 w-10">
                                {userToDelete.photo ? (
                                  <AvatarImage 
                                    src={userToDelete.photo}
                                    alt={`${userToDelete.name}'s profile photo`}
                                  />
                                ) : null}
                                <AvatarFallback>{userToDelete.name[0].toUpperCase()}</AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{userToDelete.name}</p>
                                <p className="text-sm text-muted-foreground">@{userToDelete.username}</p>
                              </div>
                            </div>
                          )}
                          
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                              Cancel
                            </Button>
                            <Button 
                              variant="destructive" 
                              onClick={() => userToDelete && deleteUserMutation.mutate(userToDelete.id)}
                              disabled={deleteUserMutation.isPending}
                            >
                              {deleteUserMutation.isPending ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Deleting...
                                </>
                              ) : (
                                "Delete User"
                              )}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-[120px] text-muted-foreground">
                  <p>No users found matching "{debouncedSearchQuery}"</p>
                </div>
              )}
            </div>
            
            <p className="text-sm text-muted-foreground">
              <AlertTriangle className="h-4 w-4 inline-block mr-1 text-amber-500" />
              Removing a user will permanently delete their account, posts, and comments.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>File Verification Tools</CardTitle>
          <CardDescription>
            Verify and repair file references in the database
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="mb-4">
              <TabsTrigger value="all">All Files</TabsTrigger>
              <TabsTrigger value="photos">User Photos</TabsTrigger>
              <TabsTrigger value="media">Post Media</TabsTrigger>
            </TabsList>
            
            <TabsContent value="all">
              <Card>
                <CardHeader>
                  <CardTitle>Verify All Files</CardTitle>
                  <CardDescription>
                    Check all user photos and post media and repair broken references
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={verifyAllFiles} 
                    disabled={isVerifyingAll}
                  >
                    {isVerifyingAll ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Start Verification"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="photos">
              <Card>
                <CardHeader>
                  <CardTitle>Verify User Photos</CardTitle>
                  <CardDescription>
                    Check user profile photos and repair broken references
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={verifyUserPhotos} 
                    disabled={isVerifyingPhotos}
                  >
                    {isVerifyingPhotos ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify User Photos"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="media">
              <Card>
                <CardHeader>
                  <CardTitle>Verify Post Media</CardTitle>
                  <CardDescription>
                    Check post media and repair broken references
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button 
                    onClick={verifyPostMedia} 
                    disabled={isVerifyingMedia}
                  >
                    {isVerifyingMedia ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      "Verify Post Media"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
      
      {verificationResults && (
        <Card>
          <CardHeader>
            <CardTitle>Verification Results</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">
              {JSON.stringify(verificationResults, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}