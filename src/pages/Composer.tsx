import { useState, useEffect, useLayoutEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CreditBalance } from "@/components/credits/CreditBalance";
import { CharacterCounter } from "@/components/composer/CharacterCounter";
import { MediaUploader } from "@/components/composer/MediaUploader";
import { ChannelSelector } from "@/components/composer/ChannelSelector";
import { ChannelConfigModal } from "@/components/composer/ChannelConfigModal";
import { PublishResultCard } from "@/components/composer/PublishResultCard";
import { ComposerPreview } from "@/components/composer/ComposerPreview";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, Send, Loader2 } from "lucide-react";
import type { Provider, PublishPayload, PublishResult, MediaItem } from "@/types/publish";

interface ChannelConfig {
  profileId?: string;
  autoFix: boolean;
  watermarkOverride?: any;
  timeOffset: number;
}

const DRAFT_KEY = "composer_draft";

export default function Composer() {
  const { toast } = useToast();
  const [textContent, setTextContent] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<Provider[]>(["instagram", "facebook", "x"]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<PublishResult[]>([]);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [channelConfigs, setChannelConfigs] = useState<Partial<Record<Provider, ChannelConfig>>>({});
  const [showConfigModal, setShowConfigModal] = useState<Provider | null>(null);
  const [importedMediaUrl, setImportedMediaUrl] = useState<string | null>(null);
  const [postData, setPostData] = useState<{ hook: string; caption: string; hashtags: string[] } | null>(null);
  const [hasImport, setHasImport] = useState(false);
  const [additionalDescription, setAdditionalDescription] = useState("");

  // Parse text content into structured data for preview
  const parseTextToStructured = (text: string) => {
    if (!text.trim()) return null;
    
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) return null;
    
    // First non-empty line is the hook
    const hook = lines[0];
    
    // Last line with hashtags
    const lastLine = lines[lines.length - 1];
    const hashtagLine = lastLine.includes('#') ? lastLine : '';
    const hashtags = hashtagLine
      .split(' ')
      .filter(word => word.startsWith('#'))
      .map(tag => tag.trim());
    
    // Everything in between is caption
    const captionLines = hashtagLine 
      ? lines.slice(1, -1) 
      : lines.slice(1);
    const caption = captionLines.join('\n');
    
    return {
      hook,
      caption,
      hashtags,
    };
  };

  // Load import from AI Post Generator (localStorage with expiry or sessionStorage)
  // CRITICAL: Use useLayoutEffect to ensure hasImport is set BEFORE draft-load effect runs
  useLayoutEffect(() => {
    // Try localStorage first (persists through auth redirects)
    let importData = localStorage.getItem('composer_import');
    let isFromLocalStorage = false;
    
    if (importData) {
      isFromLocalStorage = true;
      console.log('[Composer Import] Found import in localStorage');
    } else {
      // Fallback to sessionStorage (direct flow)
      importData = sessionStorage.getItem('composer_import');
      if (importData) {
        console.log('[Composer Import] Found import in sessionStorage');
      }
    }
    
    if (importData) {
      try {
        const data = JSON.parse(importData);
        
        // Check expiry (5 minutes)
        if (data.timestamp && (Date.now() - data.timestamp > 5 * 60 * 1000)) {
          console.log('[Composer Import] Import expired, clearing');
          if (isFromLocalStorage) {
            localStorage.removeItem('composer_import');
          } else {
            sessionStorage.removeItem('composer_import');
          }
          return;
        }
        
        console.log('[Composer Import] Received data:', {
          hasHook: !!data.hook,
          hasCaption: !!data.caption,
          hasHashtags: !!data.hashtags,
          hasText: !!data.text,
          hasImageUrl: !!data.imageUrl,
          platforms: data.platforms,
          source: isFromLocalStorage ? 'localStorage' : 'sessionStorage',
        });
        
        // CRITICAL: Mark import FIRST, before setting any other state
        setHasImport(true);
        console.log('[Composer Import] hasImport set to TRUE');
        
        // Set text content - Build from structured data if available
        const combinedText = data.text || `${data.hook || ''}\n\n${data.caption || ''}\n\n${(data.hashtags || []).join(' ')}`;
        console.log('[Composer Import] Setting textContent (length: ' + combinedText.length + '):', combinedText.substring(0, 100) + '...');
        setTextContent(combinedText);
        
        // Store structured data for preview - set immediately for sync
        if (data.hook && data.caption && data.hashtags) {
          setPostData({
            hook: data.hook,
            caption: data.caption,
            hashtags: data.hashtags,
          });
        }
        
        // Set channels
        if (data.platforms && data.platforms.length > 0) {
          console.log('[Composer Import] Setting channels:', data.platforms);
          setSelectedChannels(data.platforms);
        }
        
        // Store imageUrl for reuse (avoid re-uploading)
        if (data.imageUrl) {
          console.log('[Composer Import] Setting imported media URL');
          setImportedMediaUrl(data.imageUrl);
          
          // Load image preview for UI
          fetch(data.imageUrl)
            .then(res => res.blob())
            .then(blob => {
              const file = new File([blob], 'generated-image.jpg', { type: 'image/jpeg' });
              setSelectedMedia([file]);
              console.log('[Composer Import] Media preview loaded');
            })
            .catch(err => console.error('[Composer Import] Failed to load image:', err));
        }
        
        toast({
          title: "✅ Post importiert",
          description: "Der KI-generierte Post wurde geladen. Jetzt können Sie ihn publizieren!",
        });
        
        // Clear after successful import
        if (isFromLocalStorage) {
          localStorage.removeItem('composer_import');
        } else {
          sessionStorage.removeItem('composer_import');
        }
      } catch (error) {
        console.error('[Composer Import] Failed to load import:', error);
      }
    }
  }, [toast]);
  // Debug: Monitor textContent changes
  useEffect(() => {
    console.log('[Composer Debug] textContent changed:', {
      length: textContent.length,
      preview: textContent.substring(0, 50),
      hasImport,
    });
  }, [textContent, hasImport]);

  // Load draft from localStorage - ONLY if no import happened
  useEffect(() => {
    // Wait a tick to ensure import hook ran first
    const timeoutId = setTimeout(() => {
      console.log('[Composer Draft] Checking draft load, hasImport:', hasImport);
      if (hasImport) {
        console.log('[Composer Draft] Skipping draft load because import happened');
        return;
      }

      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        try {
          const draft = JSON.parse(saved);
          setTextContent(draft.text || "");
          setSelectedChannels(draft.channels || ["instagram", "facebook", "x"]);
          console.log('[Composer Draft] Loaded draft from localStorage');
        } catch (error) {
          console.error("Failed to load draft:", error);
        }
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, []); // Empty dependencies - runs only once on mount

  // Save draft to localStorage - but NOT if import just happened
  useEffect(() => {
    // Only save after import is fully processed
    if (hasImport && textContent.length === 0) {
      console.log('[Composer Draft Save] Skipping save - import in progress');
      return;
    }

    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        text: textContent,
        channels: selectedChannels,
      })
    );
  }, [textContent, selectedChannels, hasImport]);

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
    
    // Get current user ID
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('You must be logged in to upload media');
    }

    for (const file of files) {
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `${user.id}/${fileName}`;

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
    // VALIDATION: Check if textContent is empty
    if (!textContent || textContent.trim().length === 0) {
      toast({
        title: "❌ Fehler",
        description: "Bitte geben Sie Text für Ihren Post ein.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('[Composer Publish] Starting publish with:', {
      textLength: textContent.length,
      hasMedia: selectedMedia.length > 0 || !!importedMediaUrl,
      channels: selectedChannels,
    });
    
    setIsPublishing(true);
    setPublishResults([]);

    try {
      // Upload media if present
      let uploadedMedia: MediaItem[] = [];
      if (importedMediaUrl) {
        // Reuse imported URL from AI Post Generator (already uploaded)
        uploadedMedia = [{
          type: 'image',
          path: importedMediaUrl,
          mime: 'image/jpeg',
          size: 0,
        }];
      } else if (selectedMedia.length > 0) {
        toast({
          title: "Uploading media...",
          description: "Please wait while we upload your files.",
        });
        uploadedMedia = await uploadMediaToStorage(selectedMedia);
      }

      // Transform for each channel if auto-fix enabled
      const transformedMediaPerChannel: Partial<Record<Provider, MediaItem[]>> = {};
      
      for (const channel of selectedChannels) {
        const config = channelConfigs[channel];
        
        if (config?.autoFix && config.profileId && uploadedMedia.length > 0) {
          try {
            const { data: transformData, error: transformError } = await supabase.functions.invoke('transform-media', {
              body: {
                files: uploadedMedia.map(m => ({ path: m.path, type: m.type })),
                profileId: config.profileId,
                provider: channel,
                watermarkOverride: config.watermarkOverride
              }
            });
            
            if (transformError) throw transformError;
            transformedMediaPerChannel[channel] = transformData.outputs || uploadedMedia;
          } catch (error) {
            console.error(`Transform failed for ${channel}:`, error);
            transformedMediaPerChannel[channel] = uploadedMedia;
          }
        } else {
          transformedMediaPerChannel[channel] = uploadedMedia;
        }
      }
      
      // Build channel_offsets
      const channel_offsets: Partial<Record<Provider, number>> = {};
      for (const channel of selectedChannels) {
        channel_offsets[channel] = channelConfigs[channel]?.timeOffset || 0;
      }

      // Prepare payload (use first channel's media or original)
      const payload: PublishPayload = {
        text: textContent,
        media: uploadedMedia.length > 0 ? transformedMediaPerChannel[selectedChannels[0]] || uploadedMedia : undefined,
        channels: selectedChannels,
        channel_offsets: Object.keys(channel_offsets).length > 0 ? channel_offsets as Record<Provider, number> : undefined,
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
        setImportedMediaUrl(null);
        setPostData(null);
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
          <Breadcrumbs category="publish" feature="Composer" />
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
              onChange={(e) => {
                const newText = e.target.value;
                console.log('[Textarea] onChange - new length:', newText.length);
                setTextContent(newText);
                
                // Auto-parse structured data for live preview
                const parsed = parseTextToStructured(newText);
                if (parsed) {
                  setPostData(parsed);
                }
              }}
              rows={6}
              className="resize-none"
            />
              <CharacterCounter text={textContent} channels={selectedChannels} />
            </div>

            {/* Media Upload */}
            <MediaUploader selectedMedia={selectedMedia} onMediaChange={setSelectedMedia} />

            {/* Additional Description Field (optional, preview-only) */}
            {postData && (
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  Zusätzliche Beschreibung (optional)
                  <span className="text-muted-foreground ml-2">Wird nur in der Vorschau angezeigt</span>
                </label>
                <Textarea
                  placeholder="Möchten Sie eine zusätzliche Beschreibung für die Vorschau hinzufügen?"
                  value={additionalDescription}
                  onChange={(e) => setAdditionalDescription(e.target.value)}
                  rows={3}
                  className="resize-none"
                />
              </div>
            )}

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
            <ChannelSelector 
              selectedChannels={selectedChannels} 
              onChannelsChange={setSelectedChannels}
              onConfigClick={(channel) => setShowConfigModal(channel)}
            />

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

        {/* Preview + Results Panel */}
        <div className="space-y-4">
          {/* Live Preview (wenn noch nicht published) */}
          {publishResults.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Live-Vorschau</CardTitle>
                <CardDescription>So wird Ihr Post aussehen</CardDescription>
              </CardHeader>
              <CardContent>
                <ComposerPreview
                  textContent={textContent}
                  selectedMedia={selectedMedia}
                  selectedChannels={selectedChannels}
                  profileName="Ihr Profil"
                  hook={postData?.hook}
                  caption={postData?.caption}
                  hashtags={postData?.hashtags}
                  additionalDescription={additionalDescription}
                />
              </CardContent>
            </Card>
          )}

          {/* Results (nach Publishing) */}
          {publishResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Publishing Status</CardTitle>
                <CardDescription>Results will appear here after publishing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isPublishing && (
                  <Alert>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <AlertDescription>Publishing to selected channels...</AlertDescription>
                  </Alert>
                )}

                {publishResults.length > 0 && (
                  <div className="space-y-3">
                    {publishResults.map((result, idx) => (
                      <PublishResultCard key={idx} result={result} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Channel Config Modal */}
      {showConfigModal && (
        <ChannelConfigModal
          open={true}
          onOpenChange={(open) => !open && setShowConfigModal(null)}
          channel={showConfigModal}
          currentConfig={channelConfigs[showConfigModal]}
          onSave={(config) => {
            setChannelConfigs(prev => ({ ...prev, [showConfigModal]: config }));
            setShowConfigModal(null);
            toast({
              title: "Channel settings saved",
              description: `Settings for ${showConfigModal} have been updated.`,
            });
          }}
        />
      )}
    </div>
  );
}
