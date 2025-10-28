import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";
import { FacebookPostPreview } from "@/components/post-generator/FacebookPostPreview";
import { InstagramPostPreview } from "@/components/post-generator/InstagramPostPreview";
import { LinkedInPostPreview } from "@/components/post-generator/LinkedInPostPreview";
import { XPostPreview } from "@/components/post-generator/XPostPreview";
import { useState, useMemo } from "react";
import { Provider } from "@/types/publish";

interface ComposerPreviewProps {
  textContent: string;
  selectedMedia: File[];
  selectedChannels: Provider[];
  profileName?: string;
  profileImage?: string;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  additionalDescription?: string;
}

export function ComposerPreview({
  textContent,
  selectedMedia,
  selectedChannels,
  profileName = "Ihr Profil",
  profileImage,
  hook,
  caption,
  hashtags,
  additionalDescription,
}: ComposerPreviewProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<Provider | null>(null);

  // Generate preview URL for media
  const mediaPreviewUrl = useMemo(() => {
    if (selectedMedia.length === 0) return null;
    
    const file = selectedMedia[0] as File & { url?: string };
    
    // If file has direct URL (videos from AI Post Generator), use it for streaming
    if (file.url) {
      return file.url;
    }
    
    // Otherwise create object URL (for locally uploaded files)
    return URL.createObjectURL(file);
  }, [selectedMedia]);

  // Auto-select first available platform
  const activePlatform = selectedPlatform || selectedChannels[0] || null;

  // Show placeholder if no channels selected
  if (selectedChannels.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-12">
        <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-sm">Wählen Sie mindestens einen Channel aus, um die Vorschau zu sehen</p>
      </div>
    );
  }

  // Show placeholder if no content
  if (!textContent && !mediaPreviewUrl) {
    return (
      <div className="text-center text-muted-foreground p-12">
        <Sparkles className="h-16 w-16 mx-auto mb-4 opacity-50" />
        <p className="text-sm">Vorschau erscheint nach Eingabe von Text oder Upload von Medien</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Platform Selector */}
      {selectedChannels.length > 1 && (
        <div className="flex gap-2 flex-wrap justify-center">
          {selectedChannels.map((channel) => (
            <Button
              key={channel}
              variant={activePlatform === channel ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedPlatform(channel)}
              className="capitalize"
            >
              {channel === 'x' ? 'X (Twitter)' : channel}
            </Button>
          ))}
        </div>
      )}

      {/* Preview Rendering */}
      <div className="border rounded-lg p-4 bg-muted/30">
        {activePlatform === 'facebook' && (
          <FacebookPostPreview
            mediaUrl={mediaPreviewUrl || ''}
            mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'}
            caption={caption || textContent}
            hook={hook || ""}
            hashtags={hashtags || []}
            profileName={profileName}
            profileImage={profileImage}
            additionalDescription={additionalDescription}
          />
        )}

        {activePlatform === 'instagram' && (
          <InstagramPostPreview
            mediaUrl={mediaPreviewUrl || ''}
            mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'}
            caption={caption || textContent}
            hook={hook || ""}
            hashtags={hashtags || []}
            username={profileName.toLowerCase().replace(/\s+/g, '_')}
            profileImage={profileImage}
          />
        )}

        {activePlatform === 'linkedin' && (
          <LinkedInPostPreview
            mediaUrl={mediaPreviewUrl || ''}
            mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'}
            caption={caption || textContent}
            hook={hook || ""}
            hashtags={hashtags || []}
            profileName={profileName}
            jobTitle="Marketing Manager"
            profileImage={profileImage}
          />
        )}

        {activePlatform === 'x' && (
          <XPostPreview
            mediaUrl={mediaPreviewUrl || ''}
            mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'}
            caption={(caption || textContent).slice(0, 280)}
            hashtags={hashtags || []}
            displayName={profileName}
            handle={`@${profileName.toLowerCase().replace(/\s+/g, '_')}`}
            profileImage={profileImage}
            verified={false}
          />
        )}

        {activePlatform === 'tiktok' && (
          <Alert>
            <AlertDescription>
              TikTok-Vorschau ist aktuell nicht verfügbar. Ihr Video wird wie konfiguriert hochgeladen.
            </AlertDescription>
          </Alert>
        )}

        {activePlatform === 'youtube' && (
          <Alert>
            <AlertDescription>
              YouTube-Vorschau ist aktuell nicht verfügbar. Ihr Video wird wie konfiguriert hochgeladen.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
