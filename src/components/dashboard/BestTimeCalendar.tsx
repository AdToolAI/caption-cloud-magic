import { useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, FileText, Video, Star, Flame, CheckCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useNavigate } from "react-router-dom";

interface TimeSlot {
  hour: number;
  minute: number;
  score: number;
  label: string;
}

interface CalendarDay {
  date: Date;
  bestSlots: TimeSlot[];
  isPast: boolean;
  isWeekend: boolean;
}

interface BestTimeCalendarProps {
  heatmap: Record<string, number[][]>;
  loading?: boolean;
}

export function BestTimeCalendar({ heatmap, loading }: BestTimeCalendarProps) {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<string>("instagram");
  const [contentType, setContentType] = useState<'posts' | 'videos'>('posts');

  const calendarDays = useMemo<CalendarDay[]>(() => {
    const days: CalendarDay[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 14; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      
      const dayOfWeek = date.getDay();
      const isPast = date < today;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

      // Get heatmap data for this day
      const platformData = heatmap[selectedPlatform] || [];
      const dayData = platformData[dayOfWeek] || Array(24).fill(30);

      // Find top 3 time slots
      const slots: TimeSlot[] = dayData
        .map((score, hour) => ({
          hour,
          minute: 0,
          score,
          label: `${hour.toString().padStart(2, '0')}:00`
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

      days.push({
        date,
        bestSlots: slots,
        isPast,
        isWeekend
      });
    }

    return days;
  }, [heatmap, selectedPlatform]);

  const handleSchedule = (date: Date, slot: TimeSlot) => {
    const scheduleDate = new Date(date);
    scheduleDate.setHours(slot.hour, slot.minute, 0, 0);
    
    // Navigate to calendar with pre-filled time
    navigate(`/calendar?quickAdd=true&date=${scheduleDate.toISOString()}&platform=${selectedPlatform}`);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('heatmap.title')}</CardTitle>
          <CardDescription>{t('heatmap.loading')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-96 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getSlotIcon = (index: number) => {
    switch (index) {
      case 0: return <Star className="h-3 w-3 text-yellow-500" />;
      case 1: return <Flame className="h-3 w-3 text-orange-500" />;
      case 2: return <CheckCircle className="h-3 w-3 text-green-500" />;
      default: return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <CardTitle>{t('heatmap.title')} - {language === 'de' ? 'Nächste 2 Wochen' : 'Next 2 Weeks'}</CardTitle>
            <CardDescription>{t('heatmap.subtitle')}</CardDescription>
          </div>
          <div className="flex items-center gap-4">
            <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="tiktok">TikTok</SelectItem>
                <SelectItem value="linkedin">LinkedIn</SelectItem>
                <SelectItem value="youtube">YouTube</SelectItem>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="x">X</SelectItem>
              </SelectContent>
            </Select>
            
            <ToggleGroup type="single" value={contentType} onValueChange={(v) => v && setContentType(v as 'posts' | 'videos')}>
              <ToggleGroupItem value="posts" aria-label="Posts">
                <FileText className="h-4 w-4 mr-2" />
                {t('heatmap.contentType.posts')}
              </ToggleGroupItem>
              <ToggleGroupItem value="videos" aria-label="Videos">
                <Video className="h-4 w-4 mr-2" />
                {t('heatmap.contentType.videos')}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
          {calendarDays.map((day, idx) => (
            <Card 
              key={idx} 
              className={`border-2 ${day.isPast ? 'opacity-50' : ''} ${day.isWeekend ? 'bg-muted/30' : ''} hover:border-primary/50 transition-smooth`}
            >
              <CardHeader className="p-3 pb-2">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground uppercase">
                    {day.date.toLocaleDateString(language, { weekday: 'short' })}
                  </p>
                  <p className="text-2xl font-bold">
                    {day.date.getDate()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {day.date.toLocaleDateString(language, { month: 'short' })}
                  </p>
                </div>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-2">
                {day.bestSlots.map((slot, slotIdx) => (
                  <div 
                    key={slotIdx}
                    className="flex items-center justify-between p-2 bg-background rounded-lg border hover:border-primary/50 transition-smooth"
                  >
                    <div className="flex items-center gap-2">
                      {getSlotIcon(slotIdx)}
                      <span className="text-sm font-medium">{slot.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {slot.score}
                    </Badge>
                  </div>
                ))}
                
                {!day.isPast && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="w-full mt-2"
                    onClick={() => handleSchedule(day.date, day.bestSlots[0])}
                  >
                    <Calendar className="h-3 w-3 mr-2" />
                    {language === 'de' ? 'Planen' : 'Schedule'}
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
        
        <div className="mt-6 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" />
            <span>{language === 'de' ? 'Beste Zeit' : 'Best Time'}</span>
          </div>
          <div className="flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-500" />
            <span>{language === 'de' ? 'Sehr gut' : 'Very Good'}</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            <span>{language === 'de' ? 'Gut' : 'Good'}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
