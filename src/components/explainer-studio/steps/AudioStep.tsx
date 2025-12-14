import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, Music, Play, Pause, Volume2, VolumeX, Loader2, 
  ChevronLeft, ChevronRight, RefreshCw, Check, Sparkles,
  Wand2, AudioWaveform
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { VoiceSelector } from '../VoiceSelector';
import { SoundDesignLibrary, type SceneSoundConfig } from '../SoundDesignLibrary';
import { EnhancedVoiceSettings, type SceneVoiceConfig, type ExtendedLanguage } from '../EnhancedVoiceSettings';
import type { ExplainerBriefing, ExplainerScript, ExplainerLanguage } from '@/types/explainer-studio';

// Background music options
const MUSIC_LIBRARY = [
  { id: 'uplifting-corporate', name: 'Uplifting Corporate', mood: 'Motivierend', duration: 120, previewUrl: '/music/uplifting.mp3' },
  { id: 'tech-innovation', name: 'Tech Innovation', mood: 'Modern', duration: 90, previewUrl: '/music/tech.mp3' },
  { id: 'soft-ambient', name: 'Soft Ambient', mood: 'Ruhig', duration: 180, previewUrl: '/music/ambient.mp3' },
  { id: 'energetic-startup', name: 'Energetic Startup', mood: 'Dynamisch', duration: 60, previewUrl: '/music/energetic.mp3' },
  { id: 'emotional-piano', name: 'Emotional Piano', mood: 'Emotional', duration: 150, previewUrl: '/music/piano.mp3' },
  { id: 'minimal-electronic', name: 'Minimal Electronic', mood: 'Minimalistisch', duration: 100, previewUrl: '/music/electronic.mp3' },
  { id: 'cinematic-epic', name: 'Cinematic Epic', mood: 'Episch', duration: 120, previewUrl: '/music/cinematic.mp3' },
  { id: 'happy-ukulele', name: 'Happy Ukulele', mood: 'Fröhlich', duration: 90, previewUrl: '/music/ukulele.mp3' },
];

export interface AudioConfig {
  voiceId: string;
  voiceName: string;
  voiceSpeed: number;
  voiceoverUrl: string | null;
  backgroundMusicId: string | null;
  backgroundMusicUrl: string | null;
  musicVolume: number;
  voiceVolume: number;
  language: ExtendedLanguage;
  soundEffects: SceneSoundConfig[];
  sceneVoiceConfigs: SceneVoiceConfig[];
}

interface AudioStepProps {
  briefing: ExplainerBriefing;
  script: ExplainerScript;
  onComplete: (config: AudioConfig) => void;
  onBack: () => void;
}

