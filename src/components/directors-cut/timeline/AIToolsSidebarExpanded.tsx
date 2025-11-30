import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, Music, Volume2, Sparkles, Film, Palette, 
  ChevronLeft, ChevronRight, Play, Download, Upload,
  Wand2, Waves, Scissors, Zap, SlidersHorizontal
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

interface AIToolsSidebarExpandedProps {
  videoUrl: string;
  scenes: SceneAnalysis[];
  audioTracks: AudioTrack[];
  currentTime: number;
  onAddAudioClip: (trackId: string, clip: AudioClip) => void;
  onScenesUpdate: (scenes: SceneAnalysis[]) => void;
  onExport?: () => void;
}

const SAMPLE_MUSIC = [
  { id: 'm1', name: 'Epic Cinematic', duration: 120, genre: 'Cinematic' },
  { id: 'm2', name: 'Upbeat Pop', duration: 90, genre: 'Pop' },
  { id: 'm3', name: 'Ambient Chill', duration: 180, genre: 'Ambient' },
  { id: 'm4', name: 'Corporate Motivation', duration: 150, genre: 'Corporate' },
  { id: 'm5', name: 'Electronic Energy', duration: 100, genre: 'Electronic' },
];

const SAMPLE_SFX = [
  { id: 's1', name: 'Whoosh', duration: 1, category: 'Transition' },
  { id: 's2', name: 'Pop', duration: 0.5, category: 'UI' },
  { id: 's3', name: 'Impact', duration: 1.5, category: 'Hit' },
  { id: 's4', name: 'Notification', duration: 2, category: 'Alert' },
  { id: 's5', name: 'Swoosh', duration: 0.8, category: 'Transition' },
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
  scenes,
  audioTracks,
  currentTime,
  onAddAudioClip,
  onScenesUpdate,
  onExport,
}: AIToolsSidebarExpandedProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('voice');
  const [voiceText, setVoiceText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('sarah');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateVoice = async () => {
    if (!voiceText.trim()) return;
    setIsGenerating(true);
    
    // Simulate generation
    setTimeout(() => {
      const newClip: AudioClip = {
        id: `voice-${Date.now()}`,
        trackId: 'track-voiceover',
        name: `Voiceover ${new Date().toLocaleTimeString()}`,
        url: '',
        startTime: currentTime,
        duration: voiceText.length * 0.05,
        trimStart: 0,
        trimEnd: voiceText.length * 0.05,
        volume: 100,
        fadeIn: 0.1,
        fadeOut: 0.1,
        source: 'ai-generated',
        color: '#f59e0b',
      };
      onAddAudioClip('track-voiceover', newClip);
      setIsGenerating(false);
      setVoiceText('');
    }, 2000);
  };

  const handleAddMusic = (music: typeof SAMPLE_MUSIC[0]) => {
    const newClip: AudioClip = {
      id: `music-${Date.now()}`,
      trackId: 'track-music',
      name: music.name,
      url: '',
      startTime: currentTime,
      duration: music.duration,
      trimStart: 0,
      trimEnd: music.duration,
      volume: 70,
      fadeIn: 2,
      fadeOut: 3,
      source: 'library',
      color: '#10b981',
    };
    onAddAudioClip('track-music', newClip);
  };

  const handleAddSFX = (sfx: typeof SAMPLE_SFX[0]) => {
    const newClip: AudioClip = {
      id: `sfx-${Date.now()}`,
      trackId: 'track-sfx',
      name: sfx.name,
      url: '',
      startTime: currentTime,
      duration: sfx.duration,
      trimStart: 0,
      trimEnd: sfx.duration,
      volume: 100,
      fadeIn: 0,
      fadeOut: 0,
      source: 'library',
      color: '#ec4899',
    };
    onAddAudioClip('track-sfx', newClip);
  };

  if (isCollapsed) {
    return (
      <div className="w-12 border-l bg-card/50 flex flex-col items-center py-2 gap-2">
        <Button variant="ghost" size="sm" onClick={() => setIsCollapsed(false)}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="w-px h-4 bg-border" />
        {[
          { icon: Mic, tab: 'voice' },
          { icon: Music, tab: 'music' },
          { icon: Volume2, tab: 'sfx' },
          { icon: Sparkles, tab: 'ai' },
          { icon: Film, tab: 'scenes' },
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
        <TabsList className="grid grid-cols-6 m-2 h-9">
          <TabsTrigger value="voice" className="p-1">
            <Mic className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="music" className="p-1">
            <Music className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="sfx" className="p-1">
            <Volume2 className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="ai" className="p-1">
            <Sparkles className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="scenes" className="p-1">
            <Film className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger value="effects" className="p-1">
            <Palette className="h-3.5 w-3.5" />
          </TabsTrigger>
        </TabsList>

        <div className="flex-1 overflow-y-auto p-3">
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
              <Label className="text-xs">Stimme</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {['sarah', 'roger', 'aria', 'george'].map(voice => (
                  <Button
                    key={voice}
                    variant={selectedVoice === voice ? 'default' : 'outline'}
                    size="sm"
                    className="capitalize"
                    onClick={() => setSelectedVoice(voice)}
                  >
                    {voice}
                  </Button>
                ))}
              </div>
            </div>

            <Button 
              className="w-full gap-2" 
              onClick={handleGenerateVoice}
              disabled={!voiceText.trim() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1 }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </motion.div>
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
            <Input placeholder="Musik suchen..." className="text-sm" />
            
            <div className="space-y-2">
              {SAMPLE_MUSIC.map(music => (
                <motion.div
                  key={music.id}
                  className="p-2 rounded-lg border bg-card/50 hover:bg-card cursor-pointer group"
                  whileHover={{ scale: 1.02 }}
                  onClick={() => handleAddMusic(music)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{music.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {music.genre} • {Math.floor(music.duration / 60)}:{(music.duration % 60).toString().padStart(2, '0')}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="opacity-0 group-hover:opacity-100">
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>

            <Button variant="outline" size="sm" className="w-full gap-2">
              <Upload className="h-4 w-4" />
              Musik hochladen
            </Button>
          </TabsContent>

          {/* SFX Tab */}
          <TabsContent value="sfx" className="m-0 space-y-3">
            <Input placeholder="Sound Effect suchen..." className="text-sm" />
            
            <div className="grid grid-cols-2 gap-2">
              {SAMPLE_SFX.map(sfx => (
                <motion.div
                  key={sfx.id}
                  className="p-2 rounded-lg border bg-card/50 hover:bg-card cursor-pointer text-center"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleAddSFX(sfx)}
                >
                  <div className="text-sm font-medium">{sfx.name}</div>
                  <div className="text-xs text-muted-foreground">{sfx.category}</div>
                </motion.div>
              ))}
            </div>

            <div className="pt-2 border-t">
              <Label className="text-xs">KI Sound Generator</Label>
              <div className="flex gap-2 mt-1">
                <Input placeholder="Beschreibe den Sound..." className="text-sm" />
                <Button size="sm">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* AI Tab */}
          <TabsContent value="ai" className="m-0 space-y-4">
            <div className="space-y-3">
              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-purple-500/10 to-pink-500/10 cursor-pointer"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Waves className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Noise Reduction</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Entferne Hintergrundgeräusche automatisch
                </p>
                <Slider defaultValue={[50]} max={100} className="mt-2" />
              </motion.div>

              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-blue-500/10 to-cyan-500/10 cursor-pointer"
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
                  <Switch defaultChecked />
                </div>
              </motion.div>

              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-amber-500/10 to-orange-500/10 cursor-pointer"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <SlidersHorizontal className="h-4 w-4 text-amber-500" />
                  <span className="text-sm font-medium">Auto-Ducking</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Musik automatisch leiser bei Sprache
                </p>
                <Slider defaultValue={[70]} max={100} className="mt-2" />
              </motion.div>

              <motion.div
                className="p-3 rounded-lg border bg-gradient-to-r from-green-500/10 to-emerald-500/10 cursor-pointer"
                whileHover={{ scale: 1.02 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Zap className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium">Beat-Sync</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Synchronisiere Schnitte mit dem Beat
                </p>
                <Button variant="outline" size="sm" className="w-full mt-2">
                  Beats analysieren
                </Button>
              </motion.div>
            </div>
          </TabsContent>

          {/* Scenes Tab */}
          <TabsContent value="scenes" className="m-0 space-y-4">
            <Button className="w-full gap-2">
              <Sparkles className="h-4 w-4" />
              KI-Szenenanalyse starten
            </Button>

            <div className="space-y-2">
              <Label className="text-xs">Szenen ({scenes.length})</Label>
              {scenes.slice(0, 5).map((scene, index) => (
                <div key={scene.id} className="p-2 rounded border bg-card/50 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                      {index + 1}
                    </span>
                    <span className="truncate text-xs">{scene.description?.slice(0, 30)}...</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {scene.start_time.toFixed(1)}s - {scene.end_time.toFixed(1)}s
                  </div>
                </div>
              ))}
              {scenes.length > 5 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{scenes.length - 5} weitere Szenen
                </p>
              )}
            </div>

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
