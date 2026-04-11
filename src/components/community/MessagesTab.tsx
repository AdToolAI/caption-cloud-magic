import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, Megaphone } from "lucide-react";
import { DirectMessages } from "./DirectMessages";
import { PlatformAnnouncements } from "./PlatformAnnouncements";
import { motion } from "framer-motion";

export function MessagesTab() {
  const [view, setView] = useState<"dms" | "announcements">("dms");

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl backdrop-blur-xl bg-card/60 border border-white/10 overflow-hidden min-h-[500px] shadow-[0_0_30px_hsla(43,90%,68%,0.05)]"
    >
      <div className="flex items-center gap-1 p-2 border-b border-white/10 bg-card/40 backdrop-blur-md">
        <Button
          variant={view === "dms" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("dms")}
          className={`gap-2 transition-all duration-300 ${view === "dms" ? "shadow-[0_0_15px_hsla(43,90%,68%,0.15)]" : "hover:bg-white/5"}`}
        >
          <MessageSquare className="h-4 w-4" />
          Direktnachrichten
        </Button>
        <Button
          variant={view === "announcements" ? "default" : "ghost"}
          size="sm"
          onClick={() => setView("announcements")}
          className={`gap-2 transition-all duration-300 ${view === "announcements" ? "shadow-[0_0_15px_hsla(43,90%,68%,0.15)]" : "hover:bg-white/5"}`}
        >
          <Megaphone className="h-4 w-4" />
          Plattform-Updates
        </Button>
      </div>

      {view === "dms" ? <DirectMessages /> : <PlatformAnnouncements />}
    </motion.div>
  );
}
