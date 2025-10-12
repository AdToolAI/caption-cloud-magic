import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Copy, MessageCircle, Sparkles, Loader2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface ReplySuggestion {
  type: "freundlich" | "werblich" | "locker";
  text: string;
}

interface ReplySuggestionsProps {
  commentId: string;
  commentText: string;
  platform?: string;
  language?: string;
  existingSuggestions?: ReplySuggestion[];
}

export function ReplySuggestions({
  commentId,
  commentText,
  platform,
  language,
  existingSuggestions,
}: ReplySuggestionsProps) {
  const { toast } = useToast();
  const { t } = useTranslation();
  const [suggestions, setSuggestions] = useState<ReplySuggestion[]>(existingSuggestions || []);
  const [loading, setLoading] = useState(false);

  const generateSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-reply-suggestions", {
        body: {
          commentId,
          commentText,
          platform: platform || "unknown",
          language: language || "de",
        },
      });

      if (error) throw error;

      setSuggestions(data.suggestions);
      toast({
        title: t("comments.replySuggestionsGenerated"),
        description: t("comments.replySuggestionsDesc"),
      });
    } catch (error: any) {
      console.error("Error generating suggestions:", error);
      toast({
        title: t("errors.generic"),
        description: error.message || t("comments.replySuggestionsFailed"),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t("comments.copiedToClipboard"),
      description: `${type} Antwort kopiert`,
    });
  };

  const getTypeIcon = (type: string) => {
    if (type === "freundlich") return "💬";
    if (type === "werblich") return "🚀";
    if (type === "locker") return "😎";
    return "💡";
  };

  const getTypeLabel = (type: string) => {
    if (type === "freundlich") return t("comments.replyTypeFriendly");
    if (type === "werblich") return t("comments.replyTypePromo");
    if (type === "locker") return t("comments.replyTypeCasual");
    return type;
  };

  if (suggestions.length === 0) {
    return (
      <div className="mt-4 p-4 border border-dashed rounded-lg bg-muted/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{t("comments.generateReplies")}</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={generateSuggestions}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("common.generating")}
              </>
            ) : (
              <>
                <MessageCircle className="h-4 w-4 mr-2" />
                {t("comments.generateRepliesButton")}
              </>
            )}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">{t("comments.replySuggestions")}</span>
        <Badge variant="secondary" className="text-xs">KI</Badge>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {suggestions.map((suggestion, index) => (
          <Card
            key={index}
            className="p-4 bg-gradient-to-br from-background to-muted/20 border-primary/10 hover:border-primary/30 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getTypeIcon(suggestion.type)}</span>
                  <Badge variant="outline" className="text-xs">
                    {getTypeLabel(suggestion.type)}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{suggestion.text}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyToClipboard(suggestion.text, getTypeLabel(suggestion.type))}
                title={t("comments.copyReply")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={generateSuggestions}
        disabled={loading}
        className="w-full mt-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            {t("common.generating")}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 mr-2" />
            {t("comments.regenerateReplies")}
          </>
        )}
      </Button>
    </div>
  );
}
