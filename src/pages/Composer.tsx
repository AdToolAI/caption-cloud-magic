import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { CharacterCounter } from "@/components/composer/CharacterCounter";
import { MediaUploader } from "@/components/composer/MediaUploader";
import { ChannelSelector } from "@/components/composer/ChannelSelector";
import { PublishResultCard } from "@/components/composer/PublishResultCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Send, Loader2 } from "lucide-react";
import type { Provider, PublishPayload, PublishResult, MediaItem } from "@/types/publish";

const DRAFT_KEY = "composer_draft";

export default function Composer() {
  const { toast } = useToast();
  const [textContent, setTextContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Provider[]>(["instagram", "facebook", "x"]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);

  // Load draft from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const draft = JSON.parse(saved);
        setTextContent(draft.text || "");
        setSelectedChannels(draft.channels || ["instagram", "facebook", "x"]);
      } catch (error) {
        console.error("Failed to load draft:", error);
      }
    }
  }, []);

  // Save draft to localStorage
  useEffect(() => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        text: textContent,
        channels: selectedChannels,
      })
    );
  }, [textContent, selectedChannels]);

  // Check video duration when video is selected
  useEffect(() => {
    const videoFile = selectedMedia.find((f) => f.type.startsWith("video/"));
    if (videoFile) {
      checkVideoDuration(videoFile);
    } else {
      setVideoDuration(null);
    }
  }, [selectedMedia]);

  const checkVideoDuration = async (file: File): Promise<void> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        setVideoDuration(video.duration);
        resolve();
      };
      video.onerror = () => {
        setVideoDuration(null);
        resolve();
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const uploadMediaToStorage = async (files: File[]): Promise<MediaItem[]> => {
    const uploadedMedia: MediaItem[] = [];

    for (const file of files) {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `public/${fileName}`;

      const { data, error } = await supabase.storage
        .from("media-assets")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        throw new Error(`Upload failed for ${file.name}: ${error.message}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("media-assets").getPublicUrl(data.path);

      uploadedMedia.push({
        type: file.type.startsWith("video/") ? "video" : "image",
        path: publicUrl,
        mime: file.type,
        size: file.size,
      });
    }

    return uploadedMedia;
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setPublishResults([]);

    try {
      // Upload media if present
      let uploadedMedia: MediaItem[] = [];
      if (selectedMedia.length > 0) {
        toast({
          title: "Uploading media...",
          description: "Please wait while we upload your files.",
        });
        uploadedMedia = await uploadMediaToStorage(selectedMedia);
      }

      // Prepare payload
      const payload: PublishPayload = {
        text: textContent,
        media: uploadedMedia.length > 0 ? uploadedMedia : undefined,
        channels: selectedChannels,
      };

      // Call publish edge function
      const { data, error } = await supabase.functions.invoke("publish", {
        body: payload,
      });

      if (error) throw error;

      setPublishResults(data.results || []);

      const successCount = data.results.filter((r: PublishResult) => r.ok).length;
      const failCount = data.results.length - successCount;

      if (successCount > 0) {
        toast({
          title: "Publishing complete",
          description: `${successCount} successful, ${failCount} failed.`,
        });
      } else {
        toast({
          title: "Publishing failed",
          description: "All channels failed to publish.",
          variant: "destructive",
        });
      }

      // Clear form on success
      if (successCount === data.results.length) {
        setTextContent("");
        setSelectedMedia([]);
        localStorage.removeItem(DRAFT_KEY);
      }
    } catch (error: any) {
      console.error("Publishing error:", error);
      toast({
        title: "Publishing failed",
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsPublishing(false);
    }
  };

  // Validation rules
  const hasMedia = selectedMedia.length > 0;
  const hasText = textContent.trim().length > 0;
  const instagramSelected = selectedChannels.includes("instagram");
  const xSelected = selectedChannels.includes("x");
  const linkedinSelected = selectedChannels.includes("linkedin");
  const videoSelected = selectedMedia.some((f) => f.type.startsWith("video/"));
  const videoTooLongForX = xSelected && videoSelected && videoDuration !== null && videoDuration > 140;

  const characterLimits: Record<Provider, number> = {
    x: 280,
    instagram: 2200,
    linkedin: 3000,
    facebook: 5000,
    tiktok: 2200,
    youtube: 5000,
  };

  const activeLimit = selectedChannels.length > 0 ? Math.min(...selectedChannels.map((c) => characterLimits[c])) : 5000;
  const exceedsLimit = textContent.length > activeLimit;

  const isDisabled =
    isPublishing ||
    selectedChannels.length === 0 ||
    (!hasText && !hasMedia) ||
    (instagramSelected && !hasMedia) ||
    videoTooLongForX ||
    exceedsLimit;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Breadcrumbs category="publish" />
          <h1 className="text-3xl font-bold mt-2">Multi-Channel Composer</h1>
          <p className="text-muted-foreground">Publish content to multiple social media platforms at once</p>
        </div>
        <CreditBalance />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create Post</CardTitle>
            <CardDescription>Compose your message and select target channels</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Text Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Post Content</label>
              <Textarea
                placeholder="What do you want to share?"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={6}
                className="resize-none"
              />
              <CharacterCounter text={textContent} channels={selectedChannels} />
            </div>

            {/* Media Upload */}
            <MediaUploader selectedMedia={selectedMedia} onMediaChange={setSelectedMedia} />

            {/* Video Length Warning */}
            {videoTooLongForX && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Video is too long for X (max 2:20 min). Current: {Math.floor(videoDuration! / 60)}:
                  {Math.floor(videoDuration! % 60)
                    .toString()
                    .padStart(2, "0")}
                </AlertDescription>
              </Alert>
            )}

            {/* Channel Selection */}
            <ChannelSelector selectedChannels={selectedChannels} onChannelsChange={setSelectedChannels} />

            {/* LinkedIn Warning */}
            {linkedinSelected && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  ⚠️ LinkedIn-Sync eingeschränkt. UGC-Post möglich; bei 403 wird kein Fehler angezeigt.
                </AlertDescription>
              </Alert>
            )}

            {/* Instagram Media Warning */}
            {instagramSelected && !hasMedia && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Instagram requires at least one image or video.</AlertDescription>
              </Alert>
            )}

            {/* Publish Button */}
            <Button onClick={handlePublish} disabled={isDisabled} className="w-full" size="lg">
              {isPublishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Post Now
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Panel */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Publishing Status</CardTitle>
              <CardDescription>Results will appear here after publishing</CardDescription>
            </CardHeader>
            <CardContent>
              {publishResults.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  <Send className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No results yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {publishResults.map((result) => (
                    <PublishResultCard key={result.provider} result={result} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
