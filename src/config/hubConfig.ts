import {
  Home, Calendar,
  Sparkles, Bot, ImagePlus,
  MessageSquare, MessageCircle, BookTemplate, Workflow,
  LineChart, BarChart3, Coins, Radar, Shield,
  FolderOpen, Mic2, Music2, Video, Film, Edit, Layers, Languages, User,
  Users, Palette,
  ShieldCheck, Settings,
  Gamepad2, Radio, Scissors, Store, Coins as CoinsIcon, AudioWaveform, FileBadge2, Activity, Library,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ── Per-item Bond-2028 cover imports ──
import coverPlanenCalendar from "@/assets/hub-covers/planen/calendar.jpg";
import coverPlanenPlanner from "@/assets/hub-covers/planen/planner.jpg";
import coverPlanenComposer from "@/assets/hub-covers/planen/composer.jpg";
import coverPlanenPostingTimes from "@/assets/hub-covers/planen/posting-times.jpg";

import coverOptAiPost from "@/assets/hub-covers/optimieren/ai-post.jpg";
import coverOptImageCaption from "@/assets/hub-covers/optimieren/image-caption.jpg";
import coverOptCoach from "@/assets/hub-covers/optimieren/coach.jpg";
import coverOptComments from "@/assets/hub-covers/optimieren/comments.jpg";
import coverOptTemplates from "@/assets/hub-covers/optimieren/templates.jpg";
import coverOptCampaigns from "@/assets/hub-covers/optimieren/campaigns.jpg";

import coverAnalytics from "@/assets/hub-covers/analysieren/analytics.jpg";
import coverAnalyticsPosthog from "@/assets/hub-covers/analysieren/posthog.jpg";
import coverAnalyticsUsage from "@/assets/hub-covers/analysieren/usage.jpg";
import coverAnalyticsTrendRadar from "@/assets/hub-covers/analysieren/trend-radar.jpg";
import coverAnalyticsAiText from "@/assets/hub-covers/analysieren/ai-text-studio.jpg";

import coverErstMediaLibrary from "@/assets/hub-covers/erstellen/media-library.jpg";
import coverErstAudioStudio from "@/assets/hub-covers/erstellen/audio-studio.jpg";
import coverErstMusicStudio from "@/assets/hub-covers/erstellen/music-studio.jpg";
import coverErstSfxLibrary from "@/assets/hub-covers/erstellen/sfx-library.jpg";
import coverErstStockVideos from "@/assets/hub-covers/erstellen/stock-videos.jpg";
import coverErstUniversalCreator from "@/assets/hub-covers/erstellen/universal-creator.jpg";
import coverErstUniversalVideo from "@/assets/hub-covers/erstellen/universal-video-creator.jpg";
import coverErstUniversalDc from "@/assets/hub-covers/erstellen/universal-directors-cut.jpg";
import coverErstAiVideoStudio from "@/assets/hub-covers/erstellen/ai-video-studio.jpg";
import coverErstVideoComposer from "@/assets/hub-covers/erstellen/video-composer.jpg";
import coverErstQueue from "@/assets/hub-covers/erstellen/queue.jpg";
import coverErstLibrary from "@/assets/hub-covers/erstellen/library.jpg";
import coverErstCreatorLibrary from "@/assets/hub-covers/erstellen/creator-library.jpg";
import coverErstPictureStudio from "@/assets/hub-covers/erstellen/picture-studio.jpg";
import coverErstMarketplace from "@/assets/hub-covers/erstellen/marketplace.jpg";
import coverErstCreatorStudio from "@/assets/hub-covers/erstellen/creator-studio.jpg";
import coverErstMyLicenses from "@/assets/hub-covers/erstellen/my-licenses.jpg";

import coverTeamWorkspace from "@/assets/hub-covers/team/workspace.jpg";
import coverTeamBrandKit from "@/assets/hub-covers/team/brand-kit.jpg";
import coverTeamWhiteLabel from "@/assets/hub-covers/team/white-label.jpg";
import coverTeamCommunity from "@/assets/hub-covers/team/community.jpg";

import coverGamingStream from "@/assets/hub-covers/gaming.jpg";

export interface HubSubItem {
  route: string;
  titleKey: string;
  descKey: string;
  icon: LucideIcon;
  plan?: string;
  /** Optional override for the card cover image (defaults to hub-level cover). */
  cover?: string;
  /** Breite Hauptkarte über die volle Rasterbreite. */
  wide?: boolean;
  /** Kleine Vorschaufelder innerhalb einer breiten Karte. */
  previews?: { route: string; labelKey: string; cover: string }[];
}

export interface HubDefinition {
  key: string;
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
  items: HubSubItem[];
  adminOnly?: boolean;
  /** When true: hub is visible but not navigable for non-admins. */
  comingSoon?: boolean;
}

export const hubDefinitions: HubDefinition[] = [
  {
    key: "planen",
    icon: Calendar,
    titleKey: "hubs.planen",
    descKey: "hubDesc.planen",
    items: [
      {
        route: "/command-center",
        titleKey: "nav.commandCenter",
        descKey: "hubItemDesc.commandCenter",
        icon: Calendar,
        cover: coverPlanenCalendar,
        wide: true,
        previews: [
          { route: "/command-center?view=calendar", labelKey: "cc.calendar", cover: coverPlanenCalendar },
          { route: "/command-center?view=posts", labelKey: "cc.posts", cover: coverPlanenPlanner },
          { route: "/command-center?view=campaigns", labelKey: "cc.campaigns", cover: coverPlanenComposer },
          { route: "/command-center?view=times", labelKey: "cc.times", cover: coverPlanenPostingTimes },
        ],
      },
    ],
  },
  {
    key: "optimieren",
    icon: Sparkles,
    titleKey: "hubs.optimieren",
    descKey: "hubDesc.optimieren",
    items: [
      {
        route: "/content-studio",
        titleKey: "Content Studio",
        descKey: "Ein Ablauf vom Briefing bis zum fertigen Beitrag: Copy, KI-Motiv, Layout, Serie & Veröffentlichung.",
        icon: Sparkles,
        cover: coverOptAiPost,
        wide: true,
        previews: [
          { route: "/content-studio?step=copy", labelKey: "Copy & Varianten", cover: coverOptAiPost },
          { route: "/content-studio?step=motif", labelKey: "Motiv & Pairing", cover: coverOptImageCaption },
          { route: "/content-studio?step=layout", labelKey: "Layout-Designer", cover: coverOptTemplates },
          { route: "/content-studio?step=deliver&mode=series", labelKey: "Serie & Ausspielen", cover: coverOptCampaigns },
          { route: "/content-studio?coach=1", labelKey: "Coach", cover: coverOptCoach },
        ],
      },
    ],

  },
  {
    key: "analysieren",
    icon: BarChart3,
    titleKey: "hubs.analysieren",
    descKey: "hubDesc.analysieren",
    items: [
      { route: "/analytics", titleKey: "nav.analytics", descKey: "hubItemDesc.analytics", icon: LineChart, cover: coverAnalytics },
      { route: "/analytics/posthog", titleKey: "PostHog Dashboard", descKey: "hubItemDesc.posthog", icon: BarChart3, cover: coverAnalyticsPosthog },
      { route: "/analytics/usage-reports", titleKey: "Usage Reports", descKey: "hubItemDesc.usageReports", icon: Coins, cover: coverAnalyticsUsage },
      { route: "/trend-radar", titleKey: "nav.trendRadar", descKey: "hubItemDesc.trendRadar", icon: Radar, cover: coverAnalyticsTrendRadar },
      { route: "/ai-text-studio", titleKey: "AI Text Studio", descKey: "OpenAI, Google und Claude in drei Qualitätsstufen — ein Reasoning-Hub für alle Texte", icon: Sparkles, cover: coverAnalyticsAiText },
    ],
  },
  {
    key: "erstellen",
    icon: Film,
    titleKey: "hubs.erstellen",
    descKey: "hubDesc.erstellen",
    items: [
      { route: "/media-library", titleKey: "nav.mediaLibrary", descKey: "hubItemDesc.mediaLibrary", icon: FolderOpen, cover: coverErstMediaLibrary },
      { route: "/audio-studio", titleKey: "VoicePro", descKey: "hubItemDesc.audioStudio", icon: Mic2, cover: coverErstAudioStudio },
      { route: "/music-studio", titleKey: "Music Studio", descKey: "Native Music Library — Stable Audio, MiniMax, ElevenLabs in einem Studio", icon: Music2, cover: coverErstMusicStudio },
      { route: "/sfx-library", titleKey: "SFX Library", descKey: "Royalty-free Sound Effects (Pixabay + Freesound) für Composer & Director's Cut", icon: AudioWaveform, cover: coverErstSfxLibrary },
      { route: "/stock-videos", titleKey: "Stock Videos", descKey: "Premium 4K & HD Clips (Pexels + Pixabay) mit Editorial Collections — direkt in Composer & DC", icon: Film, cover: coverErstStockVideos },
      { route: "/universal-creator", titleKey: "Universal Content Creator", descKey: "hubItemDesc.universalCreator", icon: Video, cover: coverErstUniversalCreator },
      { route: "/universal-video-creator", titleKey: "Universal Video Creator", descKey: "hubItemDesc.universalVideo", icon: Film, cover: coverErstUniversalVideo },
      { route: "/universal-directors-cut", titleKey: "Universal Director's Cut", descKey: "hubItemDesc.directorsCut", icon: Edit, cover: coverErstUniversalDc },
      { route: "/ai-video-studio", titleKey: "AI Video Studio", descKey: "hubItemDesc.aiVideoStudio", icon: Sparkles, cover: coverErstAiVideoStudio },
      { route: "/video-composer", titleKey: "videoComposer.title", descKey: "hubItemDesc.videoComposer", icon: Scissors, cover: coverErstVideoComposer },
      { route: "/queue", titleKey: "Render-Queue", descKey: "Live-Status aller Motion-Studio-Renderjobs", icon: Activity, cover: coverErstQueue },
      { route: "/library", titleKey: "Cast & World Library", descKey: "Avatare, Locations, Buildings & Props — alles in einer Bibliothek, mit @-Mention überall einsetzbar", icon: Users, cover: coverErstLibrary },
      { route: "/creator-library", titleKey: "Creator Library", descKey: "Videos · Photos · Music · SFX — royalty-free Bundle, inklusive in allen Paid-Plans", icon: Library, cover: coverErstCreatorLibrary },
      
      { route: "/picture-studio", titleKey: "KI Picture Studio", descKey: "hubItemDesc.backgroundReplacer", icon: Layers, cover: coverErstPictureStudio },
      { route: "/marketplace", titleKey: "Template Marketplace", descKey: "Community-Templates entdecken & kaufen", icon: Store, cover: coverErstMarketplace },
      { route: "/creator-studio", titleKey: "Creator Studio", descKey: "Eigene Templates verkaufen & Earnings tracken", icon: CoinsIcon, cover: coverErstCreatorStudio },
      { route: "/my-licenses", titleKey: "My Licenses", descKey: "PDF-Lizenz-Zertifikate für alle deine Assets — wie Envato/Artlist", icon: FileBadge2, cover: coverErstMyLicenses },
    ],
  },
  {
    key: "team",
    icon: Users,
    titleKey: "hubs.team",
    descKey: "hubDesc.team",
    items: [
      { route: "/team-workspace", titleKey: "nav.teamWorkspace", descKey: "hubItemDesc.teamWorkspace", icon: Users, plan: "pro", cover: coverTeamWorkspace },
      { route: "/brand-kit", titleKey: "nav.brandKit", descKey: "hubItemDesc.brandKit", icon: Palette, cover: coverTeamBrandKit },
      { route: "/white-label", titleKey: "nav.whiteLabel", descKey: "hubItemDesc.whiteLabel", icon: Palette, plan: "enterprise", cover: coverTeamWhiteLabel },
      { route: "/community", titleKey: "nav.community", descKey: "hubItemDesc.community", icon: MessageCircle, cover: coverTeamCommunity },
    ],
  },
  {
    key: "gaming",
    icon: Gamepad2,
    titleKey: "hubs.gaming",
    descKey: "hubDesc.gaming",
    comingSoon: true,
    items: [
      { route: "/gaming", titleKey: "Stream Dashboard", descKey: "hubItemDesc.streamDashboard", icon: Radio, cover: coverGamingStream },
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
