import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./ui/ThemeToggle";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, LogOut, User, Menu, X } from "lucide-react";
import { Badge } from "./ui/badge";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import AppNavLink from "@/components/ui/AppNavLink";
import { trackEvent } from "@/lib/analytics";

export const Header = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const [testMode, setTestMode] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const checkTestMode = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('test_mode_plan')
          .eq('id', user.id)
          .maybeSingle();
        
        if (error) {
          console.warn('Error fetching test mode:', error);
          return;
        }
        
        setTestMode(data?.test_mode_plan || null);
      } catch (error) {
        console.warn('Failed to check test mode:', error);
      }
    };
    checkTestMode();
  }, [user]);

  return (
    <>
      {/* Skip to main content link for accessibility */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg"
      >
        Skip to main content
      </a>
      
      <header 
        className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        role="banner"
      >
      <div className="container flex h-16 items-center">
        {/* Left Section: Logo */}
        <div className="flex items-center gap-2 flex-1">
          <Link 
            to="/" 
            onClick={() => trackEvent("nav_click", { label: "logo", path: "/", location: "header" })}
            className="flex items-center gap-2 font-bold text-xl"
            aria-label="Zur Startseite"
          >
            <Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />
            <span className="hidden sm:inline">AdTool AI</span>
          </Link>
        </div>
        
        {/* Center Section: Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Hauptnavigation">
          {user && (
            <AppNavLink to="/app" trackLabel="Dashboard">
              {t("nav.dashboard")}
            </AppNavLink>
          )}
          <AppNavLink to="/pricing" trackLabel="Preise">
            {t("nav.pricing")}
          </AppNavLink>
          <AppNavLink to="/faq" trackLabel="FAQ">
            {t("nav.faq")}
          </AppNavLink>
        </nav>

        {/* Right Section: Desktop Actions */}
        <div className="hidden md:flex items-center gap-2 flex-1 justify-end" role="toolbar" aria-label="Benutzeraktionen">
          {testMode && (
            <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/30">
              🧪 Test Mode: {testMode.charAt(0).toUpperCase() + testMode.slice(1)}
            </Badge>
          )}
          <ThemeToggle />
          <LanguageSwitcher />
          {user && <NotificationBell />}
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm" aria-label="Konto">
                <Link to="/account" onClick={() => trackEvent("nav_click", { label: "Konto", path: "/account", location: "header" })}>
                  <User className="h-4 w-4 mr-2" aria-hidden="true" />
                  {t("nav.account")}
                </Link>
              </Button>
              <Button 
                onClick={signOut} 
                variant="ghost" 
                size="sm"
                aria-label="Abmelden"
              >
                <LogOut className="h-4 w-4 mr-2" aria-hidden="true" />
                {t("nav.logout")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" aria-label="Anmelden">
                <Link to="/auth" onClick={() => trackEvent("nav_click", { label: "Anmelden", path: "/auth", location: "header" })}>
                  {t("nav.login")}
                </Link>
              </Button>
              <Button 
                asChild 
                size="sm" 
                aria-label="Kostenlos starten"
                onClick={() => trackEvent("cta_click", { label: "Kostenlos starten", location: "header" })}
              >
                <Link to="/auth">{t("nav.getStarted")}</Link>
              </Button>
            </>
          )}
        </div>

        {/* Mobile Menu */}
        <div className="flex md:hidden items-center gap-2 flex-1 justify-end">
          {testMode && (
            <Badge variant="secondary" className="bg-warning/20 text-warning border-warning/30 text-xs">
              🧪 {testMode}
            </Badge>
          )}
          <ThemeToggle />
          {user && <NotificationBell />}
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Menü öffnen">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[300px]">
              <div className="flex flex-col gap-4 mt-8">
                <div className="flex items-center justify-between mb-4">
                  <span className="font-bold text-lg">Navigation</span>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Menü schließen"
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                
                <nav className="flex flex-col gap-2" aria-label="Mobile Navigation">
                  {user && (
                    <AppNavLink 
                      to="/app" 
                      trackLabel="Dashboard" 
                      trackLocation="mobile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full justify-start"
                    >
                      {t("nav.dashboard")}
                    </AppNavLink>
                  )}
                  <AppNavLink 
                    to="/pricing" 
                    trackLabel="Preise" 
                    trackLocation="mobile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full justify-start"
                  >
                    {t("nav.pricing")}
                  </AppNavLink>
                  <AppNavLink 
                    to="/faq" 
                    trackLabel="FAQ" 
                    trackLocation="mobile"
                    onClick={() => setMobileMenuOpen(false)}
                    className="w-full justify-start"
                  >
                    {t("nav.faq")}
                  </AppNavLink>
                  
                  {user && (
                    <AppNavLink 
                      to="/account" 
                      trackLabel="Konto" 
                      trackLocation="mobile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full justify-start"
                    >
                      <User className="h-4 w-4 mr-2" />
                      {t("nav.account")}
                    </AppNavLink>
                  )}
                </nav>

                <div className="flex flex-col gap-2 mt-4 pt-4 border-t">
                  <LanguageSwitcher />
                  
                  {user ? (
                    <Button 
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }} 
                      variant="outline" 
                      className="w-full justify-start"
                      aria-label="Abmelden"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      {t("nav.logout")}
                    </Button>
                  ) : (
                    <>
                      <Button 
                        asChild 
                        variant="outline" 
                        className="w-full justify-start"
                        onClick={() => {
                          trackEvent("nav_click", { label: "Anmelden", path: "/auth", location: "mobile" });
                          setMobileMenuOpen(false);
                        }}
                      >
                        <Link to="/auth">{t("nav.login")}</Link>
                      </Button>
                      <Button 
                        asChild 
                        className="w-full justify-start"
                        onClick={() => {
                          trackEvent("cta_click", { label: "Kostenlos starten", location: "mobile" });
                          setMobileMenuOpen(false);
                        }}
                      >
                        <Link to="/auth">{t("nav.getStarted")}</Link>
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
    </>
  );
};
