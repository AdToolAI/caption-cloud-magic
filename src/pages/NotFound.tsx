import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Home, LayoutDashboard } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const { user } = useAuth();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6 p-8 max-w-md">
        <div className="space-y-3">
          <h1 className="text-7xl font-bold text-foreground">404</h1>
          <h2 className="text-2xl font-semibold">{t('errorPages.404.title')}</h2>
          <p className="text-muted-foreground">{t('errorPages.404.description')}</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Button asChild variant="outline" size="lg">
            <Link to="/">
              <Home className="h-4 w-4 mr-2" />
              {t('nav.home')}
            </Link>
          </Button>
          {user && (
            <Button asChild size="lg">
              <Link to="/app">
                <LayoutDashboard className="h-4 w-4 mr-2" />
                {t('nav.dashboard')}
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotFound;
