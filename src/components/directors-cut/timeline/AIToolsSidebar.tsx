import { useState } from 'react';
import { motion } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Mic, Music, Volume2, Sparkles, Play, Loader2, 
  Download, Plus, Search, Clock
} from 'lucide-react';
import { AudioClip } from '@/types/timeline';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface AIToolsSidebarProps {
  onAddVoiceover: (clip: Omit<AudioClip, 'id' | 'trackId'>) => AudioClip;
  onAddMusic: (clip: Omit<AudioClip, 'id' | 'trackId'>) => AudioClip;
  onAddSoundEffect: (clip: Omit<AudioClip, 'id' | 'trackId'>) => AudioClip;
  currentTime: number;
  videoDuration: number;
}

// Voice options for ElevenLabs
const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', lang: 'de' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', lang: 'en' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', lang: 'de' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', lang: 'de' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', lang: 'en' },
];

// Sample music library (Jamendo would be integrated here)
const SAMPLE_MUSIC = [
  { id: '1', name: 'Upbeat Corporate', duration: 120, genre: 'Corporate', bpm: 120 },
  { id: '2', name: 'Chill Ambient', duration: 180, genre: 'Ambient', bpm: 80 },
  { id: '3', name: 'Epic Cinematic', duration: 90, genre: 'Cinematic', bpm: 100 },
  { id: '4', name: 'Happy Acoustic', duration: 150, genre: 'Acoustic', bpm: 110 },
];

// Sound effect categories
const SFX_CATEGORIES = [
  { id: 'transitions', name: 'Übergänge', emoji: '✨' },
  { id: 'impacts', name: 'Impacts', emoji: '💥' },
  { id: 'ui', name: 'UI Sounds', emoji: '🔔' },
  { id: 'nature', name: 'Natur', emoji: '🌿' },
  { id: 'tech', name: 'Tech', emoji: '🤖' },
];

