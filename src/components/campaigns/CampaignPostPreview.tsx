import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Instagram, Facebook, Linkedin, Video as VideoIcon } from "lucide-react";
import { InstagramPostPreview } from "@/components/post-generator/InstagramPostPreview";
import { FacebookPostPreview } from "@/components/post-generator/FacebookPostPreview";
import { LinkedInPostPreview } from "@/components/post-generator/LinkedInPostPreview";

interface CampaignPostPreviewProps {
  platforms: string[];
  mediaUrl?: string;
  mediaType?: 'image' | 'video';
  caption: string;
  hook?: string;
  hashtags: string[];
  username?: string;
}

export const CampaignPostPreview = ({
  platforms,
  mediaUrl,
  mediaType = 'image',
  caption,
  hook,
  hashtags,
  username = "mein_profil",
}: CampaignPostPreviewProps) => {
  // Filter to supported platforms with previews
  const supportedPlatforms = platforms.filter(p => 
    ['instagram', 'facebook', 'linkedin'].includes(p)
  );

  if (supportedPlatforms.length === 0) {
    // Show placeholder for unsupported platforms
    return (
      <div className="p-6 text-center text-muted-foreground text-sm border border-dashed border-white/20 rounded-xl">
        <VideoIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Vorschau für {platforms.join(", ")} nicht verfügbar</p>
      </div>
    );
  }

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'instagram':
        return <Instagram className="h-3 w-3" />;
      case 'facebook':
        return <Facebook className="h-3 w-3" />;
      case 'linkedin':
        return <Linkedin className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const fullCaption = hook 
    ? `${hook}\n\n${caption}` 
    : caption;

  return (
    <Tabs defaultValue={supportedPlatforms[0]} className="w-full">
      <TabsList className="w-full justify-start bg-muted/30 border border-white/10">
        {supportedPlatforms.map((platform) => (
          <TabsTrigger 
            key={platform} 
            value={platform}
            className="gap-1 text-xs capitalize data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
          >
            {getPlatformIcon(platform)}
            {platform}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="instagram" className="mt-3">
        <div className="scale-90 origin-top-left">
          <InstagramPostPreview
            mediaUrl={mediaUrl || "/placeholder.svg"}
            mediaType={mediaType}
            caption={fullCaption}
            hashtags={hashtags}
            username={username}
          />
        </div>
      </TabsContent>

      <TabsContent value="facebook" className="mt-3">
        <div className="scale-90 origin-top-left">
          <FacebookPostPreview
            mediaUrl={mediaUrl || "/placeholder.svg"}
            mediaType={mediaType}
            caption={fullCaption}
            hashtags={hashtags}
            profileName={username}
          />
        </div>
      </TabsContent>

      <TabsContent value="linkedin" className="mt-3">
        <div className="scale-90 origin-top-left">
          <LinkedInPostPreview
            mediaUrl={mediaUrl || "/placeholder.svg"}
            mediaType={mediaType}
            caption={fullCaption}
            hashtags={hashtags}
            profileName={username}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
};
