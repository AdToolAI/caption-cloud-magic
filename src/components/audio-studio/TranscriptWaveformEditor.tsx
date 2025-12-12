import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, Loader2, Trash2, Play, Search, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WaveformDisplay } from '@/components/directors-cut/timeline/WaveformDisplay';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  type: 'normal' | 'filler' | 'pause';
}

interface TranscriptWaveformEditorProps {
  audioUrl: string;
  transcript: TranscriptWord[];
  currentTime: number;
  duration: number;
  onTimeChange: (time: number) => void;
  onTranscriptChange: (transcript: TranscriptWord[]) => void;
}

export function TranscriptWaveformEditor({
  audioUrl,
  transcript,
  currentTime,
  duration,
  onTimeChange,
  onTranscriptChange
}: TranscriptWaveformEditorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedWords, setSelectedWords] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const generateTranscript = async () => {
    setIsGenerating(true);
    let tempFileName: string | null = null;
    
    try {
      // 1. Fetch audio from blob URL
      const response = await fetch(audioUrl);
      const blob = await response.blob();
      
      // 2. Upload temporarily to Supabase Storage
      tempFileName = `temp-transcript-${Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('audio-temp')
        .upload(tempFileName, blob, { contentType: blob.type || 'audio/mpeg' });
      
      if (uploadError) throw new Error(`Upload fehlgeschlagen: ${uploadError.message}`);
      
      // 3. Get public URL
      const { data: urlData } = supabase.storage
        .from('audio-temp')
        .getPublicUrl(tempFileName);
      
      // 4. Call Edge Function with URL
      const { data, error } = await supabase.functions.invoke('generate-subtitles', {
        body: { audioUrl: urlData.publicUrl, language: 'de' }
      });

      if (error) throw error;

      // Convert subtitle segments to transcript words
      const words: TranscriptWord[] = [];
      const fillerWords = ['ähm', 'äh', 'also', 'ja', 'okay', 'halt', 'quasi', 'sozusagen', 'irgendwie'];
      
      // Handle response: subtitles array with startTime/endTime
      if (data?.subtitles) {
        data.subtitles.forEach((segment: any) => {
          const segmentWords = segment.text.trim().split(/\s+/);
          const startTime = segment.startTime ?? segment.start ?? 0;
          const endTime = segment.endTime ?? segment.end ?? 0;
          const wordDuration = (endTime - startTime) / Math.max(segmentWords.length, 1);
          
          segmentWords.forEach((word: string, i: number) => {
            const cleanWord = word.toLowerCase().replace(/[.,!?]/g, '');
            words.push({
              word: word,
              start: startTime + i * wordDuration,
              end: startTime + (i + 1) * wordDuration,
              type: fillerWords.includes(cleanWord) ? 'filler' : 'normal'
            });
          });
        });
      }

      onTranscriptChange(words);
      toast.success('Transcript erfolgreich generiert');
    } catch (error) {
      console.error('Transcript error:', error);
      toast.error('Fehler beim Generieren des Transcripts');
    } finally {
      // 5. Cleanup: Delete temp file
      if (tempFileName) {
        supabase.storage.from('audio-temp').remove([tempFileName]).catch(() => {});
      }
      setIsGenerating(false);
    }
  };

  const toggleWordSelection = (index: number) => {
    const newSelected = new Set(selectedWords);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedWords(newSelected);
  };

  const deleteSelectedWords = () => {
    const newTranscript = transcript.filter((_, i) => !selectedWords.has(i));
    onTranscriptChange(newTranscript);
    setSelectedWords(new Set());
    toast.success(`${selectedWords.size} Wörter entfernt`);
  };

  const getCurrentWordIndex = () => {
    return transcript.findIndex(w => currentTime >= w.start && currentTime < w.end);
  };

  const currentWordIndex = getCurrentWordIndex();

  // Auto-scroll to current word
  useEffect(() => {
    if (scrollRef.current && currentWordIndex >= 0) {
      const wordElement = scrollRef.current.querySelector(`[data-word-index="${currentWordIndex}"]`);
      if (wordElement) {
        wordElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentWordIndex]);

  const filteredTranscript = searchQuery
    ? transcript.filter(w => w.word.toLowerCase().includes(searchQuery.toLowerCase()))
    : transcript;

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50 overflow-hidden">
      {/* Waveform Header */}
      <div className="p-4 border-b border-border/50">
        <div className="h-20 relative">
          <WaveformDisplay
            audioUrl={audioUrl}
            duration={duration}
            color="rgba(var(--primary), 0.6)"
            height={80}
          />
          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-0.5 bg-cyan-500 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
            style={{ left: `${(currentTime / duration) * 100}%` }}
          />
        </div>
      </div>

      {/* Transcript Area */}
      <div className="p-4">
        {transcript.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Mic className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Transcript generieren</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Generiere ein Transcript, um Audio wie Text zu bearbeiten. 
              Markiere Wörter zum Löschen oder suche nach bestimmten Passagen.
            </p>
            <Button
              onClick={generateTranscript}
              disabled={isGenerating}
              className="bg-gradient-to-r from-primary to-cyan-500"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generiere...
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4 mr-2" />
                  Transcript generieren
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-4 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Im Transcript suchen..."
                  className="pl-10 bg-muted/30 border-border/50"
                />
              </div>
              
              <AnimatePresence>
                {selectedWords.size > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                  >
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={deleteSelectedWords}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {selectedWords.size} löschen
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Transcript Words */}
            <ScrollArea className="h-[400px]" ref={scrollRef}>
              <div className="flex flex-wrap gap-1 p-2">
                {filteredTranscript.map((word, index) => {
                  const originalIndex = transcript.indexOf(word);
                  const isCurrent = originalIndex === currentWordIndex;
                  const isSelected = selectedWords.has(originalIndex);
                  const isFiller = word.type === 'filler';

                  return (
                    <motion.button
                      key={`${originalIndex}-${word.word}`}
                      data-word-index={originalIndex}
                      onClick={() => {
                        toggleWordSelection(originalIndex);
                        onTimeChange(word.start);
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className={`
                        px-2 py-1 rounded text-sm transition-all
                        ${isCurrent 
                          ? 'bg-cyan-500/30 text-cyan-300 ring-2 ring-cyan-500/50' 
                          : isSelected 
                            ? 'bg-destructive/30 text-destructive-foreground line-through' 
                            : isFiller 
                              ? 'bg-yellow-500/20 text-yellow-300' 
                              : 'bg-muted/30 hover:bg-muted/50'
                        }
                      `}
                    >
                      {word.word}
                    </motion.button>
                  );
                })}
              </div>
            </ScrollArea>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border/50 text-xs text-muted-foreground">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-cyan-500/30" />
                <span>Aktuell</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-yellow-500/20" />
                <span>Füllwort</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-destructive/30" />
                <span>Zum Löschen markiert</span>
              </div>
            </div>
          </>
        )}
      </div>
    </Card>
  );
}
