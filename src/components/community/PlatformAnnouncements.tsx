import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Megaphone } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

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
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  if (announcements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <Megaphone className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">Keine Ankündigungen vorhanden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {announcements.map((a) => (
        <div
          key={a.id}
          className={`p-4 rounded-xl border ${
            a.priority === "high" ? "border-primary/30 bg-primary/5" : "bg-card"
          }`}
        >
          <div className="flex items-center gap-2 mb-2">
            <Megaphone className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">{a.title}</h3>
            {a.priority === "high" && (
              <Badge variant="destructive" className="text-xs">Wichtig</Badge>
            )}
            <span className="text-xs text-muted-foreground ml-auto">
              {format(new Date(a.created_at), "dd. MMM yyyy", { locale: de })}
            </span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{a.content}</p>
        </div>
      ))}
    </div>
  );
}
