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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import { Loader2, Sparkles, Wand2, ChevronDown, ChevronUp, Instagram, Music, Linkedin, Facebook, Twitter, Youtube, Send } from 'lucide-react';
import { MediaUploader } from '@/components/composer/MediaUploader';
import { uploadMediaToSupabase } from '@/lib/mediaUpload';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface ScheduleQuickFormProps {
  workspaceId: string;
  onSuccess?: (eventId: string) => void;
}

const PLATFORMS = [
  { id: 'instagram', label: 'Instagram', icon: Instagram, color: 'from-purple-600 via-pink-500 to-orange-400', activeColor: 'bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.4)]' },
  { id: 'tiktok', label: 'TikTok', icon: Music, color: 'from-cyan-400 to-cyan-600', activeColor: 'bg-gradient-to-r from-zinc-800 to-zinc-900 text-white border-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.4)]' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: 'from-blue-500 to-blue-700', activeColor: 'bg-[#1877F2] text-white shadow-[0_0_15px_rgba(24,119,242,0.4)]' },
  { id: 'x', label: 'X', icon: Twitter, color: 'from-zinc-600 to-zinc-800', activeColor: 'bg-zinc-800 text-white shadow-[0_0_15px_rgba(161,161,170,0.3)]' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: 'from-blue-600 to-blue-800', activeColor: 'bg-[#0A66C2] text-white shadow-[0_0_15px_rgba(10,102,194,0.4)]' },
  { id: 'youtube_shorts', label: 'YT Shorts', icon: Youtube, color: 'from-red-500 to-red-700', activeColor: 'bg-[#FF0000] text-white shadow-[0_0_15px_rgba(255,0,0,0.4)]' },
];

export function ScheduleQuickForm({ workspaceId, onSuccess }: ScheduleQuickFormProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [when, setWhen] = useState(() => {
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
        setTitle(data.title || '');
        setCaption(data.caption || '');
        setChannels(data.platforms || ['instagram']);
        if (data.mediaUrl) {
          setMediaPreviewUrl(data.mediaUrl);
          setMediaPreviewType(data.mediaType || 'image');
        }
        setIsPrefilled(true);
        sessionStorage.removeItem('calendar_prefill');
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
      toast.error('Bitte wähle zuerst einen Workspace');
      return;
    }

    if (!user) {
      toast.error('Du musst eingeloggt sein');
      return;
    }

    if (channels.length === 0) {
      toast.error('Bitte wähle mindestens eine Plattform');
      return;
    }

    setBusy(true);
    try {
      let mediaUrls: any[] = [];
      if (selectedMedia.length > 0) {
        toast.info('Medien werden hochgeladen...');
        const uploaded = await uploadMediaToSupabase(selectedMedia, user.id);
        mediaUrls = uploaded.map(m => ({
          type: m.type,
          url: m.url,
          mime: m.mime,
          size: m.size,
        }));
      } else if (mediaPreviewUrl) {
        mediaUrls = [{
          type: mediaPreviewType || 'image',
          url: mediaPreviewUrl,
          mime: mediaPreviewType === 'video' ? 'video/mp4' : 'image/jpeg',
        }];
      }

      const event = await createEvent({
        workspaceId,
        title,
        caption,
        channels,
        datetimeLocalISO: when,
        timezone: 'Europe/Berlin',
        media: mediaUrls,
      });

      toast.success(`Post geplant für ${new Date(when).toLocaleString('de-DE')} auf ${channels.length} Plattform(en)`);
      
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
      toast.error(error.message || 'Post konnte nicht geplant werden');
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

  const captionMaxLength = 2200;

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
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card 
        id="quick-schedule-form" 
        className="relative overflow-hidden backdrop-blur-xl bg-card/60 border-white/10"
      >
        {/* Shimmer border effect */}
        <div className="absolute inset-0 rounded-xl p-[1px] overflow-hidden pointer-events-none">
          <div 
            className="absolute inset-0 rounded-xl"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, hsl(var(--primary) / 0.3) 25%, hsl(var(--primary) / 0.6) 50%, hsl(var(--primary) / 0.3) 75%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'shimmer-border 3s ease-in-out infinite',
              mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              maskComposite: 'exclude',
              WebkitMaskComposite: 'xor',
              padding: '1px',
            }}
          />
        </div>

        <style>{`
          @keyframes shimmer-border {
            0%, 100% { background-position: -200% 0; }
            50% { background-position: 200% 0; }
          }
        `}</style>

        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg bg-gradient-to-r from-primary via-amber-400 to-primary bg-clip-text text-transparent">
                Schnell-Planung
              </CardTitle>
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
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Titel (optional)</Label>
              <Input
                id="title"
                placeholder="Interner Titel für diesen Post"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={busy}
                className="bg-muted/20 border-white/10 focus:border-primary/50"
              />
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label htmlFor="caption">
                Caption / Post-Text
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
                className="resize-none bg-muted/20 border-white/10 focus:border-primary/50"
              />
              
              {/* AI Generator Toggle */}
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

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Media - NO duplicate label, MediaUploader has its own */}
            <div className="space-y-2">
              {/* Media preview from generator */}
              {mediaPreviewUrl && (
                <div className="mb-4 rounded-lg overflow-hidden border border-white/10">
                  {mediaPreviewType === 'video' ? (
                    <video 
                      src={mediaPreviewUrl} 
                      controls 
                      className="w-full max-h-64 object-contain bg-black"
                    />
                  ) : (
                    <img 
                      src={mediaPreviewUrl} 
                      alt="Vorschau" 
                      className="w-full max-h-64 object-contain"
                    />
                  )}
                  <div className="p-2 bg-muted/30 flex items-center justify-between">
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

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Date/Time */}
            <div className="space-y-2">
              <Label htmlFor="when">Veröffentlichungsdatum & Uhrzeit</Label>
              <Input
                id="when"
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
                disabled={busy}
                className="bg-muted/20 border-white/10 focus:border-primary/50"
              />
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Platform Chips */}
            <div className="space-y-3">
              <Label>Plattformen</Label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((platform) => {
                  const isActive = channels.includes(platform.id);
                  const Icon = platform.icon;
                  return (
                    <motion.button
                      key={platform.id}
                      type="button"
                      onClick={() => toggleChannel(platform.id)}
                      disabled={busy}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-all duration-300",
                        isActive
                          ? platform.activeColor + " border-transparent"
                          : "bg-muted/30 border-white/10 text-muted-foreground hover:border-white/20 hover:text-foreground"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {platform.label}
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Submit Button */}
            <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
              <Button 
                type="submit" 
                disabled={busy || channels.length === 0} 
                className="w-full gap-2 h-11 text-sm font-semibold bg-gradient-to-r from-primary via-amber-500 to-primary bg-[length:200%_100%] hover:bg-[position:100%_0] transition-all duration-500 shadow-[0_0_20px_hsla(var(--primary)/0.3)] hover:shadow-[0_0_30px_hsla(var(--primary)/0.5)]"
              >
                {busy ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {selectedMedia.length > 0 ? 'Hochladen & Planen...' : 'Wird geplant...'}
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Post planen
                  </>
                )}
              </Button>
            </motion.div>
          </form>
        </CardContent>
      </Card>
    </motion.div>
  );
}
