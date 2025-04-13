import { ScrollArea } from "@/components/ui/scroll-area";

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Privacy Policy for Dunbar App</h1>
      <p className="text-sm text-muted-foreground mb-6">Effective Date: April 13, 2025</p>
      
      <ScrollArea className="h-[70vh] rounded-md border p-6">
        <div className="space-y-6">
          <section>
            <h2 className="text-xl font-semibold mb-2">1. Introduction</h2>
            <p>
              At Dunbar App, we are committed to protecting your personal information and ensuring 
              transparency in our practices. This Privacy Policy explains how we collect, use, disclose, 
              and safeguard your data when you use our social media platform.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">2. Information We Collect</h2>
            <p>
              We may collect the following types of information when you register or interact with our platform:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>
                <span className="font-medium">Personal Information:</span> Such as your username, display name, 
                bio, profile photo, email address (if provided), and any other information you choose to share.
              </li>
              <li>
                <span className="font-medium">Usage Information:</span> Data about how you interact with the App, 
                including your privacy settings choices and other behavioral data.
              </li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">3. How We Use Your Information</h2>
            <p>
              Your information is used for purposes including, but not limited to:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Providing, maintaining, and improving our services.</li>
              <li>Personalizing your experience and communications.</li>
              <li>Analyzing usage trends and improving the platform.</li>
              <li>Enforcing our Terms and Conditions and ensuring compliance with applicable laws.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">4. Sharing and Disclosure</h2>
            <p>
              We do not sell your personal information. We may share your information with:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Trusted third-party service providers who help us operate the App.</li>
              <li>Law enforcement agencies or regulatory authorities if required by law.</li>
              <li>In connection with a merger, acquisition, or sale of assets, where your information may be transferred.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">5. Your Privacy Settings and Data Consent</h2>
            <p>
              Dunbar App gives you control over your privacy:
            </p>
            <ul className="list-disc pl-6 mt-2 space-y-1">
              <li>Adjust your profile privacy settings (e.g., email visibility, direct messaging, tagging) from your account settings.</li>
              <li>Provide data consent through toggles in the settings interface.</li>
              <li>Request account deletion. Account deletion is permanent and will remove all of your data.</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">6. Security</h2>
            <p>
              We employ a variety of security measures to protect your personal data. However, no method of transmission over the Internet is 100% secure.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">7. Data Retention</h2>
            <p>
              Your information is retained for as long as is necessary for the purposes outlined in this Privacy Policy or as required by law.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">8. Policy Changes</h2>
            <p>
              We may update this Privacy Policy periodically. All changes will be posted on this page with an updated effective date.
            </p>
          </section>
          
          <section>
            <h2 className="text-xl font-semibold mb-2">9. Contact Us</h2>
            <p>
              If you have any questions about this Privacy Policy, please contact us at: 
              <a href="mailto:dunbarsocialapp@gmail.com" className="text-primary hover:underline ml-1">
                dunbarsocialapp@gmail.com
              </a>
            </p>
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}