export function AIToolsSidebar({
  onAddVoiceover,
  onAddMusic,
  onAddSoundEffect,
  currentTime,
  videoDuration,
}: AIToolsSidebarProps) {
  const { toast } = useToast();
  
  // Voiceover state
  const [voiceoverText, setVoiceoverText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].id);
  const [voiceSpeed, setVoiceSpeed] = useState(1);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  
  // Music state
  const [musicSearch, setMusicSearch] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string>('all');
  
  // SFX state
  const [selectedSfxCategory, setSelectedSfxCategory] = useState('transitions');
  const [isGeneratingSfx, setIsGeneratingSfx] = useState(false);
  const [sfxPrompt, setSfxPrompt] = useState('');

  // Generate voiceover
  const handleGenerateVoiceover = async () => {
    if (!voiceoverText.trim()) {
      toast({
        title: 'Fehler',
        description: 'Bitte gib einen Text ein',
        variant: 'destructive',
      });
      return;
    }
    
    setIsGeneratingVoice(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-voiceover', {
        body: {
          scriptText: voiceoverText,
          voice: selectedVoice,
          speed: voiceSpeed,
        },
      });
      
      if (error) throw error;
      
      // Add to timeline
      const clip = onAddVoiceover({
        name: `Voiceover: ${voiceoverText.substring(0, 20)}...`,
        url: data.audioUrl,
        startTime: currentTime,
        duration: data.duration || 5,
        trimStart: 0,
        trimEnd: 0,
        volume: 100,
        fadeIn: 0.2,
        fadeOut: 0.2,
        source: 'ai-generated',
      });
      
      toast({
        title: 'Voice-Over erstellt',
        description: 'Audio wurde zur Timeline hinzugefügt',
      });
      
      setVoiceoverText('');
    } catch (error) {
      console.error('Voiceover generation error:', error);
      toast({
        title: 'Fehler',
        description: 'Voice-Over konnte nicht erstellt werden',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  // Add music to timeline
  const handleAddMusic = (music: typeof SAMPLE_MUSIC[0]) => {
    // In production, this would fetch from Jamendo API
    const clip = onAddMusic({
      name: music.name,
      url: '', // Would be actual URL
      startTime: 0, // Music typically starts at beginning
      duration: Math.min(music.duration, videoDuration),
      trimStart: 0,
      trimEnd: 0,
      volume: 70, // Lower default volume for background music
      fadeIn: 2,
      fadeOut: 2,
      source: 'library',
    });
    
    toast({
      title: 'Musik hinzugefügt',
      description: `"${music.name}" wurde zur Timeline hinzugefügt`,
    });
  };

  // Generate sound effect
  const handleGenerateSfx = async () => {
    if (!sfxPrompt.trim()) {
      toast({
        title: 'Fehler',
        description: 'Bitte beschreibe den gewünschten Sound',
        variant: 'destructive',
      });
      return;
    }
    
    setIsGeneratingSfx(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('director-cut-sound-design', {
        body: {
          prompt: sfxPrompt,
          category: selectedSfxCategory,
          duration: 3,
        },
      });
      
      if (error) throw error;
      
      const clip = onAddSoundEffect({
        name: sfxPrompt.substring(0, 30),
        url: data.audioUrl,
        startTime: currentTime,
        duration: data.duration || 3,
        trimStart: 0,
        trimEnd: 0,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0.1,
        source: 'ai-generated',
      });
      
      toast({
        title: 'Sound Effect erstellt',
        description: 'Audio wurde zur Timeline hinzugefügt',
      });
      
      setSfxPrompt('');
    } catch (error) {
      console.error('SFX generation error:', error);
      toast({
        title: 'Fehler',
        description: 'Sound Effect konnte nicht erstellt werden',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingSfx(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          AI Audio Tools
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Voice-Over, Musik & Sound Effects
        </p>
      </div>
      
      <Tabs defaultValue="voiceover" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4 px-4 pt-2">
          <TabsTrigger value="voiceover" className="text-xs">
            <Mic className="h-3 w-3 mr-1" />
            Voice
          </TabsTrigger>
          <TabsTrigger value="music" className="text-xs">
            <Music className="h-3 w-3 mr-1" />
            Musik
          </TabsTrigger>
          <TabsTrigger value="sfx" className="text-xs">
            <Volume2 className="h-3 w-3 mr-1" />
            SFX
          </TabsTrigger>
          <TabsTrigger value="enhance" className="text-xs">
            <Sparkles className="h-3 w-3 mr-1" />
            KI
          </TabsTrigger>
        </TabsList>
        
        <ScrollArea className="flex-1">
          {/* Voice-Over Tab */}
          <TabsContent value="voiceover" className="p-4 space-y-4 mt-0">
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Stimme</Label>
                <Select value={selectedVoice} onValueChange={setSelectedVoice}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICE_OPTIONS.map(voice => (
                      <SelectItem key={voice.id} value={voice.id}>
                        {voice.name} ({voice.lang.toUpperCase()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Geschwindigkeit: {voiceSpeed.toFixed(1)}x</Label>
                <Slider
                  value={[voiceSpeed]}
                  onValueChange={([v]) => setVoiceSpeed(v)}
                  min={0.5}
                  max={2}
                  step={0.1}
                />
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs">Text</Label>
                <Textarea
                  value={voiceoverText}
                  onChange={(e) => setVoiceoverText(e.target.value)}
                  placeholder="Gib den Text für das Voice-Over ein..."
                  className="min-h-[100px] text-sm resize-none"
                />
                <div className="text-xs text-muted-foreground text-right">
                  {voiceoverText.length} Zeichen
                </div>
              </div>
              
              <Button 
                onClick={handleGenerateVoiceover}
                disabled={isGeneratingVoice || !voiceoverText.trim()}
                className="w-full"
                size="sm"
              >
                {isGeneratingVoice ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4 mr-2" />
                    Voice-Over erstellen
                  </>
                )}
              </Button>
            </div>
            
            {/* Recent voiceovers would be shown here */}
            <div className="pt-4 border-t">
              <Label className="text-xs text-muted-foreground">Position auf Timeline</Label>
              <div className="mt-1 text-sm font-mono">
                {Math.floor(currentTime / 60)}:{(currentTime % 60).toFixed(1).padStart(4, '0')}
              </div>
            </div>
          </TabsContent>
          
          {/* Music Tab */}
          <TabsContent value="music" className="p-4 space-y-4 mt-0">
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={musicSearch}
                  onChange={(e) => setMusicSearch(e.target.value)}
                  placeholder="Musik suchen..."
                  className="pl-9 h-9 text-sm"
                />
              </div>
              
              <div className="flex flex-wrap gap-1">
                {['all', 'Corporate', 'Ambient', 'Cinematic', 'Acoustic'].map(genre => (
                  <Badge
                    key={genre}
                    variant={selectedGenre === genre ? 'default' : 'outline'}
                    className="cursor-pointer text-xs"
                    onClick={() => setSelectedGenre(genre)}
                  >
                    {genre === 'all' ? 'Alle' : genre}
                  </Badge>
                ))}
              </div>
            </div>
            
            <div className="space-y-2">
              {SAMPLE_MUSIC
                .filter(m => selectedGenre === 'all' || m.genre === selectedGenre)
                .filter(m => !musicSearch || m.name.toLowerCase().includes(musicSearch.toLowerCase()))
                .map(music => (
                  <motion.div
                    key={music.id}
                    className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleAddMusic(music)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{music.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{music.genre}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.floor(music.duration / 60)}:{(music.duration % 60).toString().padStart(2, '0')}
                          </span>
                          <span>•</span>
                          <span>{music.bpm} BPM</span>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
            </div>
          </TabsContent>
          
          {/* Sound Effects Tab */}
          <TabsContent value="sfx" className="p-4 space-y-4 mt-0">
            <div className="flex flex-wrap gap-1">
              {SFX_CATEGORIES.map(cat => (
                <Badge
                  key={cat.id}
                  variant={selectedSfxCategory === cat.id ? 'default' : 'outline'}
                  className="cursor-pointer text-xs"
                  onClick={() => setSelectedSfxCategory(cat.id)}
                >
                  {cat.emoji} {cat.name}
                </Badge>
              ))}
            </div>
            
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">KI Sound Generator</Label>
                <Textarea
                  value={sfxPrompt}
                  onChange={(e) => setSfxPrompt(e.target.value)}
                  placeholder="Beschreibe den gewünschten Sound, z.B. 'Whoosh Übergang' oder 'Glockenspiel Notification'..."
                  className="min-h-[80px] text-sm resize-none"
                />
              </div>
              
              <Button
                onClick={handleGenerateSfx}
                disabled={isGeneratingSfx || !sfxPrompt.trim()}
                className="w-full"
                size="sm"
              >
                {isGeneratingSfx ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generiere...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Sound generieren
                  </>
                )}
              </Button>
            </div>
            
            {/* Quick SFX presets */}
            <div className="pt-4 border-t">
              <Label className="text-xs text-muted-foreground mb-2 block">Schnellauswahl</Label>
              <div className="grid grid-cols-2 gap-2">
                {['Whoosh', 'Click', 'Ding', 'Pop', 'Swoosh', 'Chime'].map(sfx => (
                  <Button
                    key={sfx}
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => setSfxPrompt(sfx)}
                  >
                    {sfx}
                  </Button>
                ))}
              </div>
            </div>
          </TabsContent>
          
          {/* AI Enhancement Tab */}
          <TabsContent value="enhance" className="p-4 space-y-4 mt-0">
            <Card className="border-dashed">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Noise Reduction</CardTitle>
                <CardDescription className="text-xs">
                  Entferne Hintergrundgeräusche
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <Button variant="outline" size="sm" className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Auf Original anwenden
                </Button>
              </CardContent>
            </Card>
            
            <Card className="border-dashed">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Voice Enhancement</CardTitle>
                <CardDescription className="text-xs">
                  Verbessere Sprachqualität
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <Button variant="outline" size="sm" className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Stimme optimieren
                </Button>
              </CardContent>
            </Card>
            
            <Card className="border-dashed">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Auto-Ducking</CardTitle>
                <CardDescription className="text-xs">
                  Musik automatisch leiser bei Sprache
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <Button variant="outline" size="sm" className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Auto-Ducking aktivieren
                </Button>
              </CardContent>
            </Card>
            
            <Card className="border-dashed">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Beat-Sync</CardTitle>
                <CardDescription className="text-xs">
                  Analysiere Beats für Schnitte
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <Button variant="outline" size="sm" className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Beats analysieren
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
