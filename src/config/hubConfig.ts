import {
  Home, Calendar, LayoutGrid, Edit3, Clock,
  Sparkles, Bot, ImagePlus,
  MessageSquare, MessageCircle, BookTemplate,
  LineChart, BarChart3, Coins, Radar, Shield,
  FolderOpen, Mic2, Video, Film, Edit, Layers,
  Users, Palette,
  ShieldCheck, Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface HubSubItem {
  route: string;
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  plan?: string;
}

export interface HubDefinition {
  key: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  items: HubSubItem[];
  adminOnly?: boolean;
}

export const hubDefinitions: HubDefinition[] = [
  {
    key: "planen",
    icon: Calendar,
    titleKey: "hubs.planen",
    descKey: "hubDesc.planen",
    items: [
      { route: "/calendar", titleKey: "nav.calendar", descKey: "hubItemDesc.calendar", icon: Calendar },
      { route: "/planner", titleKey: "nav.contentPlanner", descKey: "hubItemDesc.planner", icon: LayoutGrid },
      { route: "/composer", titleKey: "nav.composer", descKey: "hubItemDesc.composer", icon: Edit3 },
      { route: "/posting-times", titleKey: "nav.postTimeAdvisor", descKey: "hubItemDesc.postingTimes", icon: Clock },
    ],
  },
  {
    key: "optimieren",
    icon: Sparkles,
    titleKey: "hubs.optimieren",
    descKey: "hubDesc.optimieren",
    items: [
      { route: "/generator", titleKey: "nav.textStudio", descKey: "hubItemDesc.generator", icon: Sparkles },
      { route: "/ai-post-generator", titleKey: "nav.aiPostGenerator", descKey: "hubItemDesc.aiPost", icon: Bot },
      { route: "/image-caption-pairing", titleKey: "nav.imageCaptionPairing", descKey: "hubItemDesc.imageCaption", icon: ImagePlus },
      { route: "/coach", titleKey: "nav.coach", descKey: "hubItemDesc.coach", icon: MessageSquare },
      { route: "/comment-manager", titleKey: "nav.commentManager", descKey: "hubItemDesc.comments", icon: MessageCircle },
      { route: "/template-manager", titleKey: "nav.templateManager", descKey: "hubItemDesc.templates", icon: BookTemplate },
    ],
  },
  {
    key: "analysieren",
    icon: BarChart3,
    titleKey: "hubs.analysieren",
    descKey: "hubDesc.analysieren",
    items: [
      { route: "/analytics", titleKey: "nav.analytics", descKey: "hubItemDesc.analytics", icon: LineChart },
      { route: "/analytics/posthog", titleKey: "PostHog Dashboard", descKey: "hubItemDesc.posthog", icon: BarChart3 },
      { route: "/analytics/usage-reports", titleKey: "Usage Reports", descKey: "hubItemDesc.usageReports", icon: Coins },
      { route: "/trend-radar", titleKey: "nav.trendRadar", descKey: "hubItemDesc.trendRadar", icon: Radar },
      
    ],
  },
  {
    key: "medien",
    icon: Film,
    titleKey: "hubs.medien",
    descKey: "hubDesc.medien",
    items: [
      { route: "/media-library", titleKey: "nav.mediaLibrary", descKey: "hubItemDesc.mediaLibrary", icon: FolderOpen },
      { route: "/audio-studio", titleKey: "VoicePro", descKey: "hubItemDesc.audioStudio", icon: Mic2 },
      { route: "/universal-creator", titleKey: "Universal Content Creator", descKey: "hubItemDesc.universalCreator", icon: Video },
      { route: "/universal-video-creator", titleKey: "Universal Video Creator", descKey: "hubItemDesc.universalVideo", icon: Film },
      { route: "/universal-directors-cut", titleKey: "Universal Director's Cut", descKey: "hubItemDesc.directorsCut", icon: Edit },
      { route: "/sora-long-form", titleKey: "Sora 2 Long-Form", descKey: "hubItemDesc.soraLongForm", icon: Film },
      { route: "/ai-video-studio", titleKey: "AI Video Studio", descKey: "hubItemDesc.aiVideoStudio", icon: Sparkles },
      { route: "/background-replacer", titleKey: "nav.backgroundReplacer", descKey: "hubItemDesc.backgroundReplacer", icon: Layers },
    ],
  },
  {
    key: "team",
    icon: Users,
    titleKey: "hubs.team",
    descKey: "hubDesc.team",
    items: [
      { route: "/team-workspace", titleKey: "nav.teamWorkspace", descKey: "hubItemDesc.teamWorkspace", icon: Users, plan: "pro" },
      { route: "/white-label", titleKey: "nav.whiteLabel", descKey: "hubItemDesc.whiteLabel", icon: Palette, plan: "enterprise" },
    ],
  },
  {
    key: "admin",
    icon: ShieldCheck,
    titleKey: "Admin",
    descKey: "hubDesc.admin",
    adminOnly: true,
    items: [
      { route: "/admin", titleKey: "Admin Dashboard", descKey: "hubItemDesc.adminDashboard", icon: ShieldCheck },
      { route: "/admin/monitoring", titleKey: "System Monitoring", descKey: "hubItemDesc.monitoring", icon: BarChart3 },
      { route: "/admin/feature-flags", titleKey: "Feature Flags", descKey: "hubItemDesc.featureFlags", icon: Settings },
    ],
  },
];
