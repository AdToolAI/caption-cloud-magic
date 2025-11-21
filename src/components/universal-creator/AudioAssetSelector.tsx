import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Music,
  Upload,
  Search,
  Play,
  Pause,
  Volume2,
  Mic,
  Loader2,
  Check,
  Download
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface AudioAssetSelectorProps {
  selectedMusicId?: string | null;
  selectedVoiceoverId?: string | null;
  musicVolume?: number;
  voiceoverVolume?: number;
  onMusicSelect: (assetId: string | null) => void;
  onVoiceoverSelect: (assetId: string | null) => void;
  onMusicVolumeChange: (volume: number) => void;
  onVoiceoverVolumeChange: (volume: number) => void;
}

export const AudioAssetSelector = ({
  selectedMusicId,
  selectedVoiceoverId,
  musicVolume = 0.3,
  voiceoverVolume = 1.0,
  onMusicSelect,
  onVoiceoverSelect,
  onMusicVolumeChange,
  onVoiceoverVolumeChange,
}: AudioAssetSelectorProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('library');
  
  // Music search state
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  
  // Voiceover state
  const [voiceoverText, setVoiceoverText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('9BWtsMINqrJLrRacOk9x'); // Aria
  
  // Audio playback
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);

  // Fetch user's audio library
  const { data: audioLibrary, isLoading: libraryLoading } = useQuery({
    queryKey: ['audio-library'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('universal_audio_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Search stock music
  const { data: stockMusic, isLoading: stockLoading } = useQuery({
    queryKey: ['stock-music', musicSearchQuery, selectedMood, selectedGenre],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: { 
          query: musicSearchQuery,
          mood: selectedMood,
          genre: selectedGenre
        },
      });

      if (error) throw error;
      return data.results || [];
    },
    enabled: searchTriggered,
  });

  // Generate voiceover mutation
  const generateVoiceover = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('generate-voiceover', {
        body: { 
          text: voiceoverText,
          voiceId: selectedVoice,
          model: 'eleven_turbo_v2_5'
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Voiceover generiert!' });
      queryClient.invalidateQueries({ queryKey: ['audio-library'] });
      onVoiceoverSelect(data.asset.id);
      setVoiceoverText('');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Add stock music to library
  const addStockMusic = useMutation({
    mutationFn: async (track: any) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('universal_audio_assets')
        .insert({
          user_id: user.id,
          type: 'music',
          title: track.title,
          url: track.url,
          duration_sec: track.duration,
          genre: track.genre,
          mood: track.mood,
          bpm: track.bpm,
          source: 'stock',
          stock_provider: 'pixabay',
          stock_id: track.id.toString(),
          thumbnail_url: track.thumbnail,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({ title: 'Musik zur Bibliothek hinzugefügt' });
      queryClient.invalidateQueries({ queryKey: ['audio-library'] });
      onMusicSelect(data.id);
      setActiveTab('library');
    },
    onError: (error: any) => {
      toast({
        title: 'Fehler',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePlayPause = (url: string) => {
    if (playingAudio === url) {
      audioElement?.pause();
      setPlayingAudio(null);
    } else {
      audioElement?.pause();
      const audio = new Audio(url);
      audio.play();
      audio.onended = () => setPlayingAudio(null);
      setAudioElement(audio);
      setPlayingAudio(url);
    }
  };

  const musicTracks = audioLibrary?.filter(a => a.type === 'music') || [];
  const voiceovers = audioLibrary?.filter(a => a.type === 'voiceover') || [];

  const voices = [
    { id: '9BWtsMINqrJLrRacOk9x', name: 'Aria (Female)' },
    { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily (Female)' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)' },
    { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam (Male)' },
    { id: 'CwhRBWXzGAHq8TQ4Fs17', name: 'Roger (Male)' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Male)' },
  ];

  return (
    <div className="space-y-6">
      {/* Background Music Section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Music className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Hintergrundmusik</h3>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="library">
              <Music className="h-4 w-4 mr-2" />
              Meine Musik
            </TabsTrigger>
            <TabsTrigger value="stock">
              <Search className="h-4 w-4 mr-2" />
              Stock Musik
            </TabsTrigger>
          </TabsList>

          <TabsContent value="library" className="space-y-4">
            {libraryLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : musicTracks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Noch keine Musik in deiner Bibliothek</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {musicTracks.map((track) => (
                  <div
                    key={track.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedMusicId === track.id
                        ? 'bg-primary/10 border-primary'
                        : 'hover:bg-muted/50 border-border'
                    }`}
                    onClick={() => onMusicSelect(track.id)}
                  >
                    {track.thumbnail_url && (
                      <img
                        src={track.thumbnail_url}
                        alt={track.title}
                        className="w-12 h-12 rounded object-cover"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground">
                        {track.genre && <Badge variant="outline">{track.genre}</Badge>}
                        {track.mood && <Badge variant="outline">{track.mood}</Badge>}
                        {track.duration_sec && <span>{Math.round(track.duration_sec)}s</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPause(track.url);
                      }}
                    >
                      {playingAudio === track.url ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    {selectedMusicId === track.id && (
                      <Check className="h-5 w-5 text-primary" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stock" className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Nach Musik suchen..."
                value={musicSearchQuery}
                onChange={(e) => setMusicSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && setSearchTriggered(true)}
              />
              <Select value={selectedMood} onValueChange={setSelectedMood}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Stimmung" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Alle</SelectItem>
                  <SelectItem value="upbeat">Upbeat</SelectItem>
                  <SelectItem value="chill">Chill</SelectItem>
                  <SelectItem value="epic">Epic</SelectItem>
                  <SelectItem value="happy">Happy</SelectItem>
                  <SelectItem value="calm">Calm</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setSearchTriggered(true)}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {stockLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : searchTriggered && stockMusic ? (
              <div className="grid grid-cols-1 gap-3">
                {stockMusic.map((track: any) => (
                  <div
                    key={track.id}
                    className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-all"
                  >
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-12 h-12 rounded object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{track.title}</p>
                      <p className="text-xs text-muted-foreground">{track.artist}</p>
                      <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                        <Badge variant="outline">{track.genre}</Badge>
                        <Badge variant="outline">{track.mood}</Badge>
                        <span>{track.duration}s</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handlePlayPause(track.preview_url || track.url)}
                    >
                      {playingAudio === (track.preview_url || track.url) ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => addStockMusic.mutate(track)}
                      disabled={addStockMusic.isPending}
                    >
                      {addStockMusic.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Suche nach Hintergrundmusik</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Music Volume Control */}
        {selectedMusicId && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center gap-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium min-w-[100px]">
                Lautstärke: {Math.round(musicVolume * 100)}%
              </span>
              <Slider
                value={[musicVolume]}
                onValueChange={([value]) => onMusicVolumeChange(value)}
                min={0}
                max={1}
                step={0.05}
                className="flex-1"
              />
            </div>
          </div>
        )}
      </Card>

      {/* Voiceover Section */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Voiceover (Text-to-Speech)</h3>
        </div>

        <div className="space-y-4">
          <Textarea
            placeholder="Text für Voiceover eingeben..."
            value={voiceoverText}
            onChange={(e) => setVoiceoverText(e.target.value)}
            rows={4}
          />

          <div className="flex gap-3">
            <Select value={selectedVoice} onValueChange={setSelectedVoice}>
              <SelectTrigger className="flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {voices.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              onClick={() => generateVoiceover.mutate()}
              disabled={!voiceoverText.trim() || generateVoiceover.isPending}
            >
              {generateVoiceover.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generiere...
                </>
              ) : (
                <>
                  <Mic className="h-4 w-4 mr-2" />
                  Generieren
                </>
              )}
            </Button>
          </div>

          {/* Existing Voiceovers */}
          {voiceovers.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Gespeicherte Voiceovers:</p>
              {voiceovers.map((vo) => (
                <div
                  key={vo.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedVoiceoverId === vo.id
                      ? 'bg-primary/10 border-primary'
                      : 'hover:bg-muted/50 border-border'
                  }`}
                  onClick={() => onVoiceoverSelect(vo.id)}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{vo.title}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayPause(vo.url);
                    }}
                  >
                    {playingAudio === vo.url ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  {selectedVoiceoverId === vo.id && (
                    <Check className="h-5 w-5 text-primary" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Voiceover Volume Control */}
          {selectedVoiceoverId && (
            <div className="pt-4 border-t">
              <div className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium min-w-[100px]">
                  Lautstärke: {Math.round(voiceoverVolume * 100)}%
                </span>
                <Slider
                  value={[voiceoverVolume]}
                  onValueChange={([value]) => onVoiceoverVolumeChange(value)}
                  min={0}
                  max={1}
                  step={0.05}
                  className="flex-1"
                />
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};
