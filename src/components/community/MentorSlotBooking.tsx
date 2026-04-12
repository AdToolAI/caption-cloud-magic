import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, User } from "lucide-react";
import { format } from "date-fns";
import { de, enUS, es } from "date-fns/locale";
import { useMentorSlots } from "@/hooks/useMentorSlots";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";

function getDateLocale(lang: string) {
  if (lang === 'de') return de;
  if (lang === 'es') return es;
  return enUS;
}

interface MentorSlotBookingProps {
  channelId: string | null;
}

export function MentorSlotBooking({ channelId }: MentorSlotBookingProps) {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const dateLocale = getDateLocale(language);
  const { slots, loading, bookSlot } = useMentorSlots(channelId);

  const openSlots = slots.filter((s) => s.status === "open");

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          {t('community.peerMentoring')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {openSlots.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('community.noOpenSlots')}</p>
        ) : (
          openSlots.map((slot) => (
            <div
              key={slot.id}
              className="flex items-center justify-between p-2 rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs font-medium">
                    {slot.profiles?.email?.split("@")[0] || t('community.mentor')}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {format(new Date(slot.slot_time), "dd. MMM HH:mm", { locale: dateLocale })}
                    <Badge variant="outline" className="text-xs ml-1">
                      {slot.duration_min} {t('community.min')}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => bookSlot(slot.id)}
                disabled={slot.mentor_user_id === user?.id}
              >
                {t('community.book')}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}