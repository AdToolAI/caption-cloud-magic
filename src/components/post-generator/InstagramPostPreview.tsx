import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Heart, MessageCircle, Send, Bookmark } from "lucide-react";
import { useState } from "react";

interface InstagramPostPreviewProps {
  mediaUrl: string;
  mediaType?: 'image' | 'video';
  caption: string;
  hook?: string;
  hashtags?: string[];
  username?: string;
  profileImage?: string;
}

export const InstagramPostPreview = ({
  mediaUrl,
  mediaType = 'image',
  caption,
  hook,
  hashtags = [],
  username = "ihr_profil",
  profileImage,
}: InstagramPostPreviewProps) => {
  const [showFullCaption, setShowFullCaption] = useState(false);
  
  // Generate random engagement numbers
  const likes = Math.floor(Math.random() * 500) + 100;
  const comments = Math.floor(Math.random() * 50) + 5;
  
  // Combine caption and hashtags
  const fullText = caption + (hashtags.length > 0 ? '\n' + hashtags.join(' ') : '');
  const shouldTruncate = fullText.length > 150;
  const displayCaption = (shouldTruncate && !showFullCaption) 
    ? fullText.slice(0, 150) + '...'
    : fullText;

  return (
    <Card className="max-w-[500px] mx-auto overflow-hidden border-border">
      {/* Header */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarImage src={profileImage} />
            <AvatarFallback className="bg-primary text-primary-foreground">
              {username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-sm">{username}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreHorizontal className="h-5 w-5" />
        </Button>
      </div>

      {/* Media */}
      <div className="relative w-full bg-muted">
        {mediaType === 'video' ? (
          <video
            src={mediaUrl}
            controls
            className="w-full h-auto object-cover"
            style={{ aspectRatio: '1 / 1' }}
          />
        ) : (
          <img
            src={mediaUrl}
            alt="Post"
            className="w-full h-auto object-cover"
            style={{ aspectRatio: '1 / 1' }}
          />
        )}
      </div>

      {/* Action Icons */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <Heart className="h-6 w-6" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <MessageCircle className="h-6 w-6" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
              <Send className="h-6 w-6" />
            </Button>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 p-0">
            <Bookmark className="h-6 w-6" />
          </Button>
        </div>

        {/* Likes */}
        <div className="mb-2">
          <span className="font-semibold text-sm">Gefällt {likes.toLocaleString('de-DE')} Mal</span>
        </div>

        {/* Caption */}
        <div className="text-sm">
          <span className="font-semibold mr-2">{username}</span>
          {hook && (
            <span className="font-semibold">{hook} </span>
          )}
          <span className="whitespace-pre-wrap">
            {caption}
            {hashtags.length > 0 && !showFullCaption && shouldTruncate && '... '}
          </span>
          {shouldTruncate && (
            <button
              onClick={() => setShowFullCaption(!showFullCaption)}
              className="text-muted-foreground ml-1"
            >
              {showFullCaption ? 'weniger' : 'mehr'}
            </button>
          )}
          {(showFullCaption || !shouldTruncate) && hashtags.length > 0 && (
            <div className="mt-1">
              {hashtags.map((tag, idx) => (
                <span key={idx} className="text-primary mr-1">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="mt-2">
          <button className="text-sm text-muted-foreground">
            Alle {comments} Kommentare ansehen
          </button>
        </div>

        {/* Timestamp */}
        <div className="mt-1">
          <span className="text-xs text-muted-foreground uppercase">VOR 5 MINUTEN</span>
        </div>
      </div>
    </Card>
  );
};
