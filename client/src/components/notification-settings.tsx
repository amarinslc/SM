import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BellRing, BellOff, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  isPushNotificationSupported, 
  requestNotificationPermission, 
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  getExistingSubscription
} from "@/lib/push-notifications";

export function NotificationSettings() {
  const { toast } = useToast();
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission | "unsupported">(
    isPushNotificationSupported() ? Notification.permission : "unsupported"
  );
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Check subscription status on mount
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isPushNotificationSupported()) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      try {
        const subscription = await getExistingSubscription();
        setIsSubscribed(!!subscription);
      } catch (error) {
        console.error("Error checking subscription:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkSubscription();
  }, []);

  // Update permission status if it changes
  useEffect(() => {
    if (isPushNotificationSupported()) {
      const updatePermissionStatus = () => {
        setPermissionStatus(Notification.permission);
      };

      // Set initial status
      updatePermissionStatus();

      // Listen for permission changes (not fully supported in all browsers)
      if (navigator.permissions) {
        navigator.permissions.query({ name: 'notifications' }).then(permissionStatus => {
          permissionStatus.onchange = updatePermissionStatus;
        });
      }
    }
  }, []);

  const handleToggleNotifications = async (enabled: boolean) => {
    setIsLoading(true);
    
    try {
      if (enabled) {
        // Request permission if not granted
        if (permissionStatus !== "granted") {
          const permission = await requestNotificationPermission();
          setPermissionStatus(permission);
          
          // Exit if permission was denied
          if (permission !== "granted") {
            toast({
              title: "Permission denied",
              description: "Please enable notifications in your browser settings.",
              variant: "destructive"
            });
            setIsLoading(false);
            return;
          }
        }
        
        // Subscribe to push notifications
        await subscribeToPushNotifications();
        setIsSubscribed(true);
        
        toast({
          title: "Notifications enabled",
          description: "You'll now receive push notifications for new follower requests and posts.",
        });
      } else {
        // Unsubscribe from push notifications
        await unsubscribeFromPushNotifications();
        setIsSubscribed(false);
        
        toast({
          title: "Notifications disabled",
          description: "You won't receive push notifications anymore.",
        });
      }
    } catch (error) {
      console.error("Error toggling notifications:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update notification settings",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (permissionStatus === "unsupported") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <CardDescription>
            Push notifications are not supported in your browser.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {isSubscribed ? (
            <BellRing className="h-5 w-5 text-primary" />
          ) : (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          )}
          Push Notifications
        </CardTitle>
        <CardDescription>
          Get notified about new follower requests and posts from people you follow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium">
              {isSubscribed 
                ? "Notifications are enabled" 
                : permissionStatus === "denied" 
                  ? "Notifications are blocked by your browser" 
                  : "Enable push notifications"}
            </p>
            {permissionStatus === "denied" && (
              <p className="text-xs text-muted-foreground mt-1">
                Please update your browser settings to allow notifications from this site.
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isLoading ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Switch
                checked={isSubscribed || false}
                onCheckedChange={handleToggleNotifications}
                disabled={isLoading || permissionStatus === "denied"}
                aria-label="Toggle notifications"
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}