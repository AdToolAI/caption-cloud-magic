import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Star, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";

interface SpotlightCardProps {
  channelId: string | null;
}

export function SpotlightCard({ channelId }: SpotlightCardProps) {
  const [spotlight, setSpotlight] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!channelId) { setLoading(false); return; }

    const fetch = async () => {
      const { data: rotation } = await supabase
        .from("spotlight_rotation")
        .select("*, community_messages(*)")
        .eq("channel_id", channelId)
        .maybeSingle();

      setSpotlight(rotation);
      setLoading(false);
    };
    fetch();
  }, [channelId]);

  if (loading || !spotlight?.community_messages) {
    return null;
  }

  const msg = spotlight.community_messages;
  const nextRotation = new Date(spotlight.rotated_at);
  nextRotation.setDate(nextRotation.getDate() + spotlight.rotation_interval_days);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Star className="h-4 w-4 text-primary" />
          Spotlight Post
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm">{msg.content}</p>
        {msg.tags?.length > 0 && (
          <div className="flex gap-1 flex-wrap">
            {msg.tags.map((tag: string) => (
              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
            ))}
          </div>
        )}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          Nächste Rotation: {formatDistanceToNow(nextRotation, { locale: de, addSuffix: true })}
        </div>
      </CardContent>
    </Card>
  );
}
