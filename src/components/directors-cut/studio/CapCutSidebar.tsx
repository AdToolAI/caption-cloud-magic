import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Type, Sparkles, Mic, Loader2, Plus, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Music, Upload, Settings, FolderUp, FileVideo, FileAudio, Image, Search, Play, Pause, GripVertical, BarChart3, Zap, Keyboard, RotateCcw, Download, SlidersHorizontal } from 'lucide-react';
import { SubtitleClip, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '@/hooks/useWebAudioEffects';

interface JamendoTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  audioUrl: string;
  imageUrl: string;
}

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
  onAddVideoAsScene?: (file: File) => void;
  onMusicDrop?: (track: JamendoTrack) => void;
  sceneCount?: number;
  captionCount?: number;
  onExportClick?: () => void;
  onResetClick?: () => void;
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
  onAddVideoAsScene,
  onMusicDrop,
  sceneCount = 0,
  captionCount = 0,
  onExportClick,
  onResetClick,
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState('subtitle');
  
  // AI Captions State
  const [captionLanguage, setCaptionLanguage] = useState('de');
  const [captionStyle, setCaptionStyle] = useState('standard');
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [generatedCaptions, setGeneratedCaptions] = useState<Caption[]>([]);

  // Media upload state - separate for video and audio
  const [uploadedVideoFiles, setUploadedVideoFiles] = useState<File[]>([]);
  const [uploadedAudioFiles, setUploadedAudioFiles] = useState<File[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

  // Settings state
  const [autoSave, setAutoSave] = useState(true);
  const [timelineZoom, setTimelineZoom] = useState(50);

  // Jamendo Music Search state
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [musicSearchResults, setMusicSearchResults] = useState<JamendoTrack[]>([]);
  const [isSearchingMusic, setIsSearchingMusic] = useState(false);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const audioPreviewRef = useRef<HTMLAudioElement | null>(null);

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

  // Video file upload handler (Media Tab)
  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'));
    if (files.length > 0) {
      setUploadedVideoFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} Video(s) hochgeladen`);
    }
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (files.length > 0) {
      setUploadedVideoFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} Video(s) hochgeladen`);
    } else {
      toast.error('Bitte nur Video-Dateien hochladen');
    }
  };

  const removeVideoFile = (index: number) => {
    setUploadedVideoFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Audio file upload handler (Audio FX Tab)
  const handleAudioFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('audio/'));
    if (files.length > 0) {
      setUploadedAudioFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} Audio-Datei(en) hochgeladen`);
    }
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (files.length > 0) {
      setUploadedAudioFiles(prev => [...prev, ...files]);
      toast.success(`${files.length} Audio-Datei(en) hochgeladen`);
    } else {
      toast.error('Bitte nur Audio-Dateien hochladen');
    }
  };

  const removeAudioFile = (index: number) => {
    setUploadedAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const addAudioToTimeline = async (file: File) => {
    const url = URL.createObjectURL(file);
    // Get actual duration
    const audio = new Audio(url);
    audio.addEventListener('loadedmetadata', () => {
      onMusicDrop?.({
        id: `upload-${Date.now()}`,
        name: file.name,
        artist: 'Hochgeladen',
        duration: audio.duration || 30,
        audioUrl: url,
        imageUrl: '',
      });
      toast.success(`${file.name} zur Timeline hinzugefügt`);
    });
    audio.addEventListener('error', () => {
      // Fallback if metadata can't be loaded
      onMusicDrop?.({
        id: `upload-${Date.now()}`,
        name: file.name,
        artist: 'Hochgeladen',
        duration: 30,
        audioUrl: url,
        imageUrl: '',
      });
      toast.success(`${file.name} zur Timeline hinzugefügt`);
    });
  };

  // Jamendo Music Search
  const handleMusicSearch = async () => {
    if (!musicSearchQuery.trim() && !selectedMood && !selectedGenre) {
      toast.error('Bitte Suchbegriff oder Filter eingeben');
      return;
    }
    
    setIsSearchingMusic(true);
    try {
      const { data, error } = await supabase.functions.invoke('search-stock-music', {
        body: {
          query: musicSearchQuery || undefined,
          mood: selectedMood || undefined,
          genre: selectedGenre || undefined,
          limit: 10,
        },
      });

      if (error) throw error;

      const tracks: JamendoTrack[] = (data?.results || []).map((track: any) => ({
        id: track.id,
        name: track.title || track.name || 'Unknown Track',
        artist: track.artist || track.artist_name || 'Unknown Artist',
        duration: track.duration || 120,
        audioUrl: track.url || track.preview_url || track.audio,
        imageUrl: track.thumbnail || track.image || '',
      }));

      setMusicSearchResults(tracks);
      if (tracks.length === 0) {
        toast.info('Keine Musik gefunden');
      }
    } catch (error) {
      console.error('Music search error:', error);
      toast.error('Fehler bei der Musiksuche');
    } finally {
      setIsSearchingMusic(false);
    }
  };

  const toggleMusicPreview = (track: JamendoTrack) => {
    if (playingTrackId === track.id) {
      audioPreviewRef.current?.pause();
      setPlayingTrackId(null);
    } else {
      if (audioPreviewRef.current) {
        audioPreviewRef.current.pause();
      }
      audioPreviewRef.current = new Audio(track.audioUrl);
      audioPreviewRef.current.play().catch(console.error);
      setPlayingTrackId(track.id);
      audioPreviewRef.current.onended = () => setPlayingTrackId(null);
    }
  };

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      audioPreviewRef.current?.pause();
    };
  }, []);

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
          {/* TAB 1: Video Upload (nur Videos) */}
          <TabsContent value="media" className="p-3 space-y-4 mt-0">
            <div className="flex items-center gap-2">
              <FileVideo className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">Video hochladen</span>
            </div>

            {/* Video-Only Dropzone */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleVideoDrop}
              onClick={() => videoInputRef.current?.click()}
              className="border-2 border-dashed border-[#3a3a3a] rounded-lg p-6 text-center hover:border-[#00d4ff]/50 transition-colors cursor-pointer"
            >
              <input 
                ref={videoInputRef}
                type="file" 
                className="hidden" 
                multiple 
                accept="video/*"
                onChange={handleVideoFileSelect}
              />
              <FileVideo className="h-8 w-8 mx-auto text-white/40 mb-2" />
              <p className="text-xs text-white/50">
                Video hierher ziehen
              </p>
              <p className="text-[10px] text-white/30 mt-1">
                MP4, MOV, WebM (max. 500MB)
              </p>
            </div>

            {/* Uploaded Video Files List */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">Hochgeladene Videos ({uploadedVideoFiles.length})</label>
              {uploadedVideoFiles.length === 0 ? (
                <div className="text-xs text-white/40 p-3 bg-[#2a2a2a] rounded">
                  Noch keine Videos hochgeladen
                </div>
              ) : (
                <div className="space-y-2">
                  {uploadedVideoFiles.map((file, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded text-xs group">
                      <FileVideo className="h-4 w-4 text-[#00d4ff]" />
                      <span className="flex-1 truncate text-white/80">{file.name}</span>
                      {onAddVideoAsScene && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 text-[#00d4ff]"
                          onClick={() => onAddVideoAsScene(file)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Szene
                        </Button>
                      )}
                      <button 
                        onClick={() => removeVideoFile(index)}
                        className="text-white/40 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <p className="text-[10px] text-white/40">
              Videos können als neue Szenen zur Timeline hinzugefügt werden.
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
            {/* Audio Upload Section */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-pink-400" />
                <span className="text-sm font-medium text-white">Audio hochladen</span>
              </div>

              {/* Audio Dropzone */}
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleAudioDrop}
                onClick={() => audioInputRef.current?.click()}
                className="border-2 border-dashed border-[#3a3a3a] rounded-lg p-4 text-center hover:border-pink-500/50 transition-colors cursor-pointer"
              >
                <input 
                  ref={audioInputRef}
                  type="file" 
                  className="hidden" 
                  multiple 
                  accept="audio/*"
                  onChange={handleAudioFileSelect}
                />
                <FileAudio className="h-6 w-6 mx-auto text-white/40 mb-2" />
                <p className="text-xs text-white/50">Voiceover oder Musik hierher ziehen</p>
                <p className="text-[10px] text-white/30 mt-1">MP3, WAV, M4A (max. 50MB)</p>
              </div>

              {/* Uploaded Audio Files */}
              {uploadedAudioFiles.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs text-white/70">Hochgeladene Audio ({uploadedAudioFiles.length})</label>
                  {uploadedAudioFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded group">
                      <FileAudio className="h-4 w-4 text-pink-400" />
                      <span className="text-xs text-white/80 flex-1 truncate">{file.name}</span>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        className="h-6 px-2 text-[10px] bg-pink-500/10 hover:bg-pink-500/20 text-pink-400"
                        onClick={() => addAudioToTimeline(file)}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Timeline
                      </Button>
                      <button 
                        onClick={() => removeAudioFile(i)}
                        className="text-white/40 hover:text-red-400 transition-colors"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-[#3a3a3a]" />

            {/* Jamendo Music Search */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Music className="h-4 w-4 text-pink-400" />
                <span className="text-sm font-medium text-white">Musik-Bibliothek</span>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Musik suchen..."
                  value={musicSearchQuery}
                  onChange={(e) => setMusicSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleMusicSearch()}
                  className="bg-[#2a2a2a] border-[#3a3a3a] h-8 text-xs text-white"
                />
                <Button 
                  size="sm" 
                  onClick={handleMusicSearch}
                  disabled={isSearchingMusic}
                  className="h-8 px-2 bg-pink-500/20 hover:bg-pink-500/30 text-pink-400"
                >
                  {isSearchingMusic ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                </Button>
              </div>

              {/* Mood/Genre Filters */}
              <div className="grid grid-cols-2 gap-2">
                <Select value={selectedMood} onValueChange={setSelectedMood}>
                  <SelectTrigger className="h-7 text-[10px] bg-[#2a2a2a] border-[#3a3a3a] text-white">
                    <SelectValue placeholder="Stimmung" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                    <SelectItem value="happy" className="text-white text-xs">Happy</SelectItem>
                    <SelectItem value="energetic" className="text-white text-xs">Energetic</SelectItem>
                    <SelectItem value="calm" className="text-white text-xs">Calm</SelectItem>
                    <SelectItem value="dramatic" className="text-white text-xs">Dramatic</SelectItem>
                    <SelectItem value="sad" className="text-white text-xs">Sad</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedGenre} onValueChange={setSelectedGenre}>
                  <SelectTrigger className="h-7 text-[10px] bg-[#2a2a2a] border-[#3a3a3a] text-white">
                    <SelectValue placeholder="Genre" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-[#3a3a3a]">
                    <SelectItem value="pop" className="text-white text-xs">Pop</SelectItem>
                    <SelectItem value="electronic" className="text-white text-xs">Electronic</SelectItem>
                    <SelectItem value="rock" className="text-white text-xs">Rock</SelectItem>
                    <SelectItem value="hiphop" className="text-white text-xs">Hip-Hop</SelectItem>
                    <SelectItem value="ambient" className="text-white text-xs">Ambient</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Search Results */}
              {musicSearchResults.length > 0 && (
                <ScrollArea className="h-32">
                  <div className="space-y-1">
                    {musicSearchResults.map(track => (
                      <div
                        key={track.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/json', JSON.stringify({
                            type: 'jamendo-track',
                            track,
                          }));
                        }}
                        className="flex items-center gap-2 p-2 bg-[#2a2a2a] rounded hover:bg-[#3a3a3a] cursor-grab group"
                      >
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => toggleMusicPreview(track)}
                        >
                          {playingTrackId === track.id ? (
                            <Pause className="h-3 w-3 text-pink-400" />
                          ) : (
                            <Play className="h-3 w-3 text-white/60" />
                          )}
                        </Button>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-white truncate">{track.name}</div>
                          <div className="text-[10px] text-white/40 truncate">{track.artist} · {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}</div>
                        </div>
                        <GripVertical className="h-3 w-3 text-white/30 opacity-0 group-hover:opacity-100" />
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              <p className="text-[10px] text-white/40">
                Ziehe Musik in die Timeline, um sie hinzuzufügen
              </p>
            </div>

            {/* Divider */}
            <div className="border-t border-[#3a3a3a] pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-sm font-medium text-white">Audio Effects AI</span>
              </div>
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

            {/* Pitch */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Pitch</label>
                <span className="text-xs text-white/40">{audioEffects.pitch > 0 ? '+' : ''}{audioEffects.pitch}</span>
              </div>
              <Slider 
                value={[audioEffects.pitch + 12]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, pitch: v - 12})} 
                min={0}
                max={24}
                step={1}
                className="cursor-pointer"
              />
            </div>
            
            {/* Bass */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Bass</label>
                <span className="text-xs text-white/40">{audioEffects.bass > 0 ? '+' : ''}{audioEffects.bass} dB</span>
              </div>
              <Slider 
                value={[audioEffects.bass + 12]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, bass: v - 12})} 
                min={0}
                max={24}
                step={1}
                className="cursor-pointer"
              />
            </div>

            {/* Mid */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Mid</label>
                <span className="text-xs text-white/40">{audioEffects.mid > 0 ? '+' : ''}{audioEffects.mid} dB</span>
              </div>
              <Slider 
                value={[audioEffects.mid + 12]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, mid: v - 12})} 
                min={0}
                max={24}
                step={1}
                className="cursor-pointer"
              />
            </div>
            
            {/* Treble */}
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <label className="text-xs text-white/50">Treble</label>
                <span className="text-xs text-white/40">{audioEffects.treble > 0 ? '+' : ''}{audioEffects.treble} dB</span>
              </div>
              <Slider 
                value={[audioEffects.treble + 12]} 
                onValueChange={([v]) => onAudioEffectsChange?.({...audioEffects, treble: v - 12})} 
                min={0}
                max={24}
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
            {/* Header */}
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-white/70" />
              <span className="text-sm font-medium text-white">Einstellungen</span>
            </div>

            {/* Projekt-Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-white/70">Projekt-Info</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">Dauer</div>
                  <div className="text-sm text-white font-mono">{formatDuration(videoDuration)}</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">Szenen</div>
                  <div className="text-sm text-white font-mono">{sceneCount}</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">Audio-Spuren</div>
                  <div className="text-sm text-white font-mono">4</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">Untertitel</div>
                  <div className="text-sm text-white font-mono">{captionCount}</div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-xs font-medium text-white/70">Quick Actions</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-8 text-xs border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a]"
                  onClick={onResetClick}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Reset
                </Button>
                <Button 
                  size="sm" 
                  className="h-8 text-xs bg-[#00d4ff] hover:bg-[#00b8e0] text-black"
                  onClick={onExportClick}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
              </div>
            </div>

            {/* Tastaturkürzel */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Keyboard className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-white/70">Tastaturkürzel</span>
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Space</kbd>
                  <span className="text-white/50">Play/Pause</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">←/→</kbd>
                  <span className="text-white/50">Frame springen</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Ctrl+Z</kbd>
                  <span className="text-white/50">Rückgängig</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Del</kbd>
                  <span className="text-white/50">Clip löschen</span>
                </div>
              </div>
            </div>

            {/* Interface Settings */}
            <div className="space-y-2 pt-2 border-t border-[#3a3a3a]">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5 text-green-400" />
                <span className="text-xs font-medium text-white/70">Interface</span>
              </div>
              
              {/* Timeline Zoom */}
              <div className="space-y-1">
                <div className="flex justify-between">
                  <label className="text-[10px] text-white/50">Timeline Zoom</label>
                  <span className="text-[10px] text-white/40">{timelineZoom}%</span>
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
              
              {/* Toggles in kompakter Grid */}
              <div className="grid grid-cols-2 gap-2">
                <div className="flex items-center justify-between p-2 bg-[#2a2a2a] rounded">
                  <span className="text-[10px] text-white/50">Auto-Save</span>
                  <Switch checked={autoSave} onCheckedChange={setAutoSave} />
                </div>
                <div className="flex items-center justify-between p-2 bg-[#2a2a2a] rounded">
                  <span className="text-[10px] text-white/50">Snap</span>
                  <Switch defaultChecked />
                </div>
              </div>
            </div>
          </TabsContent>

          <ScrollBar orientation="vertical" />
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </Tabs>
    </div>
  );
};
