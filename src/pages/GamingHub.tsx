import { useState } from "react";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SEO } from "@/components/SEO";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Gamepad2, Radio, Scissors, BarChart3, MessageSquare } from "lucide-react";
import { StreamDashboard } from "@/components/gaming/StreamDashboard";
import { ClipCreator } from "@/components/gaming/ClipCreator";
import { GamingContentStudio } from "@/components/gaming/GamingContentStudio";
import { StreamAnalytics } from "@/components/gaming/StreamAnalytics";
import { ChatManager } from "@/components/gaming/ChatManager";
import { DiscordIntegration } from "@/components/gaming/DiscordIntegration";
import { YouTubeLiveTab } from "@/components/gaming/YouTubeLiveTab";
import { GamingHubHeroHeader } from "@/components/gaming/GamingHubHeroHeader";
import { useTwitch } from "@/hooks/useTwitch";
import { useTranslation } from "@/hooks/useTranslation";
import { ComingSoonScreen } from "@/components/common/ComingSoonScreen";

export default function GamingHub() {
  return (
    <ComingSoonScreen
      eyebrow="Gaming Hub"
      title="Stream. Clip. Wachsen."
      subtitle="Verbinde Twitch, YouTube Live und Discord — die KI verwandelt deine Streams in virale Shorts, moderiert den Chat und liefert Wachstums-Analytics. Vollständig integriert in den useadtool-Workflow."
      reason="Wir feinjustieren noch die Echtzeit-Stream-Integration mit Twitch und YouTube Live, damit alles ohne Lag läuft."
      backHref="/home"
      adminPreview={<GamingHubReal />}
      features={[
        {
          icon: <Radio className="h-5 w-5" />,
          title: 'Live Stream Dashboard',
          description: 'Multi-Plattform-Dashboard für Twitch, YouTube Live und Discord — Viewer, Chat und Alerts in einem Cockpit.',
        },
        {
          icon: <Scissors className="h-5 w-5" />,
          title: 'AI Clip Creator',
          description: 'Highlights aus deinen Streams werden automatisch erkannt und als Shorts, Reels und TikToks veröffentlicht.',
        },
        {
          icon: <BarChart3 className="h-5 w-5" />,
          title: 'Growth Analytics',
          description: 'Welche Spiele bringen Follower? Welche Clips gehen viral? Daten-getriebene Empfehlungen für deinen Channel.',
        },
      ]}
    />
  );
}

function GamingHubReal() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { isConnected, twitchUsername } = useTwitch();
  const { t } = useTranslation();

  return (
    <PageWrapper>
      <SEO
        title="Gaming Hub | CaptionGenie"
        description={t('gaming.seoDesc')}
      />
      <div className="space-y-4 max-w-7xl mx-auto p-6">
        <GamingHubHeroHeader isConnected={isConnected} twitchUsername={twitchUsername} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-7 h-12 backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]">
            <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">{t('gaming.tabStream')}</span>
            </TabsTrigger>
            <TabsTrigger value="clips" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Scissors className="h-4 w-4" />
              <span className="hidden sm:inline">{t('gaming.tabClips')}</span>
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('gaming.tabContent')}</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('gaming.tabAnalytics')}</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">{t('gaming.tabChat')}</span>
            </TabsTrigger>
            <TabsTrigger value="youtube" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-[#FF0000]/20 data-[state=active]:text-[#FF4444] data-[state=active]:shadow-[0_0_10px_rgba(255,0,0,0.15)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
              </svg>
              <span className="hidden sm:inline">{t('gaming.tabYouTube')}</span>
            </TabsTrigger>
            <TabsTrigger value="discord" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-[#5865F2]/20 data-[state=active]:text-[#7289da] data-[state=active]:shadow-[0_0_10px_rgba(88,101,242,0.15)]">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286z" />
              </svg>
              <span className="hidden sm:inline">{t('gaming.tabDiscord')}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><StreamDashboard /></TabsContent>
          <TabsContent value="clips"><ClipCreator /></TabsContent>
          <TabsContent value="content"><GamingContentStudio /></TabsContent>
          <TabsContent value="analytics"><StreamAnalytics /></TabsContent>
          <TabsContent value="chat"><ChatManager /></TabsContent>
          <TabsContent value="youtube"><YouTubeLiveTab /></TabsContent>
          <TabsContent value="discord"><DiscordIntegration /></TabsContent>
        </Tabs>
      </div>
    </PageWrapper>
  );
}
