import { Heart, MessageCircle, Share2, Bookmark, Music, Plus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface TikTokPostPreviewProps {
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  caption: string;
  hashtags?: string[];
  profileName?: string;
  profileImage?: string;
}

export const TikTokPostPreview = ({
  mediaUrl,
  mediaType = 'video',
  caption,
  hashtags = [],
  profileName = "mein_profil",
  profileImage,
}: TikTokPostPreviewProps) => {
  const hashtagText = hashtags.length > 0
    ? ' ' + hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
    : '';

  const fullCaption = caption + hashtagText;

  return (
    <div className="relative w-[270px] h-[480px] bg-black rounded-2xl overflow-hidden border border-white/10 shadow-2xl mx-auto">
      {/* Video/Image Background */}
      <div className="absolute inset-0">
        {mediaUrl ? (
          mediaType === 'video' ? (
            <video
              src={mediaUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
            />
          ) : (
            <img src={mediaUrl} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <div className="w-full h-full bg-gradient-to-b from-zinc-800 to-zinc-900 flex items-center justify-center">
            <Music className="h-12 w-12 text-white/20" />
          </div>
        )}
      </div>

      {/* Gradient overlay bottom */}
      <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/30 to-transparent pointer-events-none" />

      {/* Right sidebar icons */}
      <div className="absolute right-3 bottom-24 flex flex-col items-center gap-4">
        {/* Profile */}
        <div className="relative mb-2">
          <Avatar className="h-10 w-10 border-2 border-white">
            <AvatarImage src={profileImage} />
            <AvatarFallback className="bg-pink-500 text-white text-xs font-bold">
              {profileName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-4 h-4 bg-[#fe2c55] rounded-full flex items-center justify-center">
            <Plus className="h-2.5 w-2.5 text-white" />
          </div>
        </div>

        {/* Like */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Heart className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-[10px] font-medium">0</span>
        </div>

        {/* Comment */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <MessageCircle className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-[10px] font-medium">0</span>
        </div>

        {/* Share */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Share2 className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-[10px] font-medium">0</span>
        </div>

        {/* Bookmark */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
            <Bookmark className="h-5 w-5 text-white" />
          </div>
          <span className="text-white text-[10px] font-medium">0</span>
        </div>

        {/* Music disc */}
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-900 border-2 border-zinc-600 animate-spin" style={{ animationDuration: '3s' }} />
      </div>

      {/* Bottom caption area */}
      <div className="absolute bottom-4 left-3 right-16 space-y-2">
        <p className="text-white font-semibold text-sm drop-shadow-lg">@{profileName}</p>
        <p className="text-white/90 text-xs leading-relaxed line-clamp-3 drop-shadow-md">
          {fullCaption}
        </p>

        {/* Music bar */}
        <div className="flex items-center gap-1.5 mt-1">
          <Music className="h-3 w-3 text-white/70 shrink-0" />
          <div className="overflow-hidden">
            <p className="text-white/70 text-[10px] whitespace-nowrap animate-marquee">
              Originalton – @{profileName}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
