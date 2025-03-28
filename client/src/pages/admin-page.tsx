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

  return (
    <div className="container mx-auto py-10">
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Admin Tools</CardTitle>
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