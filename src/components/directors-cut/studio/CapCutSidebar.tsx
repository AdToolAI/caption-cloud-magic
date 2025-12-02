import React, { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Type, Sparkles, Mic, Loader2, Plus, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Music, Upload, Settings, FolderUp, FileVideo, FileAudio, Image } from 'lucide-react';
import { SubtitleClip, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '@/hooks/useWebAudioEffects';

interface CapCutSidebarProps {
  videoDuration?: number;
  voiceOverUrl?: string;
  onCaptionsGenerated?: (captions: SubtitleClip[]) => void;
  defaultSubtitleStyle?: Partial<SubtitleClip>;
  onDefaultStyleChange?: (style: Partial<SubtitleClip>) => void;
  existingCaptions?: SubtitleClip[];
  onApplyStyleToAll?: (style: Partial<SubtitleClip>) => void;
  audioEffects?: AudioEffects;
  onAudioEffectsChange?: (effects: AudioEffects) => void;
  selectedSubtitleId?: string | null;
  onSubtitleTextUpdate?: (clipId: string, text: string) => void;
  onSubtitleSelect?: (clipId: string | null) => void;
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

const FONT_OPTIONS = [
  { value: 'Inter', label: 'Inter' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Impact', label: 'Impact' },
  { value: 'Courier New', label: 'Courier' },
  { value: 'Comic Sans MS', label: 'Comic Sans' },
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
  defaultSubtitleStyle = DEFAULT_SUBTITLE_STYLE,
  onDefaultStyleChange,
  existingCaptions = [],
  onApplyStyleToAll,
  audioEffects = DEFAULT_AUDIO_EFFECTS,
  onAudioEffectsChange,
  selectedSubtitleId,
  onSubtitleTextUpdate,
  onSubtitleSelect,
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('subtitle');
  
  // AI Captions State
  const [captionLanguage, setCaptionLanguage] = useState('de');
  const [captionStyle, setCaptionStyle] = useState('standard');
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [generatedCaptions, setGeneratedCaptions] = useState<Caption[]>([]);

  // Media upload state
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);

  // Settings state
  const [autoSave, setAutoSave] = useState(true);
  const [timelineZoom, setTimelineZoom] = useState(50);

  // Local style state (synced with parent via onDefaultStyleChange)
  const [localStyle, setLocalStyle] = useState<Partial<SubtitleClip>>({
    position: defaultSubtitleStyle.position || 'bottom',
    fontSize: defaultSubtitleStyle.fontSize || 'medium',
    color: defaultSubtitleStyle.color || '#FFFFFF',
    backgroundColor: defaultSubtitleStyle.backgroundColor || 'rgba(0,0,0,0.7)',
    fontFamily: defaultSubtitleStyle.fontFamily || 'Inter',
    maxLines: defaultSubtitleStyle.maxLines || 2,
    textStroke: defaultSubtitleStyle.textStroke || false,
    textStrokeColor: defaultSubtitleStyle.textStrokeColor || '#000000',
    textStrokeWidth: defaultSubtitleStyle.textStrokeWidth || 2,
  });

  // Get selected subtitle text
  const selectedSubtitleText = useMemo(() => {
    if (!selectedSubtitleId) return '';
    const subtitle = existingCaptions.find(c => c.id === selectedSubtitleId);
    return subtitle?.text || '';
  }, [selectedSubtitleId, existingCaptions]);

  // Auto-apply styles to all existing subtitles when changed
  const updateStyle = (updates: Partial<SubtitleClip>) => {
    const newStyle = { ...localStyle, ...updates };
    setLocalStyle(newStyle);
    onDefaultStyleChange?.(newStyle);
    // Auto-apply to all existing subtitles
    if (existingCaptions.length > 0) {
      onApplyStyleToAll?.(newStyle);
    }
  };

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
          ...localStyle,
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
            ...localStyle,
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

  // File upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setUploadedFiles(prev => [...prev, ...files]);
    toast.success(`${files.length} Datei(en) hochgeladen`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setUploadedFiles(prev => [...prev, ...files]);
    toast.success(`${files.length} Datei(en) hochgeladen`);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('video/')) return FileVideo;
    if (file.type.startsWith('audio/')) return FileAudio;
    if (file.type.startsWith('image/')) return Image;
    return FolderUp;
  };

  return (
    <div className="w-72 flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e] h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full">
        {/* Tab Icons */}
        <TabsList className="grid grid-cols-4 gap-1 p-2 bg-[#1a1a1a] border-b border-[#2a2a2a] h-auto rounded-none">
          <TabsTrigger 
            value="media" 
            className="flex flex-col items-center gap-0.5 py-2 rounded-lg data-[state=active]:bg-[#00d4ff]/20 data-[state=active]:text-[#00d4ff] text-white/50 hover:text-white/80 hover:bg-white/5"
          >
            <FolderUp className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="subtitle" 
            className="flex flex-col items-center gap-0.5 py-2 rounded-lg data-[state=active]:bg-[#00d4ff]/20 data-[state=active]:text-[#00d4ff] text-white/50 hover:text-white/80 hover:bg-white/5"
          >
            <Type className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="audio-fx" 
            className="flex flex-col items-center gap-0.5 py-2 rounded-lg data-[state=active]:bg-pink-500/20 data-[state=active]:text-pink-400 text-white/50 hover:text-white/80 hover:bg-white/5"
          >
            <Music className="h-4 w-4" />
          </TabsTrigger>
          <TabsTrigger 
            value="settings" 
            className="flex flex-col items-center gap-0.5 py-2 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/50 hover:text-white/80 hover:bg-white/5"
          >
            <Settings className="h-4 w-4" />
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* TAB 1: Media Upload */}
          <TabsContent value="media" className="p-3 space-y-4 mt-0">
            <div className="flex items-center gap-2">
              <FolderUp className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">Medien hochladen</span>
            </div>

            {/* Dropzone */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-[#3a3a3a] rounded-lg p-6 text-center hover:border-[#00d4ff] transition-colors cursor-pointer"
            >
              <input 
                type="file" 
                id="media-upload" 
                className="hidden" 
                multiple 
                accept="video/*,audio/*,image/*"
                onChange={handleFileUpload}
              />
              <label htmlFor="media-upload" className="cursor-pointer">
                <Upload className="h-8 w-8 mx-auto text-white/40 mb-2" />
                <p className="text-xs text-white/50">
                  Video, Audio oder Bilder hierher ziehen
                </p>
                <p className="text-[10px] text-white/30 mt-1">
                  oder klicken zum Auswählen
                </p>
              </label>
            </div>

            {/* Uploaded Files List */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Hochgeladene Dateien ({uploadedFiles.length})</label>
              {uploadedFiles.length === 0 ? (
                <div className="text-xs text-white/40 p-3 bg-[#2a2a2a] rounded">
                  Noch keine Dateien hochgeladen
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedFiles.map((file, index) => {
                    const Icon = getFileIcon(file);
                    return (
                      <div key={index} className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded text-xs">
                        <Icon className="h-4 w-4 text-[#00d4ff]" />
                        <span className="flex-1 truncate text-white/80">{file.name}</span>
                        <button 
                          onClick={() => removeFile(index)}
                          className="text-white/40 hover:text-red-400 transition-colors"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/40">
              Hochgeladene Dateien können dann Szenen zugeordnet oder als neue Szenen hinzugefügt werden.
            </p>
          </TabsContent>

          {/* TAB 2: Subtitles (COMPLETE) */}
          <TabsContent value="subtitle" className="p-3 space-y-4 mt-0">
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

            {/* Selected Subtitle Text Edit */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">
                Untertitel-Text {selectedSubtitleId && <span className="text-[#00d4ff]">(ausgewählt)</span>}
              </label>
              <Textarea
                value={selectedSubtitleText}
                onChange={(e) => {
                  if (selectedSubtitleId) {
                    onSubtitleTextUpdate?.(selectedSubtitleId, e.target.value);
                  }
                }}
                placeholder={selectedSubtitleId ? "Text eingeben..." : "Klicke auf einen Untertitel in der Timeline oder Liste"}
                disabled={!selectedSubtitleId}
                className="bg-[#2a2a2a] border-[#3a3a3a] text-white placeholder:text-white/40 resize-none text-sm min-h-[60px]"
                rows={2}
              />
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

            {/* Divider */}
            <div className="border-t border-[#3a3a3a] pt-4">
              <h4 className="text-xs font-medium text-white/70 mb-3">Styling-Optionen</h4>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Position</label>
              <div className="flex gap-1">
                {[
                  { value: 'top', icon: AlignVerticalJustifyStart, label: 'Oben' },
                  { value: 'center', icon: AlignVerticalJustifyCenter, label: 'Mitte' },
                  { value: 'bottom', icon: AlignVerticalJustifyEnd, label: 'Unten' },
                ].map(({ value, icon: Icon, label }) => (
                  <button
                    key={value}
                    onClick={() => updateStyle({ position: value as 'top' | 'center' | 'bottom' })}
                    className={cn(
                      "flex-1 flex flex-col items-center gap-1 p-2 rounded text-xs transition-colors",
                      localStyle.position === value 
                        ? "bg-[#00d4ff]/20 border border-[#00d4ff] text-white" 
                        : "bg-[#2a2a2a] border border-[#3a3a3a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Schriftgröße</label>
              <div className="flex gap-1">
                {['small', 'medium', 'large', 'xl'].map((size) => (
                  <button
                    key={size}
                    onClick={() => updateStyle({ fontSize: size as SubtitleClip['fontSize'] })}
                    className={cn(
                      "flex-1 px-2 py-1.5 rounded text-xs transition-colors",
                      localStyle.fontSize === size 
                        ? "bg-[#00d4ff]/20 border border-[#00d4ff] text-white" 
                        : "bg-[#2a2a2a] border border-[#3a3a3a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {size === 'small' ? 'S' : size === 'medium' ? 'M' : size === 'large' ? 'L' : 'XL'}
                  </button>
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs text-white/70">Textfarbe</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={localStyle.color || '#FFFFFF'}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                  />
                  <span className="text-[10px] text-white/40">{localStyle.color}</span>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs text-white/70">Hintergrund</label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={localStyle.backgroundColor?.replace(/rgba?\([^)]+\)/, '#000000') || '#000000'}
                    onChange={(e) => updateStyle({ backgroundColor: `${e.target.value}cc` })}
                    className="w-8 h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                  />
                </div>
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Schriftart</label>
              <Select value={localStyle.fontFamily || 'Inter'} onValueChange={(v) => updateStyle({ fontFamily: v })}>
                <SelectTrigger className="w-full h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                  {FONT_OPTIONS.map(font => (
                    <SelectItem key={font.value} value={font.value} className="text-white" style={{ fontFamily: font.value }}>
                      {font.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Max Lines */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Max. Zeilen</label>
              <div className="flex gap-2">
                {[2, 3].map((lines) => (
                  <button
                    key={lines}
                    onClick={() => updateStyle({ maxLines: lines as 2 | 3 })}
                    className={cn(
                      "flex-1 px-3 py-1.5 rounded text-xs transition-colors",
                      localStyle.maxLines === lines 
                        ? "bg-[#00d4ff]/20 border border-[#00d4ff] text-white" 
                        : "bg-[#2a2a2a] border border-[#3a3a3a] text-white/60 hover:bg-[#3a3a3a]"
                    )}
                  >
                    {lines} Zeilen
                  </button>
                ))}
              </div>
            </div>

            {/* Text Stroke / Outline */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Umrandung</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateStyle({ textStroke: !localStyle.textStroke })}
                  className={cn(
                    "px-3 py-1.5 rounded text-xs transition-colors",
                    localStyle.textStroke 
                      ? "bg-[#00d4ff]/20 border border-[#00d4ff] text-white" 
                      : "bg-[#2a2a2a] border border-[#3a3a3a] text-white/60 hover:bg-[#3a3a3a]"
                  )}
                >
                  {localStyle.textStroke ? 'Ein' : 'Aus'}
                </button>
                {localStyle.textStroke && (
                  <>
                    <input 
                      type="color" 
                      value={localStyle.textStrokeColor || '#000000'}
                      onChange={(e) => updateStyle({ textStrokeColor: e.target.value })}
                      className="w-8 h-8 rounded cursor-pointer bg-[#2a2a2a] border border-[#3a3a3a]"
                    />
                    <input 
                      type="number" 
                      min={1}
                      max={5}
                      value={localStyle.textStrokeWidth || 2}
                      onChange={(e) => updateStyle({ textStrokeWidth: Number(e.target.value) })}
                      className="w-12 h-8 rounded bg-[#2a2a2a] border border-[#3a3a3a] text-white text-xs text-center"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-[#3a3a3a] pt-4" />

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
                // Calculate start time after existing captions
                const lastEnd = existingCaptions.length > 0 
                  ? Math.max(...existingCaptions.map(c => c.endTime))
                  : 0;
                
                const newSubtitle: SubtitleClip = {
                  id: `subtitle-${Date.now()}`,
                  startTime: lastEnd,
                  endTime: Math.min(lastEnd + 3, videoDuration),
                  text: '',
                  style: captionStyle as SubtitleClip['style'],
                  ...localStyle,
                };
                // Add to existing captions instead of overwriting
                onCaptionsGenerated?.([...existingCaptions, newSubtitle]);
                toast.success('Neuer Untertitel hinzugefügt');
              }}
              className="w-full border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a] text-white/70 hover:text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Neuen Untertitel hinzufügen
            </Button>

            {/* Generated Captions Preview */}
            {existingCaptions.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-medium text-white/70">
                    Untertitel ({existingCaptions.length})
                  </h4>
                </div>
                <ScrollArea className="max-h-48 overflow-x-auto">
                  <div className="space-y-1.5 pr-2 min-w-[260px]">
                    {existingCaptions.map((caption) => (
                      <div 
                        key={caption.id} 
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          onSubtitleSelect?.(caption.id);
                        }}
                        onPointerDown={(e) => e.stopPropagation()}
                        className={cn(
                          "p-2 rounded text-xs whitespace-nowrap cursor-pointer transition-colors select-none",
                          selectedSubtitleId === caption.id 
                            ? "bg-[#00d4ff]/20 border border-[#00d4ff]" 
                            : "bg-[#2a2a2a] hover:bg-[#3a3a3a]"
                        )}
                      >
                        <span className="text-white/40">
                          {formatDuration(caption.startTime)} - {formatDuration(caption.endTime)}
                        </span>
                        <p className="text-white/80 mt-0.5 line-clamp-2">
                          {caption.text || '(Klicke zum Bearbeiten)'}
                        </p>
                      </div>
                    ))}
                  </div>
                  <ScrollBar orientation="vertical" />
                  <ScrollBar orientation="horizontal" />
                </ScrollArea>
              </div>
            )}
          </TabsContent>

          {/* TAB 3: Audio Effects AI */}
          <TabsContent value="audio-fx" className="p-3 space-y-4 mt-0">
            <div className="flex items-center gap-2">
              <Music className="h-4 w-4 text-pink-400" />
              <span className="text-sm font-medium text-white">Audio Effects AI</span>
            </div>
            
            {/* Reverb */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Reverb</label>
                <span className="text-xs text-white/40">{audioEffects.reverb}%</span>
              </div>
              <Slider 
                value={[audioEffects.reverb]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, reverb: v})} 
                max={100} 
                step={1}
                className="cursor-pointer"
              />
            </div>
            
            {/* Echo */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Echo</label>
                <span className="text-xs text-white/40">{audioEffects.echo}%</span>
              </div>
              <Slider 
                value={[audioEffects.echo]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, echo: v})} 
                max={100}
                step={1}
                className="cursor-pointer"
              />
            </div>
            
            {/* Bass */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Bass</label>
                <span className="text-xs text-white/40">{audioEffects.bass}%</span>
              </div>
              <Slider 
                value={[audioEffects.bass]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, bass: v})} 
                max={100}
                step={1}
                className="cursor-pointer"
              />
            </div>
            
            {/* Treble */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Treble</label>
                <span className="text-xs text-white/40">{audioEffects.treble}%</span>
              </div>
              <Slider 
                value={[audioEffects.treble]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, treble: v})} 
                max={100}
                step={1}
                className="cursor-pointer"
              />
            </div>

            <div className="border-t border-[#3a3a3a] pt-4">
              <p className="text-[10px] text-white/40">
                Diese Effekte werden auf alle Audio-Spuren angewendet und können beim Export beibehalten werden.
              </p>
            </div>
          </TabsContent>

          {/* TAB 4: Settings */}
          <TabsContent value="settings" className="p-3 space-y-4 mt-0">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-white/70" />
              <span className="text-sm font-medium text-white">Einstellungen</span>
            </div>

            {/* Timeline Zoom */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs text-white/70">Timeline Zoom</label>
                <span className="text-xs text-white/40">{timelineZoom}%</span>
              </div>
              <Slider 
                value={[timelineZoom]} 
                onValueChange={([v]) => setTimelineZoom(v)}
                min={25}
                max={200}
                step={5}
                className="cursor-pointer"
              />
            </div>

            {/* Auto-Save Toggle */}
            <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded">
              <div>
                <span className="text-xs text-white/70">Auto-Save</span>
                <p className="text-[10px] text-white/40">Automatisch alle 30 Sekunden speichern</p>
              </div>
              <Switch 
                checked={autoSave} 
                onCheckedChange={setAutoSave}
              />
            </div>

            {/* Snap to Grid */}
            <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded">
              <div>
                <span className="text-xs text-white/70">Snap to Grid</span>
                <p className="text-[10px] text-white/40">Elemente am Raster ausrichten</p>
              </div>
              <Switch defaultChecked />
            </div>

            {/* Show Waveforms */}
            <div className="flex items-center justify-between p-3 bg-[#2a2a2a] rounded">
              <div>
                <span className="text-xs text-white/70">Waveforms anzeigen</span>
                <p className="text-[10px] text-white/40">Audio-Wellenformen in Timeline</p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="border-t border-[#3a3a3a] pt-4">
              <p className="text-[10px] text-white/40">
                Weitere Einstellungen werden in Zukunft hinzugefügt.
              </p>
            </div>
          </TabsContent>

          <ScrollBar orientation="vertical" />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>
    </div>
  );
};
