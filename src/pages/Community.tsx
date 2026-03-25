import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MessageSquare, Hash, Calendar, Handshake } from "lucide-react";
import { MessagesTab } from "@/components/community/MessagesTab";
import { CommunityTab } from "@/components/community/CommunityTab";
import { MentoringTab } from "@/components/community/MentoringTab";
import { CollaborationsTab } from "@/components/community/CollaborationsTab";

export default function Community() {
  return (
    <div className="container py-6">
      <div className="flex items-center gap-3 mb-6">
        <MessageSquare className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Creator Community</h1>
          <p className="text-sm text-muted-foreground">
            Nachrichten, Channels, Mentoring & Kollaborationen — alles an einem Ort.
          </p>
        </div>
      </div>

      <Tabs defaultValue="messages" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="messages" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Nachrichten</span>
          </TabsTrigger>
          <TabsTrigger value="community" className="gap-2">
            <Hash className="h-4 w-4" />
            <span className="hidden sm:inline">Community</span>
          </TabsTrigger>
          <TabsTrigger value="mentoring" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Mentoring</span>
          </TabsTrigger>
          <TabsTrigger value="collaborations" className="gap-2">
            <Handshake className="h-4 w-4" />
            <span className="hidden sm:inline">Kollaborationen</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <MessagesTab />
        </TabsContent>
        <TabsContent value="community">
          <CommunityTab />
        </TabsContent>
        <TabsContent value="mentoring">
          <MentoringTab />
        </TabsContent>
        <TabsContent value="collaborations">
          <CollaborationsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
