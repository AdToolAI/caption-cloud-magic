import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Star, Shield, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { de, enUS, es } from "date-fns/locale";
import type { CommunityMessage } from "@/hooks/useCommunityMessages";
import { useTranslation } from "@/hooks/useTranslation";

function getDateLocale(lang: string) {
  if (lang === 'de') return de;
  if (lang === 'es') return es;
  return enUS;
}

interface MessageFeedProps {
  messages: CommunityMessage[];
  loading: boolean;
  filterTags: string[];
}

export function MessageFeed({ messages, loading, filterTags }: MessageFeedProps) {
  const { t, language } = useTranslation();
  const dateLocale = getDateLocale(language);

  const filteredMessages = useMemo(() => {
    if (filterTags.length === 0) return messages;
    return messages.filter((m) =>
      filterTags.some((tag) => m.tags.includes(tag))
    );
  }, [messages, filterTags]);

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-3">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="space-y-2 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (filteredMessages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">{t('community.noMessages')}</p>
        <p className="text-xs mt-1">{t('community.beFirst')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 overflow-y-auto max-h-[60vh]">
      {filteredMessages.map((msg) => (
        <div
          key={msg.id}
          className={`flex gap-3 p-3 rounded-xl transition-colors ${
            msg.is_spotlight
              ? "bg-primary/5 border border-primary/20"
              : "hover:bg-muted/50"
          }`}
        >
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium truncate">
                {msg.profiles?.email?.split("@")[0] || t('community.anonymous')}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(msg.created_at), "dd. MMM HH:mm", { locale: dateLocale })}
              </span>
              {msg.is_spotlight && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Star className="h-3 w-3" /> {t('community.spotlight')}
                </Badge>
              )}
              {msg.moderation_status === "flagged" && (
                <Badge variant="destructive" className="text-xs gap-1">
                  <Shield className="h-3 w-3" /> {t('community.moderated')}
                </Badge>
              )}
            </div>
            <p className="text-sm whitespace-pre-wrap break-words">{msg.content}</p>
            {msg.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {msg.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}