import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Sparkles, Lock } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Feature {
  id: string;
  category: string;
  route: string;
  titles_json: Record<string, string>;
  description_json?: Record<string, string>;
  icon: string;
  plan: string;
  enabled: boolean;
  order: number;
}

export function AppSidebar() {
  const sidebar = useSidebar();
  const { t, language } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [features, setFeatures] = useState<Feature[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");
  
  const isCollapsed = sidebar.state === "collapsed";

  useEffect(() => {
    loadFeatures();
    if (user) {
      loadUserPlan();
    }
  }, [user]);

  const loadFeatures = async () => {
    const { data } = await supabase
      .from("feature_registry")
      .select("*")
      .eq("enabled", true)
      .order("order");
    
    if (data) {
      setFeatures(data as Feature[]);
    }
  };

  const loadUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    
    if (data?.plan) {
      setUserPlan(data.plan);
    }
  };

  const getIconComponent = (iconName: string) => {
    const Icon = (LucideIcons as any)[iconName];
    return Icon || Sparkles;
  };

  const isActive = (path: string) => location.pathname === path;
  
  const isFeatureLocked = (feature: Feature) => {
    return feature.plan === "pro" && userPlan !== "pro";
  };

  const groupedFeatures = {
    create: features.filter(f => f.category === "create"),
    optimize: features.filter(f => f.category === "optimize"),
    analyze: features.filter(f => f.category === "analyze"),
    design: features.filter(f => f.category === "design"),
  };

  const renderFeatureItem = (feature: Feature) => {
    const IconComponent = getIconComponent(feature.icon);
    const locked = isFeatureLocked(feature);
    const title = feature.titles_json[language] || feature.titles_json.en;

    const menuButton = (
      <SidebarMenuButton asChild isActive={isActive(feature.route)}>
        <Link to={locked ? "#" : feature.route} className="flex items-center gap-2">
          <IconComponent className="h-4 w-4 shrink-0" />
          {!isCollapsed && <span className="flex-1">{title}</span>}
          {!isCollapsed && locked && <Lock className="h-3 w-3 text-muted-foreground" />}
        </Link>
      </SidebarMenuButton>
    );

    if (locked) {
      return (
        <TooltipProvider key={feature.id}>
          <Tooltip>
            <TooltipTrigger asChild>
              {menuButton}
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{t("common.requiresPro")}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return menuButton;
  };

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-60"} collapsible="icon">
      <div className="flex items-center justify-between p-4 border-b">
        {!isCollapsed && (
          <Link to="/home" className="flex items-center gap-2 font-bold text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            CaptionGenie
          </Link>
        )}
        <SidebarTrigger />
      </div>

      <SidebarContent>
        {/* Home Link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/home") || isActive("/")}>
                <Link to="/home" className="flex items-center gap-2">
                  <Home className="h-4 w-4" />
                  {!isCollapsed && <span>{t("home")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Create Category */}
        {groupedFeatures.create.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("category.create")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedFeatures.create.map((feature) => (
                  <SidebarMenuItem key={feature.id}>
                    {renderFeatureItem(feature)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Optimize Category */}
        {groupedFeatures.optimize.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("category.optimize")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedFeatures.optimize.map((feature) => (
                  <SidebarMenuItem key={feature.id}>
                    {renderFeatureItem(feature)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Analyze & Goals Category */}
        {groupedFeatures.analyze.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("category.analyze")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedFeatures.analyze.map((feature) => (
                  <SidebarMenuItem key={feature.id}>
                    {renderFeatureItem(feature)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Design & Visuals Category */}
        {groupedFeatures.design.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t("category.design")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {groupedFeatures.design.map((feature) => (
                  <SidebarMenuItem key={feature.id}>
                    {renderFeatureItem(feature)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Auxiliary Pages */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="#pricing" className="flex items-center gap-2">
                  {!isCollapsed && <span>{t("pricing")}</span>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild>
                <a href="#faq" className="flex items-center gap-2">
                  {!isCollapsed && <span>{t("faq")}</span>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}