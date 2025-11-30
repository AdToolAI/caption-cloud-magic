import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, Music, Volume2, Sparkles, Film, Palette, 
  ChevronLeft, ChevronRight, Play, Download, Upload,
  Wand2, Waves, Scissors, Zap, SlidersHorizontal, Search, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';
import { AudioTrack, AudioClip } from '@/types/timeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIToolsSidebarExpandedProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  audioTracks: AudioTrack[];
  currentTime: number;
  onAddAudioClip: (trackId: string, clip: AudioClip) => void;
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  onExport?: () => void;
  onStartAnalysis?: () => void;
  isAnalyzing?: boolean;
}

// Voice options from ElevenLabs
const VOICE_OPTIONS = [
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female' },
  { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger', gender: 'male' },
  { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria', gender: 'female' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', gender: 'male' },
];

const QUICK_FILTERS = [
  { id: 'cinematic', name: 'Cinematic', color: '#f59e0b' },
  { id: 'vintage', name: 'Vintage', color: '#8b5cf6' },
  { id: 'noir', name: 'Noir', color: '#64748b' },
  { id: 'vibrant', name: 'Vibrant', color: '#ec4899' },
  { id: 'cold', name: 'Cold', color: '#06b6d4' },
  { id: 'warm', name: 'Warm', color: '#f97316' },
];

export function AIToolsSidebarExpanded({
  videoUrl,
  videoDuration,
  scenes,
  audioTracks,
  currentTime,
  onAddAudioClip,
  onScenesUpdate,
  onExport,
  onStartAnalysis,
  isAnalyzing = false,
}: AIToolsSidebarExpandedProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('scenes');
  
  // Voice state
  const [voiceText, setVoiceText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].id);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  
  // Music state
  const [musicSearch, setMusicSearch] = useState('');
  const [musicResults, setMusicResults] = useState<any[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  
  // Audio enhancement state
  const [noiseReduction, setNoiseReduction] = useState(50);
  const [voiceEnhancement, setVoiceEnhancement] = useState(true);
  const [autoDucking, setAutoDucking] = useState(70);

  // Generate Voice-Over with ElevenLabs
  const handleGenerateVoice = async () => {
    if (!voiceText.trim()) {
      toast.error('Bitte gib einen Text für den Voiceover ein');
      return;
    }
    
    setIsGeneratingVoice(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('translate-and-voiceover', {
        body: {
          text: voiceText,
          source_language: 'de',
          target_language: 'de',
          voice_id: selectedVoice,
        },
      });
      
      if (error) throw error;
      
      if (data?.voiceover_url) {
        const newClip: AudioClip = {
          id: `voice-${Date.now()}`,
          trackId: 'track-voiceover',
          name: `Voiceover ${new Date().toLocaleTimeString()}`,
          url: data.voiceover_url,
          startTime: currentTime,
          duration: Math.max(3, voiceText.length * 0.06), // Estimate duration
          trimStart: 0,
          trimEnd: Math.max(3, voiceText.length * 0.06),
          volume: 100,
          fadeIn: 0.1,
          fadeOut: 0.1,
          source: 'ai-generated',
          color: '#f59e0b',
        };
        onAddAudioClip('track-voiceover', newClip);
        setVoiceText('');
        toast.success('Voiceover generiert und zur Timeline hinzugefügt');
      }
    } catch (error) {
      console.error('Error generating voice:', error);
      toast.error('Fehler beim Generieren des Voiceovers');
    } finally {
      setIsGeneratingVoice(false);
    }
  };

  // Search Music from Jamendo
  const handleSearchMusic = async () => {
    if (!musicSearch.trim()) return;
    
    setIsSearchingMusic(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: musicSearch,
          limit: 10,
        },
      });
      
      if (error) throw error;
      
      setMusicResults(data?.tracks || []);
      
      if (!data?.tracks?.length) {
        toast.info('Keine Musik gefunden. Versuche andere Suchbegriffe.');
      }
    } catch (error) {
      console.error('Error searching music:', error);
      toast.error('Fehler bei der Musiksuche');
    } finally {
      setIsSearchingMusic(false);
    }
  };

  // Add music to timeline
  const handleAddMusic = (track: any) => {
    const newClip: AudioClip = {
      id: `music-${Date.now()}`,
      trackId: 'track-music',
      name: track.name || track.title || 'Musik',
      url: track.audio || track.url || '',
      startTime: currentTime,
      duration: track.duration || 120,
      trimStart: 0,
      trimEnd: track.duration || 120,
      volume: 70,
      fadeIn: 2,
      fadeOut: 3,
      source: 'library',
      color: '#10b981',
    };
    onAddAudioClip('track-music', newClip);
    toast.success(`"${track.name || 'Musik'}" zur Timeline hinzugefügt`);
  };

  // AI Audio Enhancement
  const handleAudioEnhancement = async () => {
    try {
      toast.info('Audio wird analysiert...');
      
      const { data, error } = await supabase.functions.invoke('director-cut-audio-mixing', {
        body: {
          video_url: videoUrl,
          duration: videoDuration,
          settings: {
            noise_reduction: noiseReduction,
            voice_enhancement: voiceEnhancement,
            auto_ducking: autoDucking,
          },
        },
      });
      
      if (error) throw error;
      
      toast.success('Audio-Optimierung angewendet');
    } catch (error) {
      console.error('Error enhancing audio:', error);
      toast.error('Fehler bei der Audio-Optimierung');
    }
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-l bg-card/50 flex flex-col items-center py-2 gap-2">
        <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(false)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border" />
        {[
          { icon: Film, tab: 'scenes' },
          { icon: Mic, tab: 'voice' },
          { icon: Music, tab: 'music' },
          { icon: Sparkles, tab: 'ai' },
          { icon: Palette, tab: 'effects' },
        ].map(({ icon: Icon, tab }) => (
          <Button
            key={tab}
            variant={activeTab === tab ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => {
              setActiveTab(tab);
              setIsCollapsed(false);
            }}
          >
            <Icon className="h-4 w-4" />
          </Button>
        ))}
      </div>
    );
  }

  return (
    <div className="w-80 border-l bg-card/50 flex flex-col">
      {/* Header */}
      <div className="h-12 border-b flex items-center justify-between px-3">
        <span className="text-sm font-semibold">AI Tools</span>
        <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(true)}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="grid grid-cols-5 m-2 h-9">
          <TabsTrigger value="scenes" className="p-1">
            <Film className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="voice" className="p-1">
            <Mic className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="music" className="p-1">
            <Music className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="ai" className="p-1">
            <Sparkles className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="effects" className="p-1">
            <Palette className="h-3.5 w-3.5" />
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-3">
          {/* Scenes Tab - NEW as first tab */}
          <TabsContent value="scenes" className="m-0 space-y-4">
            <Button 
              className="w-full gap-2" 
              onClick={onStartAnalysis}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analysiere...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  KI-Szenenanalyse starten
                </>
              )}
            </Button>

            <div className="space-y-2">
              <Label className="text-xs">Erkannte Szenen ({scenes.length})</Label>
              {scenes.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed bg-muted/30 text-center">
                  <Film className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Starte die KI-Analyse um Szenen zu erkennen
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
                  {scenes.map((scene, index) => (
                    <motion.div 
                      key={scene.id} 
                      className="p-2 rounded border bg-card/50 text-sm hover:bg-card cursor-pointer"
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded font-medium">
                          {index + 1}
                        </span>
                        <span className="truncate text-xs flex-1">
                          {scene.description?.slice(0, 25) || 'Szene'}...
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {scenes.length > 0 && (
              <div className="pt-2 border-t space-y-2">
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Scissors className="h-4 w-4" />
                  Auto-Cut generieren
                </Button>
                <Button variant="outline" size="sm" className="w-full gap-2">
                  <Wand2 className="h-4 w-4" />
                  Übergänge generieren
                </Button>
              </div>
            )}
          </TabsContent>

          {/* Voice Tab */}
          <TabsContent value="voice" className="m-0 space-y-4">
            <div>
              <Label className="text-xs">Voiceover Text</Label>
              <Textarea
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="Text für Voiceover eingeben..."
                className="mt-1 min-h-[100px] text-sm"
              />
            </div>

            <div>
              <Label className="text-xs">Stimme auswählen</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {VOICE_OPTIONS.map(voice => (
                  <Button
                    key={voice.id}
                    variant={selectedVoice === voice.id ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedVoice(voice.id)}
                  >
                    {voice.name}
                  </Button>
                ))}
              </div>
            </div>

            <Button 
              className="w-full gap-2" 
              onClick={handleGenerateVoice}
              disabled={!voiceText.trim() || isGeneratingVoice}
            >
              {isGeneratingVoice ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generiere...
                </>
              ) : (
                <>
                  <Wand2 className="h-4 w-4" />
                  Voiceover generieren
                </>
              )}
            </Button>

            <div className="pt-2 border-t">
              <Button variant="outline" size="sm" className="w-full gap-2">
                <Upload className="h-4 w-4" />
                Audio hochladen
              </Button>
            </div>
          </TabsContent>

          {/* Music Tab */}
          <TabsContent value="music" className="m-0 space-y-3">
            <div className="flex gap-2">
              <Input 
                placeholder="Musik suchen..." 
                className="text-sm"
                value={musicSearch}
                onChange={(e) => setMusicSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchMusic()}
              />
              <Button size="sm" onClick={handleSearchMusic} disabled={isSearchingMusic}>
                {isSearchingMusic ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {musicResults.length > 0 ? (
                musicResults.map((track: any) => (
                  <motion.div
                    key={track.id}
                    className="p-2 rounded-lg border bg-card/50 hover:bg-card cursor-pointer group"
                    whileHover={{ scale: 1.02 }}
                    onClick={() => handleAddMusic(track)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{track.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {track.artist_name || 'Unknown'} • {Math.floor((track.duration || 0) / 60)}:{((track.duration || 0) % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                        <Play className="h-4 w-4" />
                      </Button>
                    </div>
                  </motion.div>
                ))
              ) : (
                <div className="p-4 rounded-lg border border-dashed bg-muted/30 text-center">
                  <Music className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Suche nach lizenzfreier Musik
                  </p>
                </div>
              )}
            </div>

            <Button variant="outline" size="sm" className="w-full gap-2">
              <Upload className="h-4 w-4" />
              Musik hochladen
            </Button>
          </TabsContent>

          {/* AI Tab */}
          <TabsContent value="ai" className="m-0 space-y-4">
            <div className="space-y-3">
              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-purple-500/10 to-pink-500/10"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Waves className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Noise Reduction</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Entferne Hintergrundgeräusche automatisch
                </p>
                <Slider 
                  value={[noiseReduction]} 
                  onValueChange={([v]) => setNoiseReduction(v)}
                  max={100} 
                />
              </motion.div>

              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-blue-500/10 to-cyan-500/10"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Mic className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-medium">Voice Enhancement</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Verbessere Stimmen für klarere Sprache
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs">Aktiviert</span>
                  <Switch 
                    checked={voiceEnhancement} 
                    onCheckedChange={setVoiceEnhancement}
                  />
                </div>
              </motion.div>

              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-amber-500/10 to-orange-500/10"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <SlidersHorizontal className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Auto-Ducking</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">
                  Musik automatisch leiser bei Sprache
                </p>
                <Slider 
                  value={[autoDucking]} 
                  onValueChange={([v]) => setAutoDucking(v)}
                  max={100} 
                />
              </motion.div>

              <Button className="w-full gap-2" onClick={handleAudioEnhancement}>
                <Zap className="h-4 w-4" />
                Audio optimieren
              </Button>
            </div>
          </TabsContent>

          {/* Effects Tab */}
          <TabsContent value="effects" className="m-0 space-y-4">
            <Label className="text-xs">Quick Filters</Label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_FILTERS.map(filter => (
                <motion.div
                  key={filter.id}
                  className="aspect-square rounded-lg border cursor-pointer flex items-center justify-center"
                  style={{ backgroundColor: `${filter.color}20` }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <span className="text-xs font-medium">{filter.name}</span>
                </motion.div>
              ))}
            </div>

            <div className="space-y-3 pt-2 border-t">
              <Label className="text-xs">Color Grading</Label>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Helligkeit</span>
                  <span>0</span>
                </div>
                <Slider defaultValue={[50]} max={100} />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Kontrast</span>
                  <span>0</span>
                </div>
                <Slider defaultValue={[50]} max={100} />
              </div>
              
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Sättigung</span>
                  <span>0</span>
                </div>
                <Slider defaultValue={[50]} max={100} />
              </div>
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Export Button */}
      <div className="p-3 border-t">
        <Button className="w-full gap-2" onClick={onExport}>
          <Download className="h-4 w-4" />
          Video exportieren
        </Button>
      </div>
    </div>
  );
}
