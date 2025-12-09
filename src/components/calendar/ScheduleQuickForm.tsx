/**
 * Quick Schedule Form Component
 * Full-featured form for creating and scheduling posts with media
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createEvent } from '@/data/calendar';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Loader2, Sparkles, Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { MediaUploader } from '@/components/composer/MediaUploader';
import { uploadMediaToSupabase } from '@/lib/mediaUpload';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ScheduleQuickFormProps {
  workspaceId: string;
  onSuccess?: (eventId: string) => void;
}

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'x', label: 'X (Twitter)' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube_shorts', label: 'YouTube Shorts' },
];

export function ScheduleQuickForm({ workspaceId, onSuccess }: ScheduleQuickFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [when, setWhen] = useState(() => {
    // Default to 1 hour from now
    const date = new Date(Date.now() + 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  });
  const [channels, setChannels] = useState<string[]>(['instagram']);
  const [selectedMedia, setSelectedMedia] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [isPrefilled, setIsPrefilled] = useState(false);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string>('');
  const [mediaPreviewType, setMediaPreviewType] = useState<'image' | 'video' | null>(null);
  
  // AI Generator states
  const [isGenerating, setIsGenerating] = useState(false);
  const [showGeneratorPanel, setShowGeneratorPanel] = useState(false);
  const [selectedTone, setSelectedTone] = useState<string>('casual');
  const [selectedLanguage, setSelectedLanguage] = useState<string>('de');
  const [hashtagCount, setHashtagCount] = useState<number>(5);

  // Check for prefill data from AI Post Generator
  useEffect(() => {
    const prefillData = sessionStorage.getItem('calendar_prefill');
    if (prefillData) {
      try {
        const data = JSON.parse(prefillData);
        
        // Set form fields
        setTitle(data.title || '');
        setCaption(data.caption || '');
        setChannels(data.platforms || ['instagram']);
        
        // Set media preview if available
        if (data.mediaUrl) {
          setMediaPreviewUrl(data.mediaUrl);
          setMediaPreviewType(data.mediaType || 'image');
        }
        
        setIsPrefilled(true);
        
        // Clear sessionStorage
        sessionStorage.removeItem('calendar_prefill');
        
        // Scroll to form
        setTimeout(() => {
          document.getElementById('quick-schedule-form')?.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
          });
        }, 100);
        
        toast.info('✅ Post-Daten aus Generator übernommen');
      } catch (e) {
        console.error('Error loading prefill data:', e);
      }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!workspaceId) {
      toast.error('Please select a workspace first');
      return;
    }

    if (!user) {
      toast.error('You must be logged in');
      return;
    }

    if (channels.length === 0) {
      toast.error('Please select at least one platform');
      return;
    }

    setBusy(true);
    try {
      // Upload media to Supabase if any
      let mediaUrls: any[] = [];
      if (selectedMedia.length > 0) {
        toast.info('Uploading media...');
        const uploaded = await uploadMediaToSupabase(selectedMedia, user.id);
        mediaUrls = uploaded.map(m => ({
          type: m.type,
          url: m.url,
          mime: m.mime,
          size: m.size,
        }));
      } else if (mediaPreviewUrl) {
        // Use media from generator if no new media uploaded
        mediaUrls = [{
          type: mediaPreviewType || 'image',
          url: mediaPreviewUrl,
          mime: mediaPreviewType === 'video' ? 'video/mp4' : 'image/jpeg',
        }];
      }

      // Create event with media
      const event = await createEvent({
        workspaceId,
        title,
        caption,
        channels,
        datetimeLocalISO: when,
        timezone: 'Europe/Berlin',
        media: mediaUrls,
      });

      toast.success(`Post scheduled for ${new Date(when).toLocaleString('de-DE')} on ${channels.length} platform(s)`);
      
      // Reset form
      setTitle('');
      setCaption('');
      setSelectedMedia([]);
      setMediaPreviewUrl('');
      setMediaPreviewType(null);
      setIsPrefilled(false);
      setWhen(new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
      
      onSuccess?.(event.id);
    } catch (error: any) {
      console.error('Schedule error:', error);
      toast.error(error.message || 'Failed to schedule post');
    } finally {
      setBusy(false);
    }
  };

  const toggleChannel = (channelId: string) => {
    setChannels((prev) =>
      prev.includes(channelId)
        ? prev.filter((c) => c !== channelId)
        : [...prev, channelId]
    );
  };

  const captionMaxLength = 2200; // Instagram max

  const handleGenerateCaption = async () => {
    if (caption.trim().length < 3) {
      toast.error('Bitte gib zuerst ein Thema/Brief ein (min. 3 Zeichen)');
      return;
    }
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-caption', {
        body: {
          topic: caption.trim(),
          platform: channels[0] || 'instagram',
          tone: selectedTone,
          language: selectedLanguage,
          hashtagCount: hashtagCount,
          maxLength: captionMaxLength
        }
      });
      
      if (error) throw error;
      
      // Insert result (Caption + Hashtags)
      const hashtags = data.hashtags || [];
      const fullCaption = `${data.caption}\n\n${hashtags.join(' ')}`;
      setCaption(fullCaption);
      setShowGeneratorPanel(false);
      
      toast.success('✨ Caption erfolgreich generiert!');
    } catch (error: any) {
      console.error('Generate error:', error);
      toast.error(error.message || 'Generierung fehlgeschlagen');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Card id="quick-schedule-form">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Quick Schedule Post</CardTitle>
            <CardDescription>Erstelle und plane einen Post in Sekunden</CardDescription>
          </div>
          {isPrefilled && (
            <Badge variant="secondary" className="text-xs">
              🎨 Aus Generator importiert
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              placeholder="Internal title for this post"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">
              Caption / Post Text
              <span className="ml-2 text-xs text-muted-foreground">
                {caption.length} / {captionMaxLength}
              </span>
            </Label>
            <Textarea
              id="caption"
              placeholder="Schreibe ein Thema oder deine Caption hier... (z.B. 'Werbung für Calvin Klein')"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              disabled={busy || isGenerating}
              maxLength={captionMaxLength}
              rows={4}
              className="resize-none"
            />
            
            {/* AI Generator Toggle Button */}
            <div className="flex items-center justify-end mt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowGeneratorPanel(!showGeneratorPanel)}
                className="gap-2 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
              >
                <Sparkles className="w-4 h-4 text-primary" />
                Mit KI generieren
                {showGeneratorPanel ? (
                  <ChevronUp className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </Button>
            </div>
            
            {/* Collapsible Generator Panel */}
            <AnimatePresence>
              {showGeneratorPanel && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-4 rounded-xl bg-muted/30 border border-white/10 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Tone */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Ton</Label>
                        <Select value={selectedTone} onValueChange={setSelectedTone}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Ton" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="professional">Professionell</SelectItem>
                            <SelectItem value="casual">Locker</SelectItem>
                            <SelectItem value="friendly">Freundlich</SelectItem>
                            <SelectItem value="humorous">Humorvoll</SelectItem>
                            <SelectItem value="inspirational">Inspirierend</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      {/* Language */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Sprache</Label>
                        <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="Sprache" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="de">Deutsch</SelectItem>
                            <SelectItem value="en">Englisch</SelectItem>
                            <SelectItem value="es">Spanisch</SelectItem>
                            <SelectItem value="fr">Französisch</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {/* Hashtag Count Slider */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-muted-foreground">Hashtags</Label>
                        <span className="text-sm font-medium text-primary">{hashtagCount}</span>
                      </div>
                      <Slider 
                        value={[hashtagCount]} 
                        onValueChange={([v]) => setHashtagCount(v)}
                        min={3} 
                        max={10} 
                        step={1}
                        className="w-full"
                      />
                    </div>
                    
                    {/* Generate Button */}
                    <Button
                      type="button"
                      onClick={handleGenerateCaption}
                      disabled={isGenerating || caption.trim().length < 3}
                      className="w-full gap-2 bg-gradient-to-r from-primary to-primary/80 
                                 hover:shadow-[0_0_20px_hsla(var(--primary)/0.3)] transition-all"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Generiere...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Caption generieren
                        </>
                      )}
                    </Button>
                    
                    <p className="text-xs text-muted-foreground text-center">
                      💡 Gib oben ein Thema ein, z.B. "Werbung für Calvin Klein"
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="space-y-2">
            <Label>Media (optional)</Label>
            
            {/* Media preview from generator */}
            {mediaPreviewUrl && (
              <div className="mb-4 rounded-lg overflow-hidden border">
                {mediaPreviewType === 'video' ? (
                  <video 
                    src={mediaPreviewUrl} 
                    controls 
                    className="w-full max-h-64 object-contain bg-black"
                  />
                ) : (
                  <img 
                    src={mediaPreviewUrl} 
                    alt="Preview" 
                    className="w-full max-h-64 object-contain"
                  />
                )}
                <div className="p-2 bg-muted flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    🎨 Aus Generator übertragen
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setMediaPreviewUrl('');
                      setMediaPreviewType(null);
                    }}
                  >
                    Entfernen
                  </Button>
                </div>
              </div>
            )}
            
            <MediaUploader
              selectedMedia={selectedMedia}
              onMediaChange={(files) => {
                setSelectedMedia(files);
                // Clear preview when user uploads new media
                if (files.length > 0) {
                  setMediaPreviewUrl('');
                  setMediaPreviewType(null);
                }
              }}
            />
            
            {mediaPreviewUrl && (
              <p className="text-xs text-muted-foreground">
                💡 Du kannst entweder das übertragene Media verwenden oder ein neues hochladen
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="when">Publish Date & Time</Label>
            <Input
              id="when"
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="space-y-2">
            <Label>Platforms</Label>
            <div className="grid grid-cols-2 gap-2">
              {PLATFORMS.map((platform) => (
                <div key={platform.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`platform-${platform.id}`}
                    checked={channels.includes(platform.id)}
                    onCheckedChange={() => toggleChannel(platform.id)}
                    disabled={busy}
                  />
                  <Label
                    htmlFor={`platform-${platform.id}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {platform.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={busy || channels.length === 0} 
            className="w-full"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {selectedMedia.length > 0 ? 'Uploading & Scheduling...' : 'Scheduling...'}
              </>
            ) : (
              'Schedule Post'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
