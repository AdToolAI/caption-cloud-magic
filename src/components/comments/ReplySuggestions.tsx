import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
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
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4 p-4 border border-dashed border-white/20 rounded-xl bg-muted/10
                   hover:border-primary/30 hover:bg-muted/20 transition-all duration-300"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-cyan-500/20
                         flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.15)]"
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </motion.div>
            <span className="text-sm font-medium">{t("comments.generateReplies")}</span>
          </div>
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              size="sm"
              onClick={generateSuggestions}
              disabled={loading}
              className="bg-gradient-to-r from-primary/80 to-cyan-500/80
                         hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)]
                         transition-all duration-300"
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
          </motion.div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
          <Sparkles className="h-3 w-3 text-primary" />
        </div>
        <span className="text-sm font-semibold">{t("comments.replySuggestions")}</span>
        <Badge className="text-xs bg-primary/20 text-primary border border-primary/30
                          shadow-[0_0_8px_hsla(43,90%,68%,0.15)]">
          KI
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {suggestions.map((suggestion, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            whileHover={{ y: -2 }}
            className="p-4 rounded-xl backdrop-blur-sm bg-gradient-to-br from-muted/30 to-muted/10
                       border border-white/10 hover:border-primary/30
                       hover:shadow-[0_0_20px_hsla(43,90%,68%,0.1)] transition-all duration-300"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getTypeIcon(suggestion.type)}</span>
                  <Badge className="text-xs bg-primary/20 text-primary border border-primary/30
                                    shadow-[0_0_8px_hsla(43,90%,68%,0.15)]">
                    {getTypeLabel(suggestion.type)}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{suggestion.text}</p>
              </div>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard(suggestion.text, getTypeLabel(suggestion.type))}
                  title={t("comments.copyReply")}
                  className="hover:bg-primary/10 hover:text-primary transition-all"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </motion.div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
        <Button
          size="sm"
          variant="ghost"
          onClick={generateSuggestions}
          disabled={loading}
          className="w-full mt-2 border border-white/10 hover:bg-muted/20 hover:border-primary/30
                     transition-all duration-300"
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
      </motion.div>
    </div>
  );
}
