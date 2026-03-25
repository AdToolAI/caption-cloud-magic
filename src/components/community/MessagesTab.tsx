import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Megaphone } from "lucide-react";
import { DirectMessages } from "./DirectMessages";
import { PlatformAnnouncements } from "./PlatformAnnouncements";

export function MessagesTab() {
  const [view, setView] = useState<"dms" | "announcements">("dms");

  return (
    <div className="border rounded-xl bg-card overflow-hidden min-h-[500px]">
      <div className="flex items-center gap-1 p-2 border-b bg-muted/30">
        <Button
          variant={view === "dms" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("dms")}
          className="gap-2"
        >
          <MessageSquare className="h-4 w-4" />
          Direktnachrichten
        </Button>
        <Button
          variant={view === "announcements" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("announcements")}
          className="gap-2"
        >
          <Megaphone className="h-4 w-4" />
          Plattform-Updates
        </Button>
      </div>

      {view === "dms" ? <DirectMessages /> : <PlatformAnnouncements />}
    </div>
  );
}
