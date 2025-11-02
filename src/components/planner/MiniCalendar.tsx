import { useState } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarDays } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { de } from "date-fns/locale";

interface MiniCalendarProps {
  startDate: string;
  weeks: number;
  postsPerDay: Record<string, { scheduled: number; approved: number }>;
  onDateClick: (date: Date) => void;
  onRangeSelect?: (startDate: Date, weeks: number) => void;
}

export function MiniCalendar({
  startDate,
  weeks,
  postsPerDay,
  onDateClick,
  onRangeSelect,
}: MiniCalendarProps) {
  const [open, setOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date(startDate));

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday
    onDateClick(weekStart);
    setOpen(false);
  };

  const endDate = addDays(new Date(startDate), weeks * 7 - 1);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <CalendarDays className="h-4 w-4" />
          {format(new Date(startDate), "dd.MM.yy", { locale: de })} -{" "}
          {format(endDate, "dd.MM.yy", { locale: de })}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          locale={de}
          modifiers={{
            hasContent: (date) => {
              const dateKey = format(date, "yyyy-MM-dd");
              return !!postsPerDay[dateKey];
            },
          }}
          modifiersClassNames={{
            hasContent: "font-bold",
          }}
          footer={
            <div className="p-3 border-t text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span>Geplant</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span>Genehmigt</span>
              </div>
            </div>
          }
        />
      </PopoverContent>
    </Popover>
  );
}