export function AudioStep({ briefing, script, onComplete, onBack }: AudioStepProps) {
  const [activeTab, setActiveTab] = useState('voice');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Voice settings
  const [selectedVoiceId, setSelectedVoiceId] = useState('aria');
  const [selectedVoiceName, setSelectedVoiceName] = useState('Aria');
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voiceoverUrl, setVoiceoverUrl] = useState<string | null>(null);
  const [voiceVolume, setVoiceVolume] = useState(100);
  
  // Music settings
  const [selectedMusicId, setSelectedMusicId] = useState<string | null>(null);
  const [musicVolume, setMusicVolume] = useState(30);
  const [playingMusicId, setPlayingMusicId] = useState<string | null>(null);
  
  // Language
  const [language, setLanguage] = useState<ExtendedLanguage>(briefing.language || 'de');
  
  // Sound effects (Phase C)
  const [soundConfigs, setSoundConfigs] = useState<SceneSoundConfig[]>([]);
  
  // Per-scene voice configs (Phase C)
  const [sceneVoiceConfigs, setSceneVoiceConfigs] = useState<SceneVoiceConfig[]>([]);
  
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicAudioRef = useRef<HTMLAudioElement | null>(null);

  // Combine all scene texts for voiceover
  const fullScript = script.scenes.map(s => s.spokenText).join(' ');

  const handleGenerateVoiceover = async () => {
    if (!fullScript.trim()) {
      toast.error('Kein Skript-Text vorhanden');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-voiceover', {
        body: {
          scriptText: fullScript,
          voice: selectedVoiceId,
          speed: voiceSpeed,
        },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Voice generation failed');

      setVoiceoverUrl(data.audioUrl);
      toast.success('Voice-Over erfolgreich generiert!');
    } catch (error) {
      console.error('Voice generation error:', error);
      toast.error('Fehler bei der Voice-Over-Generierung');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePlayVoiceover = () => {
    if (!voiceoverUrl) return;

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play();
        setIsPlaying(true);
      }
    }
  };

  const handleSelectMusic = (musicId: string) => {
    setSelectedMusicId(musicId === selectedMusicId ? null : musicId);
  };

  const handlePlayMusicPreview = (musicId: string) => {
    if (playingMusicId === musicId) {
      musicAudioRef.current?.pause();
      setPlayingMusicId(null);
    } else {
      setPlayingMusicId(musicId);
      setTimeout(() => setPlayingMusicId(null), 3000);
    }
  };

  const handleGenerateSceneVoiceover = async (sceneId: string, config: SceneVoiceConfig) => {
    const scene = script.scenes.find(s => s.id === sceneId);
    if (!scene) return;

    try {
      const { data, error } = await supabase.functions.invoke('generate-video-voiceover', {
        body: {
          scriptText: scene.spokenText,
          voice: selectedVoiceId,
          speed: config.speed,
        },
      });

      if (error) throw error;
      // Preview would be played here
      toast.success('Szenen-Vorschau generiert');
    } catch (error) {
      toast.error('Fehler bei der Vorschau-Generierung');
      throw error;
    }
  };

  const handleComplete = () => {
    const selectedMusic = MUSIC_LIBRARY.find(m => m.id === selectedMusicId);
    
    onComplete({
      voiceId: selectedVoiceId,
      voiceName: selectedVoiceName,
      voiceSpeed,
      voiceoverUrl,
      backgroundMusicId: selectedMusicId,
      backgroundMusicUrl: selectedMusic?.previewUrl || null,
      musicVolume,
      voiceVolume,
      language,
      soundEffects: soundConfigs,
      sceneVoiceConfigs,
    });
  };

  const canComplete = voiceoverUrl !== null;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      musicAudioRef.current?.pause();
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/30 mb-4"
        >
          <AudioWaveform className="h-4 w-4 text-primary" />
          <span className="text-sm text-primary font-medium">Professionelles Audio</span>
        </motion.div>
        <h2 className="text-3xl font-bold bg-gradient-to-r from-primary via-purple-400 to-cyan-400 bg-clip-text text-transparent">
          Voice-Over, Musik & Sound Design
        </h2>
        <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
          Professionelle Sprachausgabe mit emotionaler Betonung, kategorisierte Soundeffekte und Hintergrundmusik.
        </p>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full max-w-2xl mx-auto grid-cols-4 bg-muted/20 border border-white/10">
          <TabsTrigger value="voice" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Mic className="h-4 w-4 mr-2" />
            Voice-Over
          </TabsTrigger>
          <TabsTrigger value="emotion" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Wand2 className="h-4 w-4 mr-2" />
            Emotion
          </TabsTrigger>
          <TabsTrigger value="sfx" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Sparkles className="h-4 w-4 mr-2" />
            Sound FX
          </TabsTrigger>
          <TabsTrigger value="music" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
            <Music className="h-4 w-4 mr-2" />
            Musik
          </TabsTrigger>
        </TabsList>

        {/* Voice Tab */}
        <TabsContent value="voice" className="mt-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Voice Selection */}
            <Card className="bg-card/60 backdrop-blur-xl border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Mic className="h-5 w-5 text-primary" />
                  Stimme auswählen
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VoiceSelector
                  selectedVoiceId={selectedVoiceId}
                  selectedLanguage={language as ExplainerLanguage}
                  onSelectVoice={(id, name) => {
                    setSelectedVoiceId(id);
                    setSelectedVoiceName(name);
                    setVoiceoverUrl(null);
                  }}
                  onSelectLanguage={(lang) => {
                    setLanguage(lang);
                    setVoiceoverUrl(null);
                  }}
                />

                {/* Speed Control */}
                <div className="mt-6 p-4 rounded-lg bg-muted/20 border border-white/10">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Sprechgeschwindigkeit</span>
                    <span className="text-sm text-primary font-mono">{voiceSpeed.toFixed(1)}x</span>
                  </div>
                  <Slider
                    value={[voiceSpeed]}
                    onValueChange={([v]) => {
                      setVoiceSpeed(v);
                      setVoiceoverUrl(null);
                    }}
                    min={0.7}
                    max={1.3}
                    step={0.1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>Langsamer</span>
                    <span>Normal</span>
                    <span>Schneller</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Script Preview & Generation */}
            <Card className="bg-card/60 backdrop-blur-xl border-white/10">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Voice-Over generieren
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Script Preview */}
                <div className="p-4 rounded-lg bg-muted/20 border border-white/10 max-h-48 overflow-y-auto">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {fullScript}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {fullScript.split(' ').length} Wörter • ~{Math.ceil(fullScript.split(' ').length / 150)} Min. Sprechzeit
                </p>

                {/* Generate Button */}
                <Button
                  onClick={handleGenerateVoiceover}
                  disabled={isGenerating}
                  className="w-full bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generiere Voice-Over...
                    </>
                  ) : voiceoverUrl ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Neu generieren
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4 mr-2" />
                      Voice-Over generieren
                    </>
                  )}
                </Button>

                {/* Audio Player */}
                {voiceoverUrl && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-lg bg-primary/10 border border-primary/30"
                  >
                    <div className="flex items-center gap-3">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handlePlayVoiceover}
                        className="h-12 w-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        {isPlaying ? (
                          <Pause className="h-5 w-5" />
                        ) : (
                          <Play className="h-5 w-5 ml-0.5" />
                        )}
                      </Button>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Voice-Over bereit</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedVoiceName} • {voiceSpeed.toFixed(1)}x
                        </p>
                      </div>
                      <Check className="h-5 w-5 text-green-500" />
                    </div>
                    <audio
                      ref={audioRef}
                      src={voiceoverUrl}
                      onEnded={() => setIsPlaying(false)}
                      className="hidden"
                    />
                    
                    {/* Voice Volume */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
                      <Volume2 className="h-4 w-4 text-muted-foreground" />
                      <Slider
                        value={[voiceVolume]}
                        onValueChange={([v]) => setVoiceVolume(v)}
                        min={0}
                        max={100}
                        className="flex-1"
                      />
                      <span className="text-xs text-muted-foreground w-8">{voiceVolume}%</span>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Emotion Tab (Phase C - Per-Scene Emotional Settings) */}
        <TabsContent value="emotion" className="mt-6">
          <EnhancedVoiceSettings
            scenes={script.scenes}
            language={language}
            globalSpeed={voiceSpeed}
            sceneConfigs={sceneVoiceConfigs}
            onLanguageChange={setLanguage}
            onGlobalSpeedChange={(speed) => {
              setVoiceSpeed(speed);
              setVoiceoverUrl(null);
            }}
            onSceneConfigChange={setSceneVoiceConfigs}
            onGenerateSceneVoiceover={handleGenerateSceneVoiceover}
          />
        </TabsContent>

        {/* Sound FX Tab (Phase C - Sound Design Library) */}
        <TabsContent value="sfx" className="mt-6">
          <Card className="bg-card/60 backdrop-blur-xl border-white/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Sound Design Library
                <span className="ml-2 px-2 py-0.5 text-xs bg-gradient-to-r from-purple-500/20 to-cyan-500/20 rounded-full border border-purple-500/30">
                  Pro
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SoundDesignLibrary
                scenes={script.scenes}
                soundConfigs={soundConfigs}
                onUpdateSoundConfigs={setSoundConfigs}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Music Tab */}
        <TabsContent value="music" className="mt-6">
          <Card className="bg-card/60 backdrop-blur-xl border-white/10">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                Hintergrundmusik (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Music Library */}
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
                {MUSIC_LIBRARY.map((track, index) => (
                  <motion.button
                    key={track.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => handleSelectMusic(track.id)}
                    className={cn(
                      "relative p-4 rounded-xl border text-left transition-all duration-200",
                      selectedMusicId === track.id
                        ? "bg-primary/20 border-primary/50 shadow-[0_0_20px_rgba(245,199,106,0.2)]"
                        : "bg-muted/20 border-white/10 hover:bg-muted/40"
                    )}
                  >
                    {selectedMusicId === track.id && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                      >
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </motion.div>
                    )}
                    
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500/30 to-cyan-500/30 flex items-center justify-center">
                        <Music className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-medium text-sm">{track.name}</h4>
                        <p className="text-xs text-muted-foreground">{track.mood}</p>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayMusicPreview(track.id);
                      }}
                      className="absolute bottom-2 right-2 h-7 w-7 p-0 rounded-full bg-white/5 hover:bg-white/10"
                    >
                      {playingMusicId === track.id ? (
                        <Pause className="h-3 w-3" />
                      ) : (
                        <Play className="h-3 w-3" />
                      )}
                    </Button>
                  </motion.button>
                ))}
              </div>

              {/* Music Volume Control */}
              {selectedMusicId && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mt-6 p-4 rounded-lg bg-muted/20 border border-white/10"
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium">Musik-Lautstärke</span>
                    <span className="text-sm text-primary font-mono">{musicVolume}%</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <VolumeX className="h-4 w-4 text-muted-foreground" />
                    <Slider
                      value={[musicVolume]}
                      onValueChange={([v]) => setMusicVolume(v)}
                      min={0}
                      max={100}
                      className="flex-1"
                    />
                    <Volume2 className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    💡 Empfehlung: 20-40% für gute Hörbarkeit der Stimme (Auto-Ducking aktiv)
                  </p>
                </motion.div>
              )}

              {/* No Music Option */}
              <Button
                variant="ghost"
                onClick={() => setSelectedMusicId(null)}
                className={cn(
                  "mt-4 w-full justify-start",
                  !selectedMusicId && "bg-muted/20 border border-primary/30"
                )}
              >
                <VolumeX className="h-4 w-4 mr-2" />
                Keine Hintergrundmusik
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-6 border-t border-white/10">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Zurück
        </Button>

        <div className="flex items-center gap-4">
          {!canComplete && (
            <p className="text-sm text-muted-foreground">
              Generiere zuerst ein Voice-Over
            </p>
          )}
          <Button
            onClick={handleComplete}
            disabled={!canComplete}
            className="bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90"
          >
            Weiter zum Export
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
