import { Link, useNavigate } from "react-router-dom";
import { User, Settings, CreditCard, HelpCircle, LogOut, Tag, Share2, Link2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useTranslation } from "@/hooks/useTranslation";
import { useFounderStatus } from "@/hooks/useFounderStatus";

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const founder = useFounderStatus();

  if (!user) return null;

  const userEmail = user.email || "";
  const displayName = userEmail.split("@")[0];
  const isFounder = !founder.loading && founder.isActive;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          className={`rounded-xl hover:bg-muted/50 transition-smooth ${
            isFounder
              ? "ring-1 ring-primary/60 text-primary shadow-[0_0_16px_-6px_hsl(var(--primary)/0.8)]"
              : ""
          }`}
          aria-label={t("header.userMenu")}
        >
          <User className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={10}
        className="z-[90] w-56 max-h-[min(520px,calc(100vh-5rem))] rounded-2xl shadow-glow"
      >
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            {isFounder && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                Founders Circle
              </p>
            )}
            <p className="text-xs leading-none text-muted-foreground truncate">
              {userEmail}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {user.email === 'bestofproducts4u@gmail.com' && (
          <DropdownMenuItem asChild>
            <Link to="/instagram-publishing" className="flex items-center gap-2 cursor-pointer">
              <Share2 className="h-4 w-4" />
              <span>{t("nav.instagramPublishing")}</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/account" className="flex items-center gap-2 cursor-pointer">
            <Settings className="h-4 w-4" />
            <span>{t("header.account")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/billing" className="flex items-center gap-2 cursor-pointer">
            <CreditCard className="h-4 w-4" />
            <span>{tx({ de: "Plan & Guthaben", en: "Plan & Credits", es: "Plan y créditos" })}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/integrations" className="flex items-center gap-2 cursor-pointer">
            <Link2 className="h-4 w-4" />
            <span>{t("nav.integrations")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/faq" className="flex items-center gap-2 cursor-pointer">
            <HelpCircle className="h-4 w-4" />
            <span>{t("nav.faq")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/support" className="flex items-center gap-2 cursor-pointer">
            <HelpCircle className="h-4 w-4" />
            <span>{t("header.support")}</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={async () => { await signOut(); navigate('/'); }}
          className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="h-4 w-4" />
          <span>{t("header.logout")}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
