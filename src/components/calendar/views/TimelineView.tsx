import { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths } from "date-fns";
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
  end_at?: string;
  campaign_id?: string;
}

interface TimelineViewProps {
  posts: Post[];
  onPostClick: (post: Post) => void;
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

export function TimelineView({ posts, onPostClick, readOnly }: TimelineViewProps) {
  const { t } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getPostsForDay = (date: Date) => {
    return posts.filter((post) => {
      const postDate = new Date(post.start_at);
      return isSameDay(postDate, date);
    });
  };

  const prevMonth = () => {
    setCurrentMonth(addMonths(currentMonth, -1));
  };

  const nextMonth = () => {
    setCurrentMonth(addMonths(currentMonth, 1));
  };

  // Group posts by campaign
  const campaignGroups = posts.reduce((acc, post) => {
    const key = post.campaign_id || "no-campaign";
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {} as Record<string, Post[]>);

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

      <div className="overflow-x-auto">
        <div className="min-w-[800px]">
          {/* Timeline header */}
          <div className="grid grid-cols-[200px_1fr] gap-4 mb-4">
            <div className="font-semibold">{t("calendar.timeline.campaigns")}</div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(40px, 1fr))` }}>
              {days.map((day) => (
                <div key={day.toISOString()} className="text-center text-xs p-1 border-l">
                  <div className="font-medium">{format(day, "d")}</div>
                  <div className="text-muted-foreground">{format(day, "EEE")}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Timeline rows */}
          {Object.entries(campaignGroups).map(([campaignId, campaignPosts]) => (
            <div key={campaignId} className="grid grid-cols-[200px_1fr] gap-4 mb-2">
              <div className="py-2 font-medium truncate">
                {campaignId === "no-campaign" ? t("calendar.timeline.noCampaign") : `Campaign ${campaignId.slice(0, 8)}`}
              </div>
              <div className="relative" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(40px, 1fr))` }}>
                <div className="grid h-full" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(40px, 1fr))` }}>
                  {days.map((day) => (
                    <div key={day.toISOString()} className="border-l border-t border-b min-h-[60px] relative">
                      {getPostsForDay(day)
                        .filter((p) => (p.campaign_id || "no-campaign") === campaignId)
                        .map((post) => (
                          <div
                            key={post.id}
                            onClick={() => onPostClick(post)}
                            className="absolute top-1 left-1 right-1 cursor-pointer"
                          >
                            <Card className="p-1 hover:shadow-md transition-shadow">
                              <Badge
                                variant="outline"
                                className={`${statusColors[post.status]} text-white text-[10px] px-1 mb-0.5 block`}
                              >
                                {post.status}
                              </Badge>
                              <div className="text-xs font-medium truncate">{post.title}</div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                {post.channels.join(", ")}
                              </div>
                            </Card>
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {Object.keys(campaignGroups).length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              {t("calendar.timeline.noPosts")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
