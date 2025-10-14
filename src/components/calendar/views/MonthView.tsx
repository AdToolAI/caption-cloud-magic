import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, startOfWeek, endOfWeek, isSameMonth } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
}

interface MonthViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onDateClick?: (date: Date) => void;
  readOnly?: boolean;
}

const statusColors: Record<string, string> = {
  briefing: "bg-gray-500",
  in_progress: "bg-blue-500",
  review: "bg-yellow-500",
  pending_approval: "bg-orange-500",
  approved: "bg-green-500",
  scheduled: "bg-indigo-500",
  published: "bg-purple-500",
};

export function MonthView({ posts, onPostClick, onDateClick, readOnly }: MonthViewProps) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDay = (date: Date) => {
    return posts.filter((post) => isSameDay(new Date(post.start_at), date));
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">{format(currentMonth, "MMMM yyyy")}</h2>
        <div className="flex gap-2">
          <Button onClick={prevMonth} variant="outline" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button onClick={nextMonth} variant="outline" size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {/* Header */}
        {weekDays.map((day) => (
          <div key={day} className="text-center font-semibold p-2 text-sm">
            {day}
          </div>
        ))}

        {/* Days */}
        {days.map((day) => {
          const dayPosts = getPostsForDay(day);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          
          return (
            <Card
              key={day.toISOString()}
              onClick={() => !readOnly && onDateClick?.(day)}
              className={`min-h-[120px] p-2 cursor-pointer transition-colors ${
                !isCurrentMonth ? "opacity-40" : ""
              } ${!readOnly ? "hover:bg-accent/50" : ""}`}
            >
              <div className="flex justify-between items-start mb-2">
                <span className={`text-sm font-medium ${
                  isSameDay(day, new Date()) ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : ""
                }`}>
                  {format(day, "d")}
                </span>
                {dayPosts.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {dayPosts.length}
                  </Badge>
                )}
              </div>

              <div className="space-y-1">
                {dayPosts.slice(0, 3).map((post) => (
                  <div
                    key={post.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPostClick(post);
                    }}
                    className="text-xs p-1 rounded bg-card border hover:border-primary transition-colors truncate"
                  >
                    <Badge
                      variant="outline"
                      className={`${statusColors[post.status]} text-white text-[10px] px-1 mb-0.5`}
                    >
                      {post.status}
                    </Badge>
                    <div className="font-medium truncate">{post.title}</div>
                  </div>
                ))}
                {dayPosts.length > 3 && (
                  <div className="text-xs text-muted-foreground text-center">
                    +{dayPosts.length - 3} more
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
