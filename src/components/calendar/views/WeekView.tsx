import { useState } from "react";
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addHours } from "date-fns";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

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

const hours = Array.from({ length: 24 }, (_, i) => i);

export function WeekView({ posts, onPostClick, onPostMove, readOnly }: WeekViewProps) {
  const [currentWeek, setCurrentWeek] = useState(new Date());

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
                return (
                  <Card
                    key={`${day.toISOString()}-${hour}`}
                    className="min-h-[60px] p-1 hover:bg-accent/50 cursor-pointer transition-colors"
                  >
                    <div className="space-y-1">
                      {timePosts.map((post) => (
                        <div
                          key={post.id}
                          onClick={() => onPostClick(post)}
                          className="text-xs p-1 rounded bg-card border hover:border-primary transition-colors"
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