import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Home, Sparkles, Lock, Calendar, Edit3, Clock, Wand2, Film, Zap, RefreshCw, MessageSquare, User, MessageCircle, TrendingUp, BarChart3, Target, Workflow, Share2, LayoutGrid, Bot, ImagePlus, Layers, BookTemplate, LineChart, Radar, MessageSquareText, Shield, FolderOpen, Images, Users, Palette, Briefcase, Coins, Settings, CreditCard, ChevronRight, Star, Video, Edit } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Brand } from "@/components/layout/Brand";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "@/components/calendar/NotificationBadge";
import { NotificationCenter } from "@/components/calendar/NotificationCenter";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HubItem {
  route: string;
  titleKey: string;
  icon: any;
  plan?: string;
}


export function AppSidebar() {
  const sidebar = useSidebar();
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  const [userPlan, setUserPlan] = useState<string>("free");
  const [expandedHubs, setExpandedHubs] = useState<string[]>(["planen"]);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const isCollapsed = sidebar.state === "collapsed";

  const toggleHub = (hubKey: string) => {
    setExpandedHubs(prev => 
      prev.includes(hubKey) 
        ? prev.filter(k => k !== hubKey)
        : [...prev, hubKey]
    );
  };

  useEffect(() => {
    if (user) {
      loadUserPlan();
    }
  }, [user]);

  const loadUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("plan, test_mode_plan")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setUserPlan(data.test_mode_plan || data.plan);
    }
  };

  const isActive = (path: string) => location.pathname === path;
  
  const isFeatureLocked = (item: HubItem) => {
    if (!item.plan) return false;
    
    const planHierarchy: Record<string, number> = {
      'free': 0,
      'basic': 1,
      'pro': 2,
      'enterprise': 3
    };
    
    const requiredLevel = planHierarchy[item.plan] || 0;
    const userLevel = planHierarchy[userPlan] || 0;
    
    return userLevel < requiredLevel;
  };

  const hubStructure: Record<string, HubItem[]> = {
    planen: [
      { route: "/calendar", titleKey: "nav.calendar", icon: Calendar },
      { route: "/planner", titleKey: "nav.contentPlanner", icon: LayoutGrid },
      { route: "/composer", titleKey: "nav.composer", icon: Edit3 },
      { route: "/posting-times", titleKey: "nav.postTimeAdvisor", icon: Clock },
    ],
    erstellen: [
      { route: "/universal-creator", titleKey: "Universal Content Creator", icon: Video },
      { route: "/universal-directors-cut", titleKey: "Universal Director's Cut", icon: Edit },
      { route: "/content-studio", titleKey: "nav.contentStudio", icon: Star },
      { route: "/voice-library", titleKey: "Voice Library", icon: MessageSquare },
      { route: "/template-generator", titleKey: "Template Generator", icon: BookTemplate },
      { route: "/generator", titleKey: "nav.generator", icon: Sparkles },
      { route: "/prompt-wizard", titleKey: "nav.promptWizard", icon: Wand2 },
      { route: "/reel-script-generator", titleKey: "nav.reelScript", icon: Film },
      { route: "/hook-generator", titleKey: "nav.hookGenerator", icon: Zap },
      { route: "/ai-post-generator", titleKey: "nav.aiPostGenerator", icon: Bot },
      { route: "/image-caption-pairing", titleKey: "nav.imageCaptionPairing", icon: ImagePlus },
      { route: "/background-replacer", titleKey: "nav.backgroundReplacer", icon: Layers },
    ],
    optimieren: [
      { route: "/coach", titleKey: "nav.coach", icon: MessageSquare },
      { route: "/comment-manager", titleKey: "nav.commentManager", icon: MessageCircle },
      { route: "/template-manager", titleKey: "nav.templateManager", icon: BookTemplate },
    ],
    analysieren: [
      { route: "/analytics", titleKey: "nav.analytics", icon: LineChart },
      { route: "/analytics/posthog", titleKey: "PostHog Dashboard", icon: BarChart3 },
      { route: "/trend-radar", titleKey: "nav.trendRadar", icon: Radar },
      { route: "/audit", titleKey: "nav.audit", icon: Shield },
    ],
    automatisieren: [
      { route: "/campaigns", titleKey: "nav.campaigns", icon: Workflow, plan: "pro" },
      { route: "/integrations", titleKey: "nav.integrations", icon: Share2 },
      { route: "/instagram-publishing", titleKey: "nav.instagramPublishing", icon: Share2 },
    ],
    medien: [
      { route: "/media-library", titleKey: "nav.mediaLibrary", icon: FolderOpen },
      { route: "/universal-creator/library", titleKey: "Video Library", icon: Video },
      { route: "/content-projects", titleKey: "nav.myVideos", icon: Film },
    ],
    team: [
      { route: "/team-workspace", titleKey: "nav.teamWorkspace", icon: Users, plan: "pro" },
      { route: "/white-label", titleKey: "nav.whiteLabel", icon: Palette, plan: "enterprise" },
    ],
    verwaltung: [
      { route: "/brand-kit", titleKey: "nav.brandKit", icon: Briefcase },
      { route: "/credits", titleKey: "nav.credits", icon: Coins },
      { route: "/account", titleKey: "nav.account", icon: Settings },
      { route: "/billing", titleKey: "nav.billing", icon: CreditCard },
    ],
  };

  const renderHubItem = (item: HubItem, index: number) => {
    const IconComponent = item.icon;
    const locked = isFeatureLocked(item);
    const title = t(item.titleKey);
    const active = isActive(item.route);

    const menuButton = (
      <SidebarMenuButton 
        asChild 
        isActive={active}
        className={`relative transition-smooth h-8 py-1.5 ${active ? 'bg-primary/10 text-primary font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-1 before:bg-primary before:rounded-r-full' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}`}
      >
        <Link to={locked ? "#" : item.route} className="flex items-center gap-3">
          <IconComponent className={`h-[18px] w-[18px] shrink-0 transition-smooth`} />
          {!isCollapsed && <span className="flex-1 text-sm">{title}</span>}
          {!isCollapsed && locked && <Lock className="h-3 w-3 text-muted-foreground" />}
        </Link>
      </SidebarMenuButton>
    );

    if (locked) {
      return (
        <TooltipProvider key={index}>
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

  const renderHub = (hubKey: string, hubItems: HubItem[]) => {
    const isExpanded = expandedHubs.includes(hubKey);
    
    return (
      <SidebarGroup key={hubKey}>
        <Collapsible open={isExpanded} onOpenChange={() => toggleHub(hubKey)}>
          <CollapsibleTrigger className="w-full">
            <SidebarGroupLabel className="cursor-pointer hover:text-primary flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 px-3 mt-3 mb-0.5">
              {!isCollapsed && (
                <>
                  <ChevronRight className={cn("h-3 w-3 transition-transform", isExpanded && "rotate-90")} />
                  {t(`hubs.${hubKey}`)}
                </>
              )}
            </SidebarGroupLabel>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                {hubItems.map((item, idx) => (
                  <SidebarMenuItem key={idx}>
                    {renderHubItem(item, idx)}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroup>
    );
  };

  return (
    <>
      <Sidebar className={isCollapsed ? "w-14" : "w-60"} collapsible="icon">
        <div className="flex items-center justify-between p-4 border-b border-border bg-card">
          {!isCollapsed && <Brand compact showText />}
          {isCollapsed && <Brand compact showText={false} />}
          <div className="flex items-center gap-2">
            <NotificationBadge onClick={() => setShowNotifications(true)} />
            <SidebarTrigger className="hover:bg-muted/50 rounded-md transition-smooth" />
          </div>
        </div>

      <SidebarContent className="bg-card border-r border-border h-full flex flex-col gap-1">
        {/* Home Link */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton 
                asChild 
                isActive={isActive("/home") || isActive("/")}
                className={`relative transition-smooth ${isActive("/home") || isActive("/") ? 'bg-primary/10 text-primary font-medium before:absolute before:left-0 before:top-1 before:bottom-1 before:w-1 before:bg-primary before:rounded-r-full' : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'}`}
              >
                <Link to="/home" className="flex items-center gap-3">
                  <Home className={`h-[18px] w-[18px] transition-smooth`} />
                  {!isCollapsed && <span className="text-sm">{t("home")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Hub Groups */}
        {Object.entries(hubStructure).map(([hubKey, hubItems]) => renderHub(hubKey, hubItems))}

        {/* Auxiliary Pages */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-smooth">
                <Link to="/pricing" className="flex items-center gap-3">
                  {!isCollapsed && <span className="text-sm">{t("nav.pricing")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-smooth">
                <Link to="/faq" className="flex items-center gap-3">
                  {!isCollapsed && <span className="text-sm">{t("nav.faq")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-smooth">
                <Link to="/support" className="flex items-center gap-3">
                  {!isCollapsed && <span className="text-sm">{t("support")}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>

    <NotificationCenter
      open={showNotifications}
      onClose={() => setShowNotifications(false)}
    />
  </>
  );
}
