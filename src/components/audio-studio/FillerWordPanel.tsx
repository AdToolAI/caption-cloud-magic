import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, Trash2, Play, Eye, EyeOff, Loader2, Check, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';

interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  type: 'normal' | 'filler' | 'pause';
}

interface FillerWordPanelProps {
  audioUrl: string;
  transcript: TranscriptWord[];
  onTranscriptChange: (transcript: TranscriptWord[]) => void;
}

const FILLER_WORDS = ['ähm', 'äh', 'also', 'ja', 'okay', 'halt', 'quasi', 'sozusagen', 'irgendwie', 'hmm', 'naja', 'eigentlich'];

export function FillerWordPanel({ audioUrl, transcript, onTranscriptChange }: FillerWordPanelProps) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showFillers, setShowFillers] = useState(true);
  const [pauseThreshold, setPauseThreshold] = useState(1.5);
  const [selectedFillers, setSelectedFillers] = useState<Set<number>>(new Set());

  // Analyze transcript for filler words and pauses
  const fillerAnalysis = useMemo(() => {
    const fillers: { word: TranscriptWord; index: number }[] = [];
    const pauses: { start: number; end: number; duration: number }[] = [];
    
    transcript.forEach((word, index) => {
      const cleanWord = word.word.toLowerCase().replace(/[.,!?]/g, '');
      if (FILLER_WORDS.includes(cleanWord) || word.type === 'filler') {
        fillers.push({ word, index });
      }
      
      // Check for long pauses between words
      if (index > 0) {
        const prevWord = transcript[index - 1];
        const pauseDuration = word.start - prevWord.end;
        if (pauseDuration > pauseThreshold) {
          pauses.push({
            start: prevWord.end,
            end: word.start,
            duration: pauseDuration
          });
        }
      }
    });

    return { fillers, pauses };
  }, [transcript, pauseThreshold]);

  const toggleFillerSelection = (index: number) => {
    const newSelected = new Set(selectedFillers);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedFillers(newSelected);
  };

  const selectAllFillers = () => {
    const allIndices = new Set(fillerAnalysis.fillers.map(f => f.index));
    setSelectedFillers(allIndices);
  };

  const removeSelectedFillers = () => {
    const newTranscript = transcript.filter((_, i) => !selectedFillers.has(i));
    onTranscriptChange(newTranscript);
    setSelectedFillers(new Set());
    toast.success(`${selectedFillers.size} Füllwörter entfernt`);
  };

  const autoRemoveAll = async () => {
    setIsAnalyzing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const fillerIndices = new Set(fillerAnalysis.fillers.map(f => f.index));
      const newTranscript = transcript.filter((_, i) => !fillerIndices.has(i));
      onTranscriptChange(newTranscript);
      
      toast.success(`${fillerIndices.size} Füllwörter automatisch entfernt`);
    } catch (error) {
      toast.error('Fehler beim Entfernen');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <Card className="backdrop-blur-xl bg-card/60 border-border/50">
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
              <Volume2 className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="font-semibold">Füllwörter & Pausen</h3>
              <p className="text-xs text-muted-foreground">Automatisch "ähms" und Pausen entfernen</p>
            </div>
          </div>

          <Button
            onClick={autoRemoveAll}
            disabled={isAnalyzing || fillerAnalysis.fillers.length === 0}
            className="bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-500/90 hover:to-orange-500/90"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Entferne...
              </>
            ) : (
              <>
                <Trash2 className="w-4 h-4 mr-2" />
                Alle entfernen
              </>
            )}
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
            <div className="text-2xl font-bold text-yellow-500">{fillerAnalysis.fillers.length}</div>
            <div className="text-xs text-muted-foreground">Füllwörter</div>
          </div>
          <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <div className="text-2xl font-bold text-orange-500">{fillerAnalysis.pauses.length}</div>
            <div className="text-xs text-muted-foreground">Lange Pausen</div>
          </div>
          <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="text-2xl font-bold text-green-500">
              {Math.round((fillerAnalysis.fillers.reduce((acc, f) => acc + (f.word.end - f.word.start), 0) + 
                fillerAnalysis.pauses.reduce((acc, p) => acc + p.duration, 0)) * 10) / 10}s
            </div>
            <div className="text-xs text-muted-foreground">Einsparung</div>
          </div>
        </div>
      </div>

      <div className="p-4">
        {/* Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="show-fillers"
                checked={showFillers}
                onCheckedChange={setShowFillers}
              />
              <Label htmlFor="show-fillers" className="text-sm">
                {showFillers ? <Eye className="w-4 h-4 inline mr-1" /> : <EyeOff className="w-4 h-4 inline mr-1" />}
                Füllwörter anzeigen
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Pausen-Schwelle</Label>
              <Slider
                value={[pauseThreshold]}
                onValueChange={([v]) => setPauseThreshold(v)}
                min={0.5}
                max={3}
                step={0.1}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground w-8">{pauseThreshold}s</span>
            </div>
          </div>

          <AnimatePresence>
            {selectedFillers.size > 0 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2"
              >
                <Button variant="outline" size="sm" onClick={() => setSelectedFillers(new Set())}>
                  Auswahl aufheben
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={removeSelectedFillers}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {selectedFillers.size} entfernen
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {transcript.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Kein Transcript vorhanden</h3>
            <p className="text-muted-foreground">
              Generiere zuerst ein Transcript im "Transcript"-Tab
            </p>
          </div>
        ) : fillerAnalysis.fillers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-500" />
            </div>
            <h3 className="text-lg font-semibold mb-2">Keine Füllwörter gefunden</h3>
            <p className="text-muted-foreground">
              Dein Audio ist bereits sauber!
            </p>
          </div>
        ) : (
          <>
            {/* Select All */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">
                {selectedFillers.size} von {fillerAnalysis.fillers.length} ausgewählt
              </span>
              <Button variant="ghost" size="sm" onClick={selectAllFillers}>
                Alle auswählen
              </Button>
            </div>

            {/* Filler Word List */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {fillerAnalysis.fillers.map(({ word, index }) => {
                  const isSelected = selectedFillers.has(index);
                  
                  return (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`
                        flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors
                        ${isSelected 
                          ? 'bg-destructive/10 border-destructive/30' 
                          : 'bg-muted/20 border-border/50 hover:bg-muted/30'
                        }
                      `}
                      onClick={() => toggleFillerSelection(index)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`
                          w-6 h-6 rounded-full flex items-center justify-center transition-colors
                          ${isSelected ? 'bg-destructive text-destructive-foreground' : 'bg-muted'}
                        `}>
                          {isSelected && <Check className="w-4 h-4" />}
                        </div>
                        <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                          {word.word}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatTime(word.start)} - {formatTime(word.end)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {Math.round((word.end - word.start) * 100) / 100}s
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-8 h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Play audio segment
                          }}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Long Pauses Section */}
                {fillerAnalysis.pauses.length > 0 && (
                  <>
                    <div className="pt-4 pb-2">
                      <Label className="text-xs text-muted-foreground">Lange Pausen (&gt;{pauseThreshold}s)</Label>
                    </div>
                    {fillerAnalysis.pauses.map((pause, i) => (
                      <div
                        key={`pause-${i}`}
                        className="flex items-center justify-between p-3 rounded-lg bg-orange-500/10 border border-orange-500/20"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-orange-500/20 flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-orange-500" />
                          </div>
                          <span className="text-sm">Pause</span>
                          <span className="text-xs text-muted-foreground">
                            {formatTime(pause.start)} - {formatTime(pause.end)}
                          </span>
                        </div>
                        <Badge variant="outline" className="border-orange-500/30 text-orange-400">
                          {Math.round(pause.duration * 10) / 10}s
                        </Badge>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </div>
    </Card>
  );
}
