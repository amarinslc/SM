import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { Redirect } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isVerifyingAll, setIsVerifyingAll] = useState(false);
  const [isVerifyingPhotos, setIsVerifyingPhotos] = useState(false);
  const [isVerifyingMedia, setIsVerifyingMedia] = useState(false);
  const [verificationResults, setVerificationResults] = useState<any>(null);

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