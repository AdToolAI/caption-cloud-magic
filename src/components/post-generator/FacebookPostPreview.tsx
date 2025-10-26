import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, ThumbsUp, MessageCircle, Share2, Heart, Smile } from "lucide-react";
import { useState } from "react";

interface FacebookPostPreviewProps {
  imageUrl: string;
  caption: string;
  hook?: string;
  hashtags?: string[];
  profileName?: string;
  profileImage?: string;
  additionalDescription?: string;
}

export const FacebookPostPreview = ({
  imageUrl,
  caption,
  hook,
  hashtags = [],
  profileName = "Ihr Profil",
  profileImage,
  additionalDescription,
}: FacebookPostPreviewProps) => {
  const [showFullCaption, setShowFullCaption] = useState(false);
  
  // Generate random engagement numbers
  const likes = Math.floor(Math.random() * 300) + 50;
  const comments = Math.floor(Math.random() * 40) + 5;
  const shares = Math.floor(Math.random() * 20) + 2;
  
  // Combine hook and caption
  const fullText = hook ? `${hook}\n\n${caption}` : caption;
  const hashtagText = hashtags.length > 0 ? `\n\n${hashtags.join(' ')}` : '';
  const completeText = fullText + hashtagText;
  
  // Truncate caption
  const shouldTruncate = completeText.length > 200;
  const displayText = (shouldTruncate && !showFullCaption) 
    ? completeText.slice(0, 200) + '...'
    : completeText;

  return (
    <Card className="max-w-[500px] mx-auto overflow-hidden border-border">
      {/* Header */}
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={profileImage} />
              <AvatarFallback className="bg-primary text-primary-foreground">
                {profileName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-semibold text-sm">{profileName}</span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Badge variant="secondary" className="px-1.5 py-0 text-xs h-auto">
                  Gesponsert
                </Badge>
                <span>·</span>
                <span>vor 2 Min.</span>
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
            <span className="font-semibold block mb-1">{hook.replace(/\*\*/g, '')}</span>
          )}
          <span>{caption.replace(/\*\*/g, '')}</span>
          
          {/* Additional Description */}
          {additionalDescription && (
            <div className="mt-2 text-muted-foreground italic">
              {additionalDescription}
            </div>
          )}
          
          {hashtags.length > 0 && (
            <div className="mt-2">
              {hashtags.map((tag, idx) => (
                <span key={idx} className="text-primary mr-1 cursor-pointer hover:underline">
                  {tag}
                </span>
              ))}
            </div>
          )}
          {shouldTruncate && (
            <button
              onClick={() => setShowFullCaption(!showFullCaption)}
              className="text-muted-foreground hover:underline ml-1"
            >
              {showFullCaption ? 'Weniger anzeigen' : 'Mehr anzeigen'}
            </button>
          )}
        </div>
      </div>

      {/* Image */}
      <div className="relative w-full bg-muted">
        <img
          src={imageUrl}
          alt="Post"
          className="w-full h-auto object-cover"
          style={{ aspectRatio: '1 / 1' }}
        />
      </div>

      {/* Engagement Stats */}
      <div className="px-4 py-2">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-1">
              <div className="w-5 h-5 rounded-full bg-[#1877f2] flex items-center justify-center border-2 border-background">
                <ThumbsUp className="h-3 w-3 text-white fill-white" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#f33e58] flex items-center justify-center border-2 border-background">
                <Heart className="h-3 w-3 text-white fill-white" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#f7b125] flex items-center justify-center border-2 border-background">
                <Smile className="h-3 w-3 text-white fill-white" />
              </div>
            </div>
            <span className="ml-1">{likes}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{comments} Kommentare</span>
            <span>·</span>
            <span>{shares} mal geteilt</span>
          </div>
        </div>
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="px-2 py-1 grid grid-cols-3 gap-1">
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <ThumbsUp className="h-4 w-4" />
          <span className="text-sm font-medium">Gefällt mir</span>
        </Button>
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <MessageCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Kommentieren</span>
        </Button>
        <Button variant="ghost" className="flex items-center gap-2 justify-center">
          <Share2 className="h-4 w-4" />
          <span className="text-sm font-medium">Teilen</span>
        </Button>
      </div>
    </Card>
  );
};
