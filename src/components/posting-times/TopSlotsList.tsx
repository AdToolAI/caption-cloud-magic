import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { Clock, TrendingUp, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PostingSlot, PostingTimesDay } from '@/hooks/usePostingTimes';
import { useNavigate } from 'react-router-dom';

interface TopSlotsListProps {
  days: PostingTimesDay[];
  platform: string;
}

export function TopSlotsList({ days, platform }: TopSlotsListProps) {
  const navigate = useNavigate();

  const handleAddToCalendar = (slot: PostingSlot) => {
    navigate('/calendar', {
      state: {
        prefillTime: slot.start,
        platform: platform,
        source: 'posting-times'
      }
    });
  };

  return (
    <div className="space-y-3">
      {days.slice(0, 7).map((day) => {
        // Take top 3 slots
        const topSlots = day.slots.slice(0, 3);

        if (topSlots.length === 0) return null;

        return (
          <Card key={day.date}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="font-semibold">
                    {format(new Date(day.date), 'EEEE, d. MMMM', { locale: de })}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Top {topSlots.length} Zeiten
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                {topSlots.map((slot, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {format(new Date(slot.start), 'HH:mm')}
                        </span>
                      </div>

                      <Badge
                        variant={slot.score >= 70 ? 'default' : 'secondary'}
                        className="font-semibold"
                      >
                        <TrendingUp className="w-3 h-3 mr-1" />
                        {slot.score.toFixed(0)}
                      </Badge>

                      {slot.reasons && slot.reasons.length > 0 && (
                        <span className="text-xs text-muted-foreground truncate flex-1">
                          {slot.reasons[0]}
                        </span>
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleAddToCalendar(slot)}
                      className="ml-2"
                    >
                      <Calendar className="w-3 h-3 mr-1" />
                      Planen
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
