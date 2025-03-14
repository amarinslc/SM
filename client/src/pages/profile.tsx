import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ProfileEditor } from "@/components/profile-editor";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ProfilePage() {
  const [location] = useLocation();
  const { data: user, isLoading } = useQuery({
    queryKey: ["/api/user"],
  });

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!user) {
    return <div>Please log in to view your profile.</div>;
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <h1 className="text-2xl font-bold mb-6">Profile Settings</h1>
      
      <Tabs defaultValue="profile" className="w-full max-w-2xl">
        <TabsList>
          <TabsTrigger value="profile">Profile Information</TabsTrigger>
          <TabsTrigger value="account">Account Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="profile">
          <ProfileEditor user={user} />
        </TabsContent>
        
        <TabsContent value="account">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Username cannot be changed: {user.username}
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
