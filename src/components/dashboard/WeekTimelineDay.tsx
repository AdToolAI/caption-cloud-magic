import { cn } from "@/lib/utils";
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WeekPost } from "./WeekDayCard";

interface WeekTimelineDayProps {
  dayName: string;
  dayNumber: number;
  isToday: boolean;
  posts: WeekPost[];
  date: string;
  onRingClick: (post: WeekPost) => void;
  onAddPost: (date: string) => void;
}

const platformRingConfig: Record<string, {
  icon: typeof Instagram;
  ring: string;
  glow: string;
  dimmed: string;
  label: string;
}> = {
  instagram: {
    icon: Instagram,
    ring: "ring-purple-500",
    glow: "shadow-[0_0_14px_rgba(168,85,247,0.7)]",
    dimmed: "ring-purple-500/30",
    label: "Instagram",
  },
  youtube: {
    icon: Youtube,
    ring: "ring-red-500",
    glow: "shadow-[0_0_14px_rgba(239,68,68,0.7)]",
    dimmed: "ring-red-500/30",
    label: "YouTube",
  },
  facebook: {
    icon: Facebook,
    ring: "ring-blue-500",
    glow: "shadow-[0_0_14px_rgba(59,130,246,0.7)]",
    dimmed: "ring-blue-500/30",
    label: "Facebook",
  },
  linkedin: {
    icon: Linkedin,
    ring: "ring-green-500",
    glow: "shadow-[0_0_14px_rgba(34,197,94,0.7)]",
    dimmed: "ring-green-500/30",
    label: "LinkedIn",
  },
  x: {
    icon: Twitter,
    ring: "ring-violet-300",
    glow: "shadow-[0_0_14px_rgba(196,181,253,0.7)]",
    dimmed: "ring-violet-300/30",
    label: "X",
  },
  twitter: {
    icon: Twitter,
    ring: "ring-violet-300",
    glow: "shadow-[0_0_14px_rgba(196,181,253,0.7)]",
    dimmed: "ring-violet-300/30",
    label: "X",
  },
  tiktok: {
    icon: Music,
    ring: "ring-white",
    glow: "shadow-[0_0_14px_rgba(255,255,255,0.7)]",
    dimmed: "ring-white/30",
    label: "TikTok",
  },
};

export function WeekTimelineDay({ dayName, dayNumber, isToday, posts, date, onRingClick, onAddPost }: WeekTimelineDayProps) {
  return (
    <div className="flex flex-col items-center gap-2 min-w-[72px]">
      {/* Day label */}
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {dayName}
      </span>

      {/* Day number */}
      <span className={cn(
        "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all",
        isToday
          ? "bg-primary text-primary-foreground shadow-[0_0_16px_hsl(var(--primary)/0.5)]"
          : "bg-muted text-foreground"
      )}>
        {dayNumber}
      </span>

      {/* Platform rings */}
      <div className="flex flex-col items-center gap-1.5 mt-1">
        {posts.length === 0 ? (
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 rounded-full p-0 text-muted-foreground hover:text-primary"
            onClick={() => onAddPost(date)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        ) : (
          <>
            {posts.map((post) => {
              const config = platformRingConfig[post.platform] || platformRingConfig.instagram;
              const Icon = config.icon;
              const isPublished = post.status === "published";
              const isMissed = post.status === "missed";

              return (
                <button
                  key={post.id}
                  onClick={() => onRingClick(post)}
                  title={`${config.label} – ${post.contentIdea?.slice(0, 40)}`}
                  className={cn(
                    "w-10 h-10 rounded-full ring-2 flex items-center justify-center transition-all cursor-pointer",
                    "hover:scale-110 active:scale-95",
                    isPublished ? config.ring : config.dimmed,
                    isPublished && config.glow,
                    isMissed && "opacity-50 ring-orange-400/50",
                    !isPublished && !isMissed && "bg-background",
                    isPublished && "bg-background"
                  )}
                >
                  <Icon className={cn(
                    "h-4 w-4 transition-colors",
                    isPublished ? "text-foreground" : "text-muted-foreground"
                  )} />
                </button>
              );
            })}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 rounded-full p-0 text-muted-foreground hover:text-primary"
              onClick={() => onAddPost(date)}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
