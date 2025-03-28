import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { User } from "@shared/schema";
import { UserCard } from "./user-card";
import { Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface UserListDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  users?: User[];
  isLoading: boolean;
}

export function UserListDrawer({ open, onClose, title, users, isLoading }: UserListDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onClose}>
      <DrawerContent className="max-h-[70vh]">
        <DrawerHeader className="border-b">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <ScrollArea className="p-4 h-[50vh]">
          <div className="space-y-4 pr-4">
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : users?.length ? (
              users.map((user) => (
                <UserCard key={user.id} user={user} isFollowing={false} />
              ))
            ) : (
              <p className="text-muted-foreground text-center">No users found</p>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
