import { Link, useLocation, useNavigate } from "react-router-dom";
import { Home, Lock } from "lucide-react";
import { motion } from "framer-motion";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { hubDefinitions } from "@/config/hubConfig";
import {
  Sidebar,
  SidebarContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function AppSidebar() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isAdmin } = useUserRoles();
  const location = useLocation();
  const navigate = useNavigate();

  const isHubActive = (hubKey: string) => {
    if (hubKey === "home") return location.pathname === "/home" || location.pathname === "/";
    const hub = hubDefinitions.find((h) => h.key === hubKey);
    if (!hub) return false;
    return hub.items.some((item) => location.pathname === item.route) || location.pathname === `/hub/${hubKey}`;
  };

  const visibleHubs = hubDefinitions.filter((h) => !h.adminOnly || isAdmin);

  return (
    <>
      <Sidebar className="w-[68px] min-w-[68px] max-w-[68px]" collapsible="none">
        {/* Brand icon */}
        <div className="flex flex-col items-center py-4 border-b border-border bg-card">
          <Brand compact showText={false} />
          <div className="mt-2">
            <NotificationBadge onClick={() => setShowNotifications(true)} />
          </div>
        </div>

        <SidebarContent className="bg-card border-r border-border h-full flex flex-col items-center py-3 gap-1">
          {/* Home */}
          <SidebarMenu className="w-full px-2">
            <SidebarMenuItem>
              <TooltipProvider delayDuration={0}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarMenuButton
                      asChild
                      isActive={isHubActive("home")}
                      className={cn(
                        "h-11 w-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200",
                        isHubActive("home")
                          ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(124,58,237,0.25)]"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <Link to="/home">
                        <Home className="h-5 w-5" />
                      </Link>
                    </SidebarMenuButton>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="bg-background/95 backdrop-blur-xl border-border shadow-xl">
                    <p className="font-medium">{t("home")}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* Divider */}
          <div className="w-8 h-px bg-border my-1" />

          {/* Hub Icons */}
          <SidebarMenu className="w-full px-2 flex-1 space-y-1">
            {visibleHubs.map((hub) => {
              const HubIcon = hub.icon;
              const active = isHubActive(hub.key);

              return (
                <SidebarMenuItem key={hub.key}>
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <motion.button
                          onClick={() => navigate(`/hub/${hub.key}`)}
                          whileHover={{ scale: 1.08 }}
                          whileTap={{ scale: 0.95 }}
                          className={cn(
                            "h-11 w-11 mx-auto flex items-center justify-center rounded-xl transition-all duration-200 cursor-pointer",
                            active
                              ? "bg-primary/15 text-primary shadow-[0_0_12px_rgba(124,58,237,0.25)]"
                              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                          )}
                        >
                          <HubIcon className="h-5 w-5" />
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-background/95 backdrop-blur-xl border-border shadow-xl">
                        <p className="font-medium">{t(hub.titleKey)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarContent>

        <SidebarRail className="hover:after:bg-primary/40 transition-colors" />
      </Sidebar>

      <NotificationCenter open={showNotifications} onClose={() => setShowNotifications(false)} />
    </>
  );
}
