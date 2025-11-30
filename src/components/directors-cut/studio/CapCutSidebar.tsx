import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FolderOpen, Headphones, Type, Sparkles, Wand2,
  Mic, Music, Volume2, Search, Play, Plus, Loader2, Pause
} from 'lucide-react';
import { AudioClip } from '@/types/timeline';
import { AudioEnhancements } from '@/types/directors-cut';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface CapCutSidebarProps {
  onAddClip: (trackId: string, clip: Omit<AudioClip, 'id'>) => void;
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
}

interface JamendoTrack {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
  preview_url?: string;
  thumbnail?: string;
}

const MOODS = [
  { value: '', label: 'Alle Stimmungen' },
  { value: 'energetisch', label: '⚡ Energetisch' },
  { value: 'entspannt', label: '😌 Entspannt' },
  { value: 'fröhlich', label: '😊 Fröhlich' },
  { value: 'traurig', label: '😢 Traurig' },
  { value: 'dramatisch', label: '🎭 Dramatisch' },
  { value: 'romantisch', label: '❤️ Romantisch' },
];

const GENRES = [
  { value: '', label: 'Alle Genres' },
  { value: 'pop', label: '🎵 Pop' },
  { value: 'rock', label: '🎸 Rock' },
  { value: 'elektronisch', label: '🎛️ Elektronisch' },
  { value: 'klassisch', label: '🎻 Klassisch' },
  { value: 'jazz', label: '🎷 Jazz' },
  { value: 'hip hop', label: '🎤 Hip Hop' },
  { value: 'ambient', label: '🌊 Ambient' },
];

const SFX_PRESETS = [
  { name: 'Whoosh', duration: 1, category: 'transition' },
  { name: 'Click', duration: 0.5, category: 'ui' },
  { name: 'Pop', duration: 0.3, category: 'notification' },
  { name: 'Impact', duration: 1.5, category: 'dramatic' },
  { name: 'Swoosh', duration: 0.8, category: 'transition' },
  { name: 'Ding', duration: 0.6, category: 'notification' },
];

