import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-background border-t py-6 mt-auto">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <img 
              src="/assets/Vector.png" 
              alt="Dunbar Logo" 
              className="w-8 h-8"
            />
            <p className="text-sm text-muted-foreground">
              © {new Date().getFullYear()} Dunbar Social
            </p>
          </div>
          
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link href="/privacypolicy">
              <a className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Privacy Policy
              </a>
            </Link>
            <Link href="/termsandconditions">
              <a className="text-sm text-muted-foreground hover:text-primary transition-colors">
                Terms and Conditions
              </a>
            </Link>
            <a 
              href="mailto:dunbarsocialapp@gmail.com" 
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              Contact Us
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}