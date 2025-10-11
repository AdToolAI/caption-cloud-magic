import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { NotificationBell } from "./NotificationBell";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Sparkles, LogOut, User } from "lucide-react";

export const Header = () => {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2 font-bold text-xl">
          <Sparkles className="h-6 w-6 text-primary" />
          CaptionGenie
        </Link>
        
        <nav className="hidden md:flex items-center gap-6">
          <a href="#pricing" className="text-sm font-medium transition-colors hover:text-primary">
            {t("pricing")}
          </a>
          <a href="#faq" className="text-sm font-medium transition-colors hover:text-primary">
            {t("faq")}
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          {user && <NotificationBell />}
          {user ? (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/account">
                  <User className="h-4 w-4 mr-2" />
                  {t("auth.account")}
                </Link>
              </Button>
              <Button onClick={signOut} variant="ghost" size="sm">
                <LogOut className="h-4 w-4 mr-2" />
                {t("auth.logout")}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/auth">{t("auth.login")}</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:flex">
                <Link to="/generator">{t("hero.cta")}</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
