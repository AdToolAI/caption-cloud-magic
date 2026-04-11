import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";

interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: string;
  created_at: string;
}

export function PlatformAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("platform_announcements")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) console.error(error);
      else setAnnouncements((data as Announcement[]) || []);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-16 text-muted-foreground"
      >
        <motion.div animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}>
          <Megaphone className="h-8 w-8 mb-2 opacity-40 text-[hsl(43,90%,68%)]" />
        </motion.div>
        <p className="text-sm">Keine Ankündigungen vorhanden.</p>
      </motion.div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {announcements.map((a, idx) => (
        <motion.div
          key={a.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: idx * 0.06 }}
          className={`p-4 rounded-xl backdrop-blur-xl border transition-all duration-300 hover:-translate-y-0.5 ${
            a.priority === "high"
              ? "border-[hsla(43,90%,68%,0.3)] bg-[hsla(43,90%,68%,0.05)] shadow-[0_0_25px_hsla(43,90%,68%,0.08)]"
              : "bg-card/60 border-white/10 hover:border-white/20"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="h-4 w-4 text-[hsl(43,90%,68%)]" />
            <h3 className="text-sm font-semibold">{a.title}</h3>
            {a.priority === "high" && (
              <Badge variant="destructive" className="text-xs shadow-[0_0_10px_hsla(0,80%,60%,0.2)]">
                Wichtig
              </Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(a.created_at), "dd. MMM yyyy", { locale: de })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
        </motion.div>
      ))}
    </div>
  );
}