// CORS Proxy Helper for Jamendo URLs
const getProxiedUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes('jamendo.com') || url.includes('storage.jamendo.com')) {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-audio?url=${encodeURIComponent(url)}`;
  }
  return url;
};

// Format duration helper
const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const CapCutSidebar: React.FC<CapCutSidebarProps> = ({
  onAddClip,
  audioEnhancements,
  onAudioChange,
}) => {
  const [voiceText, setVoiceText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Jamendo Search State
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  
  // Audio Playback State
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Jamendo Search Query
  const { data: stockMusic, isLoading: stockLoading } = useQuery({
    queryKey: ['stock-music-capcut', musicSearchQuery, selectedMood, selectedGenre],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: { 
          query: musicSearchQuery || 'instrumental',
          mood: selectedMood,
          genre: selectedGenre
        },
      });
      if (error) throw error;
      return (data?.results || []) as JamendoTrack[];
    },
    enabled: searchTriggered,
  });

  // Handle search
  const handleSearch = () => {
    setSearchTriggered(true);
  };

  // Play/Pause Handler
  const handlePlayPause = (track: JamendoTrack) => {
    const trackUrl = track.url || track.preview_url;
    const proxiedUrl = getProxiedUrl(trackUrl);
    if (!proxiedUrl) return;

    if (playingTrackId === track.id) {
      // Stop current track
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      // Stop previous track
      audioRef.current?.pause();
      setIsLoadingAudio(true);
      setPlayingTrackId(track.id);

      const audio = new Audio();
      
      audio.addEventListener('canplaythrough', () => {
        setIsLoadingAudio(false);
        audio.play().catch(() => {
          toast.error('Audio konnte nicht abgespielt werden');
          setPlayingTrackId(null);
        });
      }, { once: true });

      audio.addEventListener('error', () => {
        toast.error('Audio konnte nicht geladen werden');
        setPlayingTrackId(null);
        setIsLoadingAudio(false);
      }, { once: true });

      audio.addEventListener('ended', () => {
        setPlayingTrackId(null);
      }, { once: true });

      audio.src = proxiedUrl;
      audioRef.current = audio;
    }
  };

  // Add track to timeline
  const handleAddToTimeline = (track: JamendoTrack) => {
    const trackUrl = track.url || track.preview_url;
    const proxiedUrl = getProxiedUrl(trackUrl);

    onAddClip('track-music', {
      trackId: 'track-music',
      name: track.title,
      url: proxiedUrl || '',
      startTime: 0,
      duration: track.duration,
      trimStart: 0,
      trimEnd: track.duration,
      volume: 70,
      fadeIn: 2,
      fadeOut: 2,
      source: 'library',
      color: '#10b981',
    });

    toast.success(`"${track.title}" zur Timeline hinzugefügt`);
  };

  const handleGenerateVoice = async () => {
    if (!voiceText.trim()) return;
    setIsGenerating(true);
    setTimeout(() => {
      onAddClip('track-voiceover', {
        trackId: 'track-voiceover',
        name: 'AI Voice',
        url: '',
        startTime: 0,
        duration: 5,
        trimStart: 0,
        trimEnd: 5,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        source: 'ai-generated',
        color: '#f59e0b',
      });
      setIsGenerating(false);
      setVoiceText('');
    }, 2000);
  };

  return (
    <div className="w-64 flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e]">
      <Tabs defaultValue="audio" className="flex-1 flex flex-col">
        <TabsList className="h-12 grid grid-cols-5 bg-[#242424] rounded-none border-b border-[#2a2a2a] p-0">
          <TabsTrigger 
            value="media" 
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <FolderOpen className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="audio"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Headphones className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="text"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Type className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="effects"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Sparkles className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="enhance"
            className="rounded-none data-[state=active]:bg-[#2a2a2a] data-[state=active]:text-[#00d4ff] text-white/60"
          >
            <Wand2 className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* Media Tab */}
          <TabsContent value="media" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <FolderOpen className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Drag media here</p>
            </div>
          </TabsContent>

          {/* Audio Tab */}
          <TabsContent value="audio" className="m-0 p-0">
            {/* AI Voice Section */}
            <div className="p-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-3">
                <Mic className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">AI Voice-Over</span>
              </div>
              <textarea
                value={voiceText}
                onChange={(e) => setVoiceText(e.target.value)}
                placeholder="Enter text for AI voice..."
                className="w-full h-20 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md p-2 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none focus:border-[#00d4ff]"
              />
              <Button 
                className="w-full mt-2 bg-[#00d4ff] hover:bg-[#00b8e0] text-black text-sm h-8"
                onClick={handleGenerateVoice}
                disabled={!voiceText.trim() || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</>
                ) : (
                  <><Mic className="h-3.5 w-3.5 mr-1.5" /> Generate Voice</>
                )}
              </Button>
            </div>

            {/* Music Section - Jamendo Integration */}
            <div className="p-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-3">
                <Music className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">Music</span>
                <span className="text-[10px] text-white/40 ml-auto">via Jamendo</span>
              </div>
              
              {/* Search Input */}
              <div className="flex gap-1.5 mb-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40" />
                  <Input
                    value={musicSearchQuery}
                    onChange={(e) => setMusicSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Musik suchen..."
                    className="pl-7 h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white placeholder:text-white/40"
                  />
                </div>
                <Button 
                  size="sm" 
                  onClick={handleSearch}
                  disabled={stockLoading}
                  className="h-8 w-8 p-0 bg-[#00d4ff] hover:bg-[#00b8e0]"
                >
                  {stockLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {/* Mood & Genre Filters */}
              <div className="flex gap-1.5 mb-3">
                <Select value={selectedMood} onValueChange={(v) => { setSelectedMood(v); setSearchTriggered(false); }}>
                  <SelectTrigger className="flex-1 h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
                    <SelectValue placeholder="Stimmung" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                    {MOODS.map(mood => (
                      <SelectItem key={mood.value} value={mood.value || 'all'} className="text-white text-xs">
                        {mood.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={selectedGenre} onValueChange={(v) => { setSelectedGenre(v); setSearchTriggered(false); }}>
                  <SelectTrigger className="flex-1 h-7 bg-[#2a2a2a] border-[#3a3a3a] text-xs text-white">
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                    {GENRES.map(genre => (
                      <SelectItem key={genre.value} value={genre.value || 'all'} className="text-white text-xs">
                        {genre.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Search Results */}
              {stockLoading ? (
                <div className="text-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#00d4ff]" />
                  <p className="text-[10px] text-white/40 mt-2">Suche läuft...</p>
                </div>
              ) : stockMusic && stockMusic.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {stockMusic.map((track) => (
                    <div 
                      key={track.id}
                      className="flex items-center gap-2 p-1.5 rounded hover:bg-[#2a2a2a] group"
                    >
                      {/* Play Button */}
                      <button
                        onClick={() => handlePlayPause(track)}
                        className="w-7 h-7 rounded-full bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 flex items-center justify-center flex-shrink-0"
                      >
                        {playingTrackId === track.id ? (
                          isLoadingAudio ? (
                            <Loader2 className="h-3 w-3 animate-spin text-[#00d4ff]" />
                          ) : (
                            <Pause className="h-3 w-3 text-[#00d4ff]" />
                          )
                        ) : (
                          <Play className="h-3 w-3 text-[#00d4ff] ml-0.5" />
                        )}
                      </button>
                      
                      {/* Track Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate">{track.title}</p>
                        <p className="text-[10px] text-white/40 truncate">
                          {track.artist} • {formatDuration(track.duration)}
                        </p>
                      </div>
                      
                      {/* Add Button */}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAddToTimeline(track)}
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-[#00d4ff]/20"
                      >
                        <Plus className="h-3.5 w-3.5 text-[#00d4ff]" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : searchTriggered ? (
                <div className="text-center py-6 text-white/40">
                  <Music className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Keine Ergebnisse</p>
                  <p className="text-[10px] mt-1">Andere Suchbegriffe probieren</p>
                </div>
              ) : (
                <div className="text-center py-6 text-white/40">
                  <Music className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Lizenzfreie Musik suchen</p>
                  <p className="text-[10px] mt-1">Powered by Jamendo</p>
                </div>
              )}
            </div>

            {/* SFX Section */}
            <div className="p-3">
              <div className="flex items-center gap-2 mb-3">
                <Volume2 className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">Sound Effects</span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {SFX_PRESETS.map((sfx, i) => (
                  <button
                    key={i}
                    className="p-2 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-colors text-left"
                    onClick={() => onAddClip('track-sfx', {
                      trackId: 'track-sfx',
                      name: sfx.name,
                      url: '',
                      startTime: 0,
                      duration: sfx.duration,
                      trimStart: 0,
                      trimEnd: sfx.duration,
                      volume: 100,
                      fadeIn: 0,
                      fadeOut: 0,
                      source: 'library',
                      color: '#ec4899',
                    })}
                  >
                    <p className="text-xs text-white">{sfx.name}</p>
                    <p className="text-[10px] text-white/40">{sfx.duration}s</p>
                  </button>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Text Tab */}
          <TabsContent value="text" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <Type className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">AI Captions</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </TabsContent>

          {/* Effects Tab */}
          <TabsContent value="effects" className="m-0 p-3">
            <div className="text-center text-white/40 py-8">
              <Sparkles className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Audio Effects</p>
              <p className="text-xs mt-1">Coming soon</p>
            </div>
          </TabsContent>

          {/* Enhance Tab */}
          <TabsContent value="enhance" className="m-0 p-3 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Wand2 className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">AI Enhancement</span>
            </div>

            {/* Noise Reduction */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Noise Reduction</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.noise_reduction}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, noise_reduction: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
              {audioEnhancements.noise_reduction && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Level</span>
                    <span className="text-[10px] text-white/40">{audioEnhancements.noise_reduction_level}%</span>
                  </div>
                  <Slider
                    value={[audioEnhancements.noise_reduction_level]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => onAudioChange({ ...audioEnhancements, noise_reduction_level: v })}
                  />
                </>
              )}
            </div>

            {/* Voice Enhancement */}
            <div className="space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Voice Clarity</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.voice_enhancement}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, voice_enhancement: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
            </div>

            {/* Auto Ducking */}
            <div className="pt-2 border-t border-[#2a2a2a]">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-xs text-white/70">Auto-Ducking</span>
                <input
                  type="checkbox"
                  checked={audioEnhancements.auto_ducking}
                  onChange={(e) => onAudioChange({ ...audioEnhancements, auto_ducking: e.target.checked })}
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a]"
                />
              </label>
              <p className="text-[10px] text-white/40 mt-1">Lower music when voice plays</p>
              {audioEnhancements.auto_ducking && (
                <div className="mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-white/40">Ducking Level</span>
                    <span className="text-[10px] text-white/40">{audioEnhancements.ducking_level}%</span>
                  </div>
                  <Slider
                    value={[audioEnhancements.ducking_level]}
                    max={100}
                    step={1}
                    onValueChange={([v]) => onAudioChange({ ...audioEnhancements, ducking_level: v })}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
