import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Type, Sparkles, Mic, Loader2, Plus, X } from 'lucide-react';
import { SubtitleClip } from '@/types/timeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CapCutSidebarProps {
  videoDuration?: number;
  voiceOverUrl?: string;
  onCaptionsGenerated?: (captions: SubtitleClip[]) => void;
}

interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

const CAPTION_STYLES = [
  { id: 'standard', name: 'Standard', description: 'Weiß auf Schwarz' },
  { id: 'tiktok', name: 'TikTok', description: 'Bunt & animiert' },
  { id: 'subtitle', name: 'Untertitel', description: 'Klassisch' },
  { id: 'highlight', name: 'Highlight', description: 'Wort-Animation' },
];

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const CapCutSidebar: React.FC<CapCutSidebarProps> = ({
  videoDuration = 30,
  voiceOverUrl,
  onCaptionsGenerated,
}) => {
  // AI Captions State
  const [captionLanguage, setCaptionLanguage] = useState('de');
  const [captionStyle, setCaptionStyle] = useState('standard');
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [generatedCaptions, setGeneratedCaptions] = useState<Caption[]>([]);

  // Generate captions handler
  const handleGenerateCaptions = async () => {
    setIsGeneratingCaptions(true);
    
    try {
      if (voiceOverUrl) {
        // AI transcription from voiceover using generate-subtitles
        const { data, error } = await supabase.functions.invoke('generate-subtitles', {
          body: {
            audioUrl: voiceOverUrl,
            language: captionLanguage,
          },
        });

        if (error) throw error;

        // generate-subtitles returns { subtitles: [...], fullText: "..." }
        const transcribedCaptions: SubtitleClip[] = (data?.subtitles || []).map((seg: any, i: number) => ({
          id: `caption-${Date.now()}-${i}`,
          startTime: seg.startTime || i * 3,
          endTime: seg.endTime || (i + 1) * 3,
          text: seg.text || '',
          style: captionStyle as SubtitleClip['style'],
        }));

        setGeneratedCaptions(transcribedCaptions.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.endTime, text: c.text })));
        onCaptionsGenerated?.(transcribedCaptions);
        toast.success(`${transcribedCaptions.length} Untertitel aus Voiceover erstellt`);
      } else {
        // Create empty placeholder captions
        const segmentCount = Math.max(3, Math.floor(videoDuration / 5));
        const segmentDuration = videoDuration / segmentCount;
        
        const placeholderCaptions: SubtitleClip[] = Array.from({ length: segmentCount }, (_, i) =>
          ({
            id: `caption-${Date.now()}-${i}`,
            startTime: i * segmentDuration,
            endTime: Math.min((i + 1) * segmentDuration, videoDuration),
            text: '',
            style: captionStyle as SubtitleClip['style'],
          })
        );
        
        setGeneratedCaptions(placeholderCaptions.map(c => ({ id: c.id, startTime: c.startTime, endTime: c.endTime, text: c.text })));
        onCaptionsGenerated?.(placeholderCaptions);
        toast.success(`${placeholderCaptions.length} leere Untertitel-Felder erstellt`);
      }
    } catch (error) {
      console.error('Caption generation error:', error);
      toast.error('Fehler bei der Untertitel-Generierung');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  return (
    <div className="w-64 flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e] h-full">
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-[#00d4ff]" />
            <span className="text-sm font-medium text-white">Untertitel</span>
          </div>

          {/* Language Selection */}
          <div className="space-y-2">
            <label className="text-xs text-white/70">Sprache</label>
            <Select value={captionLanguage} onValueChange={setCaptionLanguage}>
              <SelectTrigger className="w-full h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white">
                <SelectValue placeholder="Sprache wählen" />
              </SelectTrigger>
              <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                <SelectItem value="de" className="text-white">🇩🇪 Deutsch</SelectItem>
                <SelectItem value="en" className="text-white">🇬🇧 Englisch</SelectItem>
                <SelectItem value="es" className="text-white">🇪🇸 Spanisch</SelectItem>
                <SelectItem value="fr" className="text-white">🇫🇷 Französisch</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Caption Style */}
          <div className="space-y-2">
            <label className="text-xs text-white/70">Caption Style</label>
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_STYLES.map(style => (
                <button
                  key={style.id}
                  onClick={() => setCaptionStyle(style.id)}
                  className={cn(
                    "p-2 rounded text-left transition-all",
                    captionStyle === style.id 
                      ? "bg-[#00d4ff]/20 border border-[#00d4ff] text-white"
                      : "bg-[#2a2a2a] border border-[#3a3a3a] text-white/70 hover:bg-[#3a3a3a]"
                  )}
                >
                  <p className="text-xs font-medium">{style.name}</p>
                  <p className="text-[10px] text-white/40">{style.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Mode Explanation */}
          <div className="p-2.5 rounded bg-[#2a2a2a]/50 border border-[#3a3a3a]">
            {voiceOverUrl ? (
              <p className="text-[10px] text-emerald-400/80 flex items-center gap-1.5">
                <Mic className="h-3 w-3" />
                Voiceover erkannt - KI-Transkription wird verwendet
              </p>
            ) : (
              <p className="text-[10px] text-white/50">
                Kein Voiceover - Es werden leere Untertitel-Felder erstellt, die du in der Timeline bearbeiten kannst
              </p>
            )}
          </div>

          {/* Generate Button */}
          <Button
            onClick={handleGenerateCaptions}
            disabled={isGeneratingCaptions}
            className="w-full bg-[#00d4ff] hover:bg-[#00b8e0] text-black"
          >
            {isGeneratingCaptions ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generiere...</>
            ) : voiceOverUrl ? (
              <><Sparkles className="h-4 w-4 mr-2" /> Aus Voiceover transkribieren</>
            ) : (
              <><Type className="h-4 w-4 mr-2" /> Leere Untertitel erstellen</>
            )}
          </Button>

          {/* Add Single Subtitle Button */}
          <Button
            variant="outline"
            onClick={() => {
              const newSubtitle: SubtitleClip = {
                id: `subtitle-${Date.now()}`,
                startTime: 0,
                endTime: 3,
                text: '',
                style: captionStyle as SubtitleClip['style'],
              };
              onCaptionsGenerated?.([...(generatedCaptions.map(c => ({
                id: c.id,
                startTime: c.startTime,
                endTime: c.endTime,
                text: c.text,
                style: captionStyle as SubtitleClip['style'],
              }))), newSubtitle]);
              toast.success('Neuer Untertitel hinzugefügt');
            }}
            className="w-full border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a] text-white/70 hover:text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Neuen Untertitel hinzufügen
          </Button>

          {/* Generated Captions Preview */}
          {generatedCaptions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-medium text-white/70">
                  Vorschau ({generatedCaptions.length})
                </h4>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setGeneratedCaptions([])}
                  className="h-5 w-5 p-0 hover:bg-red-500/20"
                >
                  <X className="h-3 w-3 text-red-400" />
                </Button>
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {generatedCaptions.map((caption) => (
                  <div key={caption.id} className="p-2 bg-[#2a2a2a] rounded text-xs">
                    <span className="text-white/40">
                      {formatDuration(caption.startTime)} - {formatDuration(caption.endTime)}
                    </span>
                    <p className="text-white mt-1">{caption.text || '(leer)'}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
