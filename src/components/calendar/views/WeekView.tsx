import { useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addHours } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface Post {
  id: string;
  title: string;
  channels: string[];
  status: string;
  start_at: string;
  timezone: string;
}

interface WeekViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
  onPostMove: (postId: string, newDate: Date) => void;
  onDateClick?: (date: Date) => void;
  readOnly?: boolean;
  selectedEventIds?: string[];
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

const hours = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({
  posts,
  onPostClick,
  onPostMove,
  onDateClick,
  readOnly,
  selectedEventIds = [],
}: WeekViewProps) {
  const selectableStatuses = ['briefing', 'in_progress', 'review', 'approved'];
  const isMobile = useIsMobile();
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(new Date());

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getPostsForDateTime = (date: Date, hour: number) => {
    return posts.filter((post) => {
      const postDate = new Date(post.start_at);
      return isSameDay(postDate, date) && postDate.getHours() === hour;
    });
  };

  const prevWeek = () => {
    setCurrentWeek(new Date(currentWeek.getTime() - 7 * 24 * 60 * 60 * 1000));
  };

  const nextWeek = () => {
    setCurrentWeek(new Date(currentWeek.getTime() + 7 * 24 * 60 * 60 * 1000));
  };

  if (isMobile) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">
            {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d")}
          </h2>
          <div className="flex gap-2">
            <Button onClick={prevWeek} variant="outline" size="sm">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button onClick={nextWeek} variant="outline" size="sm">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Day Selector */}
        <ScrollArea className="w-full whitespace-nowrap pb-2">
          <div className="flex gap-2">
            {days.map((day) => (
              <Button
                key={day.toISOString()}
                variant={isSameDay(day, selectedDay) ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDay(day)}
                className="shrink-0 flex-col h-auto py-2"
              >
                <div className="text-xs">{format(day, "EEE")}</div>
                <div className="text-lg font-bold">{format(day, "d")}</div>
              </Button>
            ))}
          </div>
        </ScrollArea>

        {/* Timeline for Selected Day */}
        <div className="space-y-2">
          {hours.map((hour) => {
            const timePosts = getPostsForDateTime(selectedDay, hour);
            if (timePosts.length === 0) return null;

            return (
              <Card key={hour} className="p-3">
                <div className="text-sm text-muted-foreground mb-2">
                  {format(addHours(new Date(0), hour), "HH:mm")}
                </div>
                {timePosts.map((post) => (
                  <div
                    key={post.id}
                    onClick={() => onPostClick(post)}
                    className={cn(
                      "p-2 border rounded hover:bg-accent/50 transition-colors cursor-pointer relative",
                      selectableStatuses.includes(post.status) && "hover:ring-2 hover:ring-primary/50",
                      selectedEventIds.includes(post.id) && "ring-2 ring-primary bg-primary/10"
                    )}
                  >
                    <Badge className={statusColors[post.status] + " text-white mb-1"}>
                      {post.status}
                    </Badge>
                    <div className="font-medium">{post.title}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {post.channels.join(", ")}
                    </div>
                  </div>
                ))}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {format(weekStart, "MMM d")} - {format(weekEnd, "MMM d, yyyy")}
        </h2>
        <div className="flex gap-2">
          <Button onClick={prevWeek} variant="outline" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button onClick={nextWeek} variant="outline" size="sm">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid grid-cols-8 gap-2 min-w-[800px]">
          {/* Header */}
          <div className="sticky left-0 bg-background z-10" />
          {days.map((day) => (
            <div key={day.toISOString()} className="text-center font-semibold p-2">
              <div>{format(day, "EEE")}</div>
              <div className="text-2xl">{format(day, "d")}</div>
            </div>
          ))}

          {/* Time Grid */}
          {hours.map((hour) => (
            <>
              <div
                key={`hour-${hour}`}
                className="sticky left-0 bg-background z-10 text-sm text-muted-foreground p-2 text-right"
              >
                {format(addHours(new Date(0), hour), "HH:mm")}
              </div>
              {days.map((day) => {
                const timePosts = getPostsForDateTime(day, hour);
                const slotDate = new Date(day);
                slotDate.setHours(hour, 0, 0, 0);
                
                return (
                  <Card
                    key={`${day.toISOString()}-${hour}`}
                    className="min-h-[60px] p-1 hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => !readOnly && onDateClick?.(slotDate)}
                  >
                    <div className="space-y-1">
                      {timePosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => onPostClick(post)}
                          className={cn(
                            "text-xs p-1 rounded bg-card border hover:border-primary transition-colors cursor-pointer relative",
                            selectableStatuses.includes(post.status) && "hover:ring-2 hover:ring-primary/50",
                            selectedEventIds.includes(post.id) && "ring-2 ring-primary bg-primary/10"
                          )}
                        >
                          <Badge
                            variant="outline"
                            className={`${statusColors[post.status]} text-white text-[10px] px-1 mb-1`}
                          >
                            {post.status}
                          </Badge>
                          <div className="font-medium truncate">{post.title}</div>
                          <div className="text-muted-foreground text-[10px]">
                            {post.channels.join(", ")}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}