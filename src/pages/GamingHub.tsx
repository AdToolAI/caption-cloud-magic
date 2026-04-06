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

export default function GamingHub() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <PageWrapper>
      <SEO
        title="Gaming Hub | CaptionGenie"
        description="Twitch-Integration, Clip-Management und automatisierte Stream-Content-Erstellung für Gamer und Streamer."
      />
      <div className="space-y-6 max-w-7xl mx-auto p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500/20 to-violet-600/20 border border-purple-500/30">
            <Gamepad2 className="h-8 w-8 text-purple-400" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Gaming Hub</h1>
            <p className="text-muted-foreground">Stream-Tools, Clip-Creator & Content-Automation für Gamer</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5 h-12">
            <TabsTrigger value="dashboard" className="gap-2 text-xs sm:text-sm">
              <Radio className="h-4 w-4" />
              <span className="hidden sm:inline">Stream</span>
            </TabsTrigger>
            <TabsTrigger value="clips" className="gap-2 text-xs sm:text-sm">
              <Scissors className="h-4 w-4" />
              <span className="hidden sm:inline">Clips</span>
            </TabsTrigger>
            <TabsTrigger value="content" className="gap-2 text-xs sm:text-sm">
              <Gamepad2 className="h-4 w-4" />
              <span className="hidden sm:inline">Content</span>
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Analytics</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-2 text-xs sm:text-sm">
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
