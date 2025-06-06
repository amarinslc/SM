import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

// Define the response type that includes relationship status
type UserResponse = {
  user: SelectUser;
  isFollowing: boolean;
  isPending: boolean;
};

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<UserResponse, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<UserResponse, Error, FormData | InsertUser>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: userResponse,
    error,
    isLoading,
  } = useQuery<UserResponse | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // Extract just the user from the response
  const user = userResponse?.user;

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const res = await apiRequest("POST", "/api/login", credentials);
      return await res.json();
    },
    onSuccess: (response: UserResponse) => {
      queryClient.setQueryData(["/api/user"], response);
      // Clear all existing queries and refetch feed data
      queryClient.removeQueries({ queryKey: ["/api/feed"] });
      queryClient.removeQueries({ queryKey: ["/api/users"] });
      queryClient.refetchQueries({ queryKey: ["/api/feed"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Login failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: FormData | InsertUser) => {
      const options: RequestInit = {
        method: 'POST',
        credentials: 'include',
      };

      if (credentials instanceof FormData) {
        options.body = credentials;
      } else {
        options.headers = { 'Content-Type': 'application/json' };
        options.body = JSON.stringify(credentials);
      }

      const res = await fetch('/api/register', options);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return await res.json();
    },
    onSuccess: (response: UserResponse) => {
      queryClient.setQueryData(["/api/user"], response);
      // Clear cached data and refetch feed
      queryClient.removeQueries({ queryKey: ["/api/feed"] });
      queryClient.removeQueries({ queryKey: ["/api/users"] });
      queryClient.refetchQueries({ queryKey: ["/api/feed"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      // Clear all cached data on logout
      queryClient.clear();
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}