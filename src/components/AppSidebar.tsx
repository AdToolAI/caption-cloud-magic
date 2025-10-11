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
    const active = isActive(feature.route);

    const menuButton = (
      <SidebarMenuButton 
        asChild 
        isActive={active}
        className={`transition-smooth ${active ? 'border-l-2 border-primary bg-primary/5 font-medium text-primary' : 'hover:bg-muted/50 text-gray-600 hover:text-gray-900'}`}
      >
        <Link to={locked ? "#" : feature.route} className="flex items-center gap-3">
          <IconComponent className={`h-[18px] w-[18px] shrink-0 transition-smooth`} />
          {!isCollapsed && <span className="flex-1 text-sm">{title}</span>}
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

  const renderCategoryGroup = (category: string, categoryFeatures: Feature[]) => {
    if (categoryFeatures.length === 0) return null;

    return (
      <SidebarGroup key={category}>
        <SidebarGroupLabel className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mt-6 mb-1">
          {!isCollapsed && t(`category.${category}`)}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {categoryFeatures.map((feature) => (
              <SidebarMenuItem key={feature.id}>
                {renderFeatureItem(feature)}
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar className={isCollapsed ? "w-14" : "w-60"} collapsible="icon">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
        {!isCollapsed && (
          <Link to="/home" className="flex items-center gap-2 font-semibold text-lg group">
            <Sparkles className="h-5 w-5 text-primary transition-smooth group-hover:text-primary/80" />
            <span className="text-gray-900">
              CaptionGenie
            </span>
          </Link>
        )}
        <SidebarTrigger className="hover:bg-gray-100 rounded-md transition-smooth" />
      </div>

      <SidebarContent className="bg-white border-r border-gray-200">
        {/* Home Link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={isActive("/home") || isActive("/")}
                className={`transition-smooth ${isActive("/home") || isActive("/") ? 'border-l-2 border-primary bg-primary/5 font-medium text-primary' : 'hover:bg-muted/50 text-gray-600 hover:text-gray-900'}`}
              >
                <Link to="/home" className="flex items-center gap-3">
                  <Home className={`h-[18px] w-[18px] transition-smooth`} />
                  {!isCollapsed && <span className="text-sm">{t("home")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Category Groups */}
        {renderCategoryGroup("create", groupedFeatures.create)}
        {renderCategoryGroup("optimize", groupedFeatures.optimize)}
        {renderCategoryGroup("analyze", groupedFeatures.analyze)}
        {renderCategoryGroup("design", groupedFeatures.design)}

        {/* Auxiliary Pages */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-muted/50 text-gray-600 hover:text-gray-900 transition-smooth">
                <a href="#pricing" className="flex items-center gap-3">
                  {!isCollapsed && <span className="text-sm">{t("pricing")}</span>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-muted/50 text-gray-600 hover:text-gray-900 transition-smooth">
                <a href="#faq" className="flex items-center gap-3">
                  {!isCollapsed && <span className="text-sm">{t("faq")}</span>}
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
