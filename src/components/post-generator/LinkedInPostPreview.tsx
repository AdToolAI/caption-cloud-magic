import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MoreHorizontal, ThumbsUp, MessageCircle, Repeat2, Send } from "lucide-react";
import { useState } from "react";

interface LinkedInPostPreviewProps {
  mediaUrl: string;
  mediaType?: 'image' | 'video';
  caption: string;
  hook?: string;
  hashtags?: string[];
  profileName?: string;
  jobTitle?: string;
  profileImage?: string;
}

export const LinkedInPostPreview = ({
  mediaUrl,
  mediaType = 'image',
  caption,
  hook,
  hashtags = [],
  profileName = "Ihr Name",
  jobTitle = "Position",
  profileImage,
}: LinkedInPostPreviewProps) => {
  const [showFullCaption, setShowFullCaption] = useState(false);
  
  // Generate random engagement numbers (LinkedIn typically has lower engagement)
  const reactions = Math.floor(Math.random() * 100) + 20;
  const comments = Math.floor(Math.random() * 20) + 2;
  
  // Combine hook and caption
  const fullText = hook ? `${hook}\n\n${caption}` : caption;
  const shouldTruncate = fullText.length > 200;
  const displayText = (shouldTruncate && !showFullCaption) 
    ? fullText.slice(0, 200) + '...'
    : fullText;

  return (
    <Card className="max-w-[500px] mx-auto overflow-hidden border-border">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={profileImage} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {profileName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{profileName}</span>
              <span className="text-xs text-muted-foreground">{jobTitle}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <span>vor 2 Std.</span>
                <span>·</span>
                <span>🌍</span>
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </div>

        {/* Caption */}
        <div className="mt-3 text-sm whitespace-pre-wrap">
          {hook && (
            <span className="font-semibold block mb-2">{hook}</span>
          )}
          <span>{caption}</span>
          {shouldTruncate && (
            <button
              onClick={() => setShowFullCaption(!showFullCaption)}
              className="text-muted-foreground hover:text-primary ml-1 font-medium"
            >
              {showFullCaption ? '...weniger anzeigen' : '...mehr anzeigen'}
            </button>
          )}
          {hashtags.length > 0 && (
            <div className="mt-3">
              {hashtags.slice(0, 5).map((tag, idx) => (
                <span key={idx} className="text-primary mr-2 cursor-pointer hover:underline">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Media */}
      <div className="mt-3 bg-muted">
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            controls
            preload="metadata"
            playsInline
            className="w-full h-auto object-cover"
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Post"
            className="w-full h-auto object-cover"
          />
        )}
      </div>

      {/* Engagement Stats */}
      <div className="px-4 py-2">
        <div className="flex items-center gap-1 text-sm">
          <div className="flex -space-x-1">
            <div className="w-5 h-5 rounded-full bg-[#0a66c2] flex items-center justify-center border-2 border-background">
              <ThumbsUp className="h-3 w-3 text-white fill-white" />
            </div>
            <div className="w-5 h-5 rounded-full bg-[#44712e] flex items-center justify-center border-2 border-background">
              <span className="text-xs text-white">💡</span>
            </div>
            <div className="w-5 h-5 rounded-full bg-[#df704d] flex items-center justify-center border-2 border-background">
              <span className="text-xs text-white">❤️</span>
            </div>
          </div>
          <span className="ml-1 text-muted-foreground">{reactions}</span>
        </div>
        {comments > 0 && (
          <div className="text-xs text-muted-foreground mt-1">
            {comments} Kommentare
          </div>
        )}
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="px-2 py-1.5 grid grid-cols-4 gap-1">
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <ThumbsUp className="h-5 w-5" />
          <span className="text-sm font-medium">Gefällt mir</span>
        </Button>
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <MessageCircle className="h-5 w-5" />
          <span className="text-sm font-medium">Kommentieren</span>
        </Button>
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <Repeat2 className="h-5 w-5" />
          <span className="text-sm font-medium">Teilen</span>
        </Button>
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <Send className="h-5 w-5" />
          <span className="text-sm font-medium">Senden</span>
        </Button>
      </div>
    </Card>
  );
};
