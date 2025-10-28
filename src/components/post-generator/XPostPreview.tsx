import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MoreHorizontal, MessageCircle, Repeat2, Heart, Bookmark, Share, BarChart3 } from "lucide-react";

interface XPostPreviewProps {
  mediaUrl: string;
  mediaType?: 'image' | 'video';
  caption: string;
  hashtags?: string[];
  displayName?: string;
  handle?: string;
  profileImage?: string;
  verified?: boolean;
}

export const XPostPreview = ({
  mediaUrl,
  mediaType = 'image',
  caption,
  hashtags = [],
  displayName = "Ihr Name",
  handle = "@ihr_handle",
  profileImage,
  verified = false,
}: XPostPreviewProps) => {
  // Generate random engagement numbers
  const replies = Math.floor(Math.random() * 30) + 5;
  const retweets = Math.floor(Math.random() * 15) + 2;
  const likes = Math.floor(Math.random() * 150) + 20;
  const views = Math.floor(Math.random() * 1500) + 100;
  
  // Combine caption and hashtags (Twitter has 280 char limit)
  const fullText = caption.slice(0, 280);
  const hashtagText = hashtags.length > 0 ? '\n\n' + hashtags.join(' ') : '';
  const completeText = (fullText + hashtagText).slice(0, 280);

  return (
    <Card className="max-w-[500px] mx-auto overflow-hidden border-border">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarImage src={profileImage} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 flex-wrap">
                <span className="font-bold text-sm truncate">{displayName}</span>
                {verified && (
                  <Badge variant="default" className="h-4 w-4 p-0 rounded-full bg-primary">
                    <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                    </svg>
                  </Badge>
                )}
                <span className="text-muted-foreground text-sm truncate">{handle}</span>
                <span className="text-muted-foreground">·</span>
                <span className="text-muted-foreground text-sm">5m</span>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>

            {/* Tweet Text */}
            <div className="mt-2 text-sm whitespace-pre-wrap break-words">
              <span>{caption}</span>
              {hashtags.length > 0 && (
                <div className="mt-2">
                  {hashtags.map((tag, idx) => (
                    <span key={idx} className="text-primary mr-1 cursor-pointer hover:underline">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Media */}
            {mediaUrl && (
              <div className="mt-3 border border-border rounded-2xl overflow-hidden">
                {mediaType === 'video' ? (
                  <video
                    src={mediaUrl}
                    controls
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
            )}

            {/* Engagement Stats */}
            <div className="mt-3 flex items-center gap-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                <span>{replies}</span>
              </div>
              <div className="flex items-center gap-1">
                <Repeat2 className="h-4 w-4" />
                <span>{retweets}</span>
              </div>
              <div className="flex items-center gap-1">
                <Heart className="h-4 w-4" />
                <span>{likes}</span>
              </div>
              <div className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" />
                <span>{views.toLocaleString('de-DE')}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-3 flex items-center justify-between max-w-md">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <MessageCircle className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Repeat2 className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Heart className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Bookmark className="h-5 w-5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <Share className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
