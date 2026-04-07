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
import { GamingHubHeroHeader } from "@/components/gaming/GamingHubHeroHeader";
import { useTwitch } from "@/hooks/useTwitch";

export default function GamingHub() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const { isConnected, twitchUsername } = useTwitch();

  return (
    <PageWrapper>
      <SEO
        title="Gaming Hub | CaptionGenie"
        description="Twitch-Integration, Clip-Management und automatisierte Stream-Content-Erstellung für Gamer und Streamer."
      />
      <div className="space-y-4 max-w-7xl mx-auto p-6">
        <GamingHubHeroHeader isConnected={isConnected} twitchUsername={twitchUsername} />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-12 backdrop-blur-xl bg-card/60 border border-white/10 shadow-[0_0_20px_rgba(145,70,255,0.08)]">
            <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">Stream</span>
            </TabsTrigger>
            <TabsTrigger value="clips" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Scissors className="h-4 w-4" />
              <span className="hidden sm:inline">Clips</span>
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">Content</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2 text-xs sm:text-sm data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:shadow-[0_0_10px_rgba(145,70,255,0.15)]">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Chat</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard"><StreamDashboard /></TabsContent>
          <TabsContent value="clips"><ClipCreator /></TabsContent>
          <TabsContent value="content"><GamingContentStudio /></TabsContent>
          <TabsContent value="analytics"><StreamAnalytics /></TabsContent>
          <TabsContent value="chat"><ChatManager /></TabsContent>
        </Tabs>
      </div>
    </PageWrapper>
  );
}
