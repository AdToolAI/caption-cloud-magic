import { Heart, MessageCircle, Send, Bookmark, MoreHorizontal, ThumbsUp, Share2, Repeat2, Play } from "lucide-react";
import { Instagram, Facebook, Linkedin, Youtube, Twitter, Music } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  platform: string;
  caption: string;
  hashtags: string[];
  mediaUrl?: string;
  mediaType?: "image" | "video";
  username?: string;
}

const PLATFORM_ICON: Record<string, typeof Instagram> = {
  instagram: Instagram,
  facebook: Facebook,
  linkedin: Linkedin,
  youtube: Youtube,
  x: Twitter,
  twitter: Twitter,
  tiktok: Music,
};

function MediaSlot({ mediaUrl, mediaType, aspect }: { mediaUrl?: string; mediaType?: "image" | "video"; aspect: string }) {
  if (!mediaUrl) {
    return (
      <div
        className={cn(
          "w-full flex items-center justify-center bg-gradient-to-br from-muted via-muted/60 to-muted/40 text-muted-foreground text-xs",
          aspect,
        )}
      >
        Noch keine Medien · im Editor unten hochladen
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <div className={cn("w-full bg-black relative", aspect)}>
        <video src={mediaUrl} className="w-full h-full object-cover" muted playsInline />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="h-12 w-12 rounded-full bg-black/40 backdrop-blur flex items-center justify-center">
            <Play className="h-6 w-6 text-white fill-white" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("w-full overflow-hidden", aspect)}>
      <img src={mediaUrl} alt="Vorschau" className="w-full h-full object-cover" />
    </div>
  );
}

function HashtagsLine({ hashtags }: { hashtags: string[] }) {
  if (!hashtags?.length) return null;
  return (
    <div className="text-xs text-primary mt-1 break-words">
      {hashtags.slice(0, 12).map((h) => `#${h.replace(/^#/, "")}`).join(" ")}
    </div>
  );
}

export function PostPreviewMockup({ platform, caption, hashtags, mediaUrl, mediaType, username = "you" }: Props) {
  const p = platform.toLowerCase();

  // Instagram-style
  if (p === "instagram" || p === "tiktok") {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-amber-400" />
            <span className="text-sm font-semibold">{username}</span>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <MediaSlot mediaUrl={mediaUrl} mediaType={mediaType} aspect="aspect-square" />
        <div className="px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5" />
              <MessageCircle className="h-5 w-5" />
              <Send className="h-5 w-5" />
            </div>
            <Bookmark className="h-5 w-5" />
          </div>
          <p className="text-sm leading-snug whitespace-pre-wrap">
            <span className="font-semibold mr-1">{username}</span>
            {caption || <span className="text-muted-foreground italic">Caption wird hier erscheinen…</span>}
          </p>
          <HashtagsLine hashtags={hashtags} />
        </div>
      </div>
    );
  }

  // Facebook-style
  if (p === "facebook") {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-blue-500" />
            <div>
              <div className="text-sm font-semibold">{username}</div>
              <div className="text-[10px] text-muted-foreground">Gerade eben · 🌍</div>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="px-3 pb-2">
          <p className="text-sm leading-snug whitespace-pre-wrap">
            {caption || <span className="text-muted-foreground italic">Caption wird hier erscheinen…</span>}
          </p>
          <HashtagsLine hashtags={hashtags} />
        </div>
        <MediaSlot mediaUrl={mediaUrl} mediaType={mediaType} aspect="aspect-[4/3]" />
        <div className="px-3 py-2 flex items-center gap-4 border-t border-border/40 text-muted-foreground">
          <ThumbsUp className="h-4 w-4" /> <MessageCircle className="h-4 w-4" /> <Share2 className="h-4 w-4" />
        </div>
      </div>
    );
  }

  // LinkedIn-style
  if (p === "linkedin") {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2">
          <div className="h-10 w-10 rounded-full bg-green-600" />
          <div>
            <div className="text-sm font-semibold">{username}</div>
            <div className="text-[10px] text-muted-foreground">Creator · Jetzt · 🌍</div>
          </div>
        </div>
        <div className="px-3 pb-2">
          <p className="text-sm leading-snug whitespace-pre-wrap">
            {caption || <span className="text-muted-foreground italic">Caption wird hier erscheinen…</span>}
          </p>
          <HashtagsLine hashtags={hashtags} />
        </div>
        <MediaSlot mediaUrl={mediaUrl} mediaType={mediaType} aspect="aspect-[16/9]" />
        <div className="px-3 py-2 flex items-center gap-4 border-t border-border/40 text-muted-foreground text-xs">
          <span className="flex items-center gap-1"><ThumbsUp className="h-3.5 w-3.5" /> Mögen</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Kommentieren</span>
          <span className="flex items-center gap-1"><Repeat2 className="h-3.5 w-3.5" /> Teilen</span>
        </div>
      </div>
    );
  }

  // YouTube-style (Shorts/Video)
  if (p === "youtube") {
    return (
      <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
        <MediaSlot mediaUrl={mediaUrl} mediaType={mediaType || "video"} aspect="aspect-video" />
        <div className="px-3 py-2 space-y-1">
          <p className="text-sm font-semibold leading-snug">
            {caption?.split("\n")[0] || <span className="text-muted-foreground italic">Titel/Caption…</span>}
          </p>
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-red-600" />
            <span className="text-xs text-muted-foreground">{username} · gerade eben</span>
          </div>
          <HashtagsLine hashtags={hashtags} />
        </div>
      </div>
    );
  }

  // X/Twitter-style
  return (
    <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-hidden">
      <div className="flex gap-2 p-3">
        <div className="h-10 w-10 rounded-full bg-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 text-sm">
            <span className="font-semibold">{username}</span>
            <span className="text-muted-foreground">@{username} · jetzt</span>
          </div>
          <p className="text-sm whitespace-pre-wrap mt-0.5">
            {caption || <span className="text-muted-foreground italic">Was passiert?</span>}
          </p>
          <HashtagsLine hashtags={hashtags} />
          {mediaUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border/50">
              <MediaSlot mediaUrl={mediaUrl} mediaType={mediaType} aspect="aspect-video" />
            </div>
          )}
          <div className="flex items-center gap-6 mt-2 text-muted-foreground text-xs">
            <MessageCircle className="h-4 w-4" />
            <Repeat2 className="h-4 w-4" />
            <Heart className="h-4 w-4" />
            <Share2 className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
