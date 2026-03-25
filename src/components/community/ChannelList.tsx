import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Hash, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface CommunityChannel {
  id: string;
  name: string;
  topic: string;
  allowed_user_ids: string[];
  moderation_rules: Record<string, any>;
  created_at: string;
}

interface ChannelListProps {
  selectedChannelId: string | null;
  onSelectChannel: (channel: CommunityChannel) => void;
}

export function ChannelList({ selectedChannelId, onSelectChannel }: ChannelListProps) {
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("community_channels")
        .select("*")
        .order("created_at", { ascending: true });

      if (!error && data) setChannels(data as any[]);
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) {
    return (
      <div className="space-y-2 p-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (channels.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground text-center">
        Noch keine Channels vorhanden.
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2">
      <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        Channels
      </p>
      {channels.map((ch) => (
        <button
          key={ch.id}
          onClick={() => onSelectChannel(ch)}
          className={cn(
            "w-full flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-accent",
            selectedChannelId === ch.id && "bg-accent text-accent-foreground"
          )}
        >
          <Hash className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="font-medium truncate">{ch.name}</p>
            <p className="text-xs text-muted-foreground truncate">{ch.topic}</p>
          </div>
          <Users className="h-3 w-3 ml-auto mt-1 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  );
}
