import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommentDiagnostics } from "@/components/comments/CommentDiagnostics";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, ThumbsUp, ThumbsDown, Minus } from "lucide-react";

export function CommentsAnalyticsTab() {
  const { user } = useAuth();
  const [platform, setPlatform] = useState("all");

  const [comments, setComments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);
    const load = async () => {
      try {
        let query = supabase
          .from("comments" as any)
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (platform !== "all") {
          query = query.eq("platform", platform);
        }
        const { data } = await query;
        setComments((data || []) as any[]);
      } catch (err) {
        console.error("Error loading comments:", err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [user, platform]);

  const sentimentCounts = {
    positive: (comments || []).filter(c => (c as any).sentiment === "positive").length,
    neutral: (comments || []).filter(c => !(c as any).sentiment || (c as any).sentiment === "neutral").length,
    negative: (comments || []).filter(c => (c as any).sentiment === "negative").length,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Plattformen</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="linkedin">LinkedIn</SelectItem>
            <SelectItem value="x">X</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <MessageCircle className="h-8 w-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{(comments || []).length}</p>
              <p className="text-xs text-muted-foreground">Kommentare gesamt</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <ThumbsUp className="h-8 w-8 text-green-500" />
            <div>
              <p className="text-2xl font-bold">{sentimentCounts.positive}</p>
              <p className="text-xs text-muted-foreground">Positiv</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <Minus className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{sentimentCounts.neutral}</p>
              <p className="text-xs text-muted-foreground">Neutral</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 flex items-center gap-3">
            <ThumbsDown className="h-8 w-8 text-red-500" />
            <div>
              <p className="text-2xl font-bold">{sentimentCounts.negative}</p>
              <p className="text-xs text-muted-foreground">Negativ</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <Card className="animate-pulse">
          <CardContent className="py-8">
            <div className="h-32 bg-muted rounded" />
          </CardContent>
        </Card>
      ) : (comments || []).length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Keine Kommentare gefunden
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Letzte Kommentare</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-96 overflow-y-auto">
            {(comments || []).map((comment: any) => (
              <div key={comment.id} className="p-3 rounded-lg border text-sm">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{comment.author_name || "Unbekannt"}</span>
                  <span className="text-xs text-muted-foreground">
                    {comment.platform} · {new Date(comment.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-muted-foreground">{comment.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
