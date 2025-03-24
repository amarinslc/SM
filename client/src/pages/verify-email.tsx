import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function VerifyEmailPage() {
  const [location] = useLocation();
  const token = new URLSearchParams(location.split('?')[1]).get('token');

  const { isLoading, isError, isSuccess } = useQuery({
    queryKey: ['verify-email', token],
    queryFn: async () => {
      if (!token) throw new Error('No verification token provided');
      const response = await fetch(`/api/verify-email/${token}`);
      if (!response.ok) {
        throw new Error('Failed to verify email');
      }
      return response.json();
    },
    enabled: !!token,
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-[#FFF1E0] flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-red-500">Invalid Link</CardTitle>
            <CardDescription>
              This verification link appears to be invalid.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => window.location.href = '/auth'}
              className="w-full bg-[#87BA8E] hover:bg-[#87BA8E]/90 rounded-full"
            >
              Return to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFF1E0] flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {isLoading ? 'Verifying Email...' : 
             isError ? 'Verification Failed' :
             isSuccess ? 'Email Verified!' : 'Checking Status...'}
          </CardTitle>
          <CardDescription>
            {isLoading ? 'Please wait while we verify your email address.' :
             isError ? 'We could not verify your email address. The link may have expired.' :
             isSuccess ? 'Your email has been successfully verified.' : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#87BA8E]" />
            </div>
          ) : (
            <Button
              onClick={() => window.location.href = '/auth'}
              className="w-full bg-[#87BA8E] hover:bg-[#87BA8E]/90 rounded-full"
            >
              {isSuccess ? 'Proceed to Login' : 'Try Again'}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
