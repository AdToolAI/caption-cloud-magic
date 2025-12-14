import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Library, Play, Pause, Download, Trash2, RotateCcw, 
  Calendar, Settings2, FileAudio, Volume2, Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { EnhancementOptions } from '@/hooks/useAudioEnhancement';

interface SoundLibraryItem {
  id: string;
  title: string;
  url: string;
  original_url: string | null;
  processing_preset: string | null;
  effect_config: EnhancementOptions | null;
  duration_sec: number | null;
  created_at: string;
  type: string;
  source: string | null;
}

interface SoundLibraryProps {
  onLoadAudio?: (url: string, originalUrl?: string | null, effectConfig?: EnhancementOptions | null) => void;
}

export function SoundLibrary({ onLoadAudio }: SoundLibraryProps) {
  const { user } = useAuth();
  const [sounds, setSounds] = useState<SoundLibraryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch sounds from database
  useEffect(() => {
    if (!user?.id) return;
    
    const fetchSounds = async () => {
      setIsLoading(true);
      try {
        const { data, error } = await supabase
          .from('universal_audio_assets')
          .select('id, title, url, original_audio_url, processing_preset, effect_config, duration_sec, created_at, type, source')
          .eq('user_id', user.id)
          .eq('source', 'voicepro')
          .order('created_at', { ascending: false });

        if (error) throw error;
        
        setSounds((data || []).map(item => ({
          id: item.id,
          title: item.title || 'Untitled',
          url: item.url || '',
          original_url: item.original_audio_url,
          processing_preset: item.processing_preset,
          effect_config: item.effect_config as EnhancementOptions | null,
          duration_sec: item.duration_sec ? Number(item.duration_sec) : null,
          created_at: item.created_at || new Date().toISOString(),
          type: item.type || 'enhanced',
          source: item.source
        })));
      } catch (error) {
        console.error('Error fetching sounds:', error);
        toast.error('Fehler beim Laden der Sound-Bibliothek');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSounds();
  }, [user?.id]);

  // Filter sounds based on search
  const filteredSounds = sounds.filter(sound => 
    sound.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (sound.processing_preset?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Play/pause audio
  const togglePlay = (sound: SoundLibraryItem) => {
    if (playingId === sound.id) {
      audioRef.current?.pause();
      setPlayingId(null);
    } else {
      if (audioRef.current) {
        audioRef.current.src = sound.url;
        audioRef.current.play();
        setPlayingId(sound.id);
      }
    }
  };

  // Download audio
  const downloadAudio = async (sound: SoundLibraryItem) => {
    try {
      const response = await fetch(sound.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${sound.title}.mp3`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('Download gestartet');
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download fehlgeschlagen');
    }
  };

  // Delete sound
  const deleteSound = async (soundId: string) => {
    if (!confirm('Möchtest du diesen Sound wirklich löschen?')) return;
    
    try {
      const { error } = await supabase
        .from('universal_audio_assets')
        .delete()
        .eq('id', soundId);

      if (error) throw error;
      
      setSounds(prev => prev.filter(s => s.id !== soundId));
      toast.success('Sound gelöscht');
    } catch (error) {
      console.error('Delete error:', error);
      toast.error('Löschen fehlgeschlagen');
    }
  };

  // Format date
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Format duration
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Get preset label
  const getPresetLabel = (preset: string | null) => {
    const labels: Record<string, string> = {
      minimal: 'Minimal',
      podcast: 'Podcast',
      radio: 'Radio',
      maximal: 'Maximal',
      custom: 'Custom'
    };
    return labels[preset || ''] || preset || 'Standard';
  };

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50 p-6">
      {/* Hidden audio element for playback */}
      <audio 
        ref={audioRef} 
        onEnded={() => setPlayingId(null)}
        className="hidden"
      />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-cyan-500/20 flex items-center justify-center">
            <Library className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold">Sound-Bibliothek</h3>
            <p className="text-xs text-muted-foreground">{sounds.length} gespeicherte Sounds</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-muted/20 border-border/50"
          />
        </div>
      </div>

      {/* Sound List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              Lädt...
            </div>
          ) : filteredSounds.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <FileAudio className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? 'Keine Ergebnisse gefunden' : 'Noch keine Sounds gespeichert'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Optimiere Audio und speichere es in der Bibliothek
              </p>
            </motion.div>
          ) : (
            filteredSounds.map((sound, index) => (
              <motion.div
                key={sound.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: index * 0.05 }}
                className={`
                  relative p-4 rounded-xl border transition-all
                  ${playingId === sound.id 
                    ? 'bg-primary/10 border-primary/30 shadow-[0_0_20px_rgba(245,199,106,0.15)]' 
                    : 'bg-muted/20 border-border/50 hover:border-primary/30'
                  }
                `}
              >
                <div className="flex items-center gap-4">
                  {/* Play Button */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => togglePlay(sound)}
                    className={`
                      w-12 h-12 rounded-full shrink-0
                      ${playingId === sound.id 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted/30 hover:bg-primary/10 hover:text-primary'
                      }
                    `}
                  >
                    {playingId === sound.id ? (
                      <Pause className="w-5 h-5" />
                    ) : (
                      <Play className="w-5 h-5 ml-0.5" />
                    )}
                  </Button>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium truncate">{sound.title}</span>
                      <Badge variant="outline" className="shrink-0 text-[10px] px-1.5 py-0">
                        {getPresetLabel(sound.processing_preset)}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Volume2 className="w-3 h-3" />
                        {formatDuration(sound.duration_sec)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(sound.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {onLoadAudio && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onLoadAudio(sound.url, sound.original_url, sound.effect_config)}
                        className="w-9 h-9 hover:bg-cyan-500/10 hover:text-cyan-500"
                        title="In Editor laden"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => downloadAudio(sound)}
                      className="w-9 h-9 hover:bg-primary/10 hover:text-primary"
                      title="Herunterladen"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSound(sound.id)}
                      className="w-9 h-9 hover:bg-destructive/10 hover:text-destructive"
                      title="Löschen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Effect config info (collapsed) */}
                {sound.effect_config && (
                  <div className="mt-2 pt-2 border-t border-border/30">
                    <button 
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Settings2 className="w-3 h-3" />
                      {Object.values(sound.effect_config).filter(Boolean).length} Effekte aktiv
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </Card>
  );
}
