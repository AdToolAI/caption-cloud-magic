import React, { useState, useMemo, useRef, useEffect } from 'react';
import { SubtitleSafeZone, DEFAULT_SUBTITLE_SAFE_ZONE, SAFE_ZONE_PRESETS } from '@/lib/directors-cut-draft';
import { Button } from '@/components/ui/button';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Type, Sparkles, Mic, Loader2, Plus, AlignVerticalJustifyStart, AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, Music, Upload, Settings, FolderUp, FileVideo, FileAudio, Image, Search, Play, Pause, BarChart3, Zap, Keyboard, RotateCcw, Download, SlidersHorizontal, Crop, ZoomIn, Scissors, Palette, Wand2 } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { SubtitleClip, DEFAULT_SUBTITLE_STYLE } from '@/types/timeline';
import { SceneAnalysis, TransitionAssignment, TextOverlay } from '@/types/directors-cut';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AudioEffects, DEFAULT_AUDIO_EFFECTS } from '@/hooks/useWebAudioEffects';
import { CutPanel } from './sidebar/CutPanel';
import { useTranslation } from '@/hooks/useTranslation';
import { LookPanel } from './sidebar/LookPanel';
import { FXPanel } from './sidebar/FXPanel';
import { ExportPanel } from './sidebar/ExportPanel';
import { TextOverlayEditor2028 } from '../features/TextOverlayEditor2028';

interface JamendoTrack {
  id: string;
  name: string;
  artist: string;
  duration: number;
  audioUrl: string;
  imageUrl: string;
}

interface CapCutSidebarProps {
  videoUrl?: string;
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
  isDetectingOriginalSubs?: boolean;
  hasOriginalSubtitles?: boolean;
  onRemoveOriginalSubtitles?: () => void;
  onRemoveAllSubtitles?: () => void;
  onRetryDetection?: () => void;
  textOverlayCount?: number;
  textOverlays?: TextOverlay[];
  onTextOverlaysChange?: (overlays: TextOverlay[]) => void;
  showSubtitles?: boolean;
  onShowSubtitlesChange?: (show: boolean) => void;
  showTextOverlays?: boolean;
  onShowTextOverlaysChange?: (show: boolean) => void;
  isRemovingBurnedSubs?: boolean;
  hasCleanedVideo?: boolean;
  burnedSubsStatus?: string;
  onRemoveBurnedSubtitles?: (settings?: { conf_threshold?: number; margin?: number; method?: string }) => void;
  onRestoreOriginalVideo?: () => void;
  subtitleSafeZone?: SubtitleSafeZone;
  onSubtitleSafeZoneChange?: (zone: SubtitleSafeZone) => void;
  isDetectingBand?: boolean;
  onDetectSubtitleBand?: () => void;
  // New Studio Tab props
  scenes?: SceneAnalysis[];
  transitions?: TransitionAssignment[];
  onTransitionsChange?: (transitions: TransitionAssignment[]) => void;
  selectedSceneId?: string | null;
  currentTime?: number;
  onSplitAtPlayhead?: () => void;
  onDeleteScene?: (sceneId: string) => void;
  onDuplicateScene?: (sceneId: string) => void;
  onSceneSelect?: (sceneId: string | null) => void;
  onAutocut?: () => void;
  isAnalyzing?: boolean;
  onSceneAdd?: () => void;
  onSceneRename?: (sceneId: string, newName: string) => void;
  onTrimScene?: (sceneId: string, newStart: number, newEnd: number) => void;
  // Look
  appliedEffects?: { brightness: number; contrast: number; saturation: number; sharpness: number; temperature: number; vignette: number };
  onEffectsChange?: (effects: any) => void;
  colorGrading?: { enabled: boolean; grade: string | null; intensity: number };
  onColorGradingChange?: (enabled: boolean, grade: string | null, intensity?: number) => void;
  styleTransfer?: { enabled: boolean; style: string | null; intensity: number };
  onStyleTransferChange?: (enabled: boolean, style: string | null) => void;
  sceneEffects?: Record<string, any>;
  onSceneEffectsChange?: (sceneEffects: Record<string, any>) => void;
  // FX
  chromaKey?: { enabled: boolean; color: string; tolerance: number; backgroundUrl?: string };
  onChromaKeyChange?: (ck: any) => void;
  upscaling?: { enabled: boolean; targetResolution: string };
  onUpscalingChange?: (enabled: boolean, resolution: string) => void;
  interpolation?: { enabled: boolean; targetFps: number };
  onInterpolationChange?: (enabled: boolean, fps: number) => void;
  restoration?: { enabled: boolean; level: string };
  onRestorationChange?: (enabled: boolean, level: string) => void;
  onScenePlaybackRateChange?: (sceneId: string, rate: number) => void;
  // Export
  exportSettings?: import('@/types/directors-cut').ExportSettings;
  onExportSettingsChange?: (settings: import('@/types/directors-cut').ExportSettings) => void;
  onStartExport?: () => void;
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

// Draggable Music Item Component using @dnd-kit
const DraggableMusicItem: React.FC<{
  track: JamendoTrack;
  isPlaying: boolean;
  onTogglePreview: () => void;
  onAddToTimeline: () => void;
}> = ({ track, isPlaying, onTogglePreview, onAddToTimeline }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `music-${track.id}`,
    data: { 
      source: 'sidebar',
      type: 'jamendo-track',
      clip: {
        name: track.name,
        url: track.audioUrl,
        duration: track.duration,
        volume: 80,
        source: 'library',
        color: '#10b981',
      }
    },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    touchAction: 'none', // Critical for @dnd-kit drag functionality
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 p-2 bg-[#2a2a2a] rounded hover:bg-[#3a3a3a] cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 ring-2 ring-emerald-400/50"
      )}
      {...attributes}
      {...listeners}
    >
      <Button
        size="sm"
        variant="ghost"
        className="h-6 w-6 p-0"
        onClick={(e) => { e.stopPropagation(); onTogglePreview(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3 text-pink-400" />
        ) : (
          <Play className="h-3 w-3 text-white/60" />
        )}
      </Button>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-white truncate">{track.name}</div>
        <div className="text-[10px] text-white/40 truncate">
          {track.artist} · {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
        onClick={(e) => { e.stopPropagation(); onAddToTimeline(); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
};

export const CapCutSidebar: React.FC<CapCutSidebarProps> = ({
  videoUrl = '',
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
  isDetectingOriginalSubs = false,
  hasOriginalSubtitles = false,
  onRemoveOriginalSubtitles,
  onRemoveAllSubtitles,
  onRetryDetection,
  textOverlayCount = 0,
  textOverlays = [],
  onTextOverlaysChange,
  showSubtitles = true,
  onShowSubtitlesChange,
  showTextOverlays = true,
  onShowTextOverlaysChange,
  isRemovingBurnedSubs = false,
  hasCleanedVideo = false,
  burnedSubsStatus = 'idle',
  onRemoveBurnedSubtitles,
  onRestoreOriginalVideo,
  subtitleSafeZone = DEFAULT_SUBTITLE_SAFE_ZONE,
  onSubtitleSafeZoneChange,
  isDetectingBand = false,
  onDetectSubtitleBand,
  // New Studio Tab props
  scenes = [],
  transitions = [],
  onTransitionsChange,
  selectedSceneId = null,
  currentTime = 0,
  onSplitAtPlayhead,
  onDeleteScene,
  onDuplicateScene,
  onSceneSelect,
  onAutocut,
  isAnalyzing = false,
  onSceneAdd,
  onSceneRename,
  onTrimScene,
  appliedEffects,
  onEffectsChange,
  colorGrading,
  onColorGradingChange,
  styleTransfer,
  onStyleTransferChange,
  sceneEffects,
  onSceneEffectsChange,
  chromaKey,
  onChromaKeyChange,
  upscaling,
  onUpscalingChange,
  interpolation,
  onInterpolationChange,
  restoration,
  onRestorationChange,
  onScenePlaybackRateChange,
  exportSettings,
  onExportSettingsChange,
  onStartExport,
}) => {
  const { t } = useTranslation();
  // Tab state
  const [activeTab, setActiveTab] = useState('cut');
  
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
        toast.success(t('dc.captionsFromVoiceover', { count: transcribedCaptions.length }));
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
        toast.success(t('dc.emptyCaptionsCreated', { count: placeholderCaptions.length }));
      }
    } catch (error) {
      console.error('Caption generation error:', error);
      toast.error(t('dc.captionGenerationError'));
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Video file upload handler (Media Tab)
  const handleVideoFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(f => f.type.startsWith('video/'));
    if (files.length > 0) {
      setUploadedVideoFiles(prev => [...prev, ...files]);
      toast.success(t('dc.videosUploaded', { count: files.length }));
    }
  };

  const handleVideoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
    if (files.length > 0) {
      setUploadedVideoFiles(prev => [...prev, ...files]);
      toast.success(t('dc.videosUploaded', { count: files.length }));
    } else {
      toast.error(t('dc.onlyVideoFiles'));
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
      toast.success(t('dc.audioFilesUploaded', { count: files.length }));
    }
  };

  const handleAudioDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('audio/'));
    if (files.length > 0) {
      setUploadedAudioFiles(prev => [...prev, ...files]);
      toast.success(t('dc.audioFilesUploaded', { count: files.length }));
    } else {
      toast.error(t('dc.onlyAudioFiles'));
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
        artist: t('dc.uploaded'),
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
        artist: t('dc.uploaded'),
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
      toast.error(t('dc.searchTermOrFilter'));
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
        toast.info(t('dc.noMusicFound'));
      }
    } catch (error) {
      console.error('Music search error:', error);
      toast.error(t('dc.musicSearchError'));
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
    <div className="w-full flex flex-col border-r border-[#F5C76A]/10 bg-[#0a0a1a]/90 backdrop-blur-lg h-full">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col h-full">
        {/* Tab Icons — Cyan glow on active */}
        <TabsList className="grid grid-cols-7 gap-0.5 p-1.5 bg-[#050816] border-b border-[#F5C76A]/10 h-auto rounded-none">
          <TabsTrigger 
            value="cut" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabCut')}
          >
            <Scissors className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="look" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabLook')}
          >
            <Palette className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="fx" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-purple-500/15 data-[state=active]:text-purple-400 data-[state=active]:shadow-[0_0_12px_rgba(168,85,247,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabFX')}
          >
            <Wand2 className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="subtitle" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-cyan-500/15 data-[state=active]:text-cyan-400 data-[state=active]:shadow-[0_0_12px_rgba(34,211,238,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabSubtitle')}
          >
            <Type className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="audio-fx" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-pink-500/15 data-[state=active]:text-pink-400 data-[state=active]:shadow-[0_0_12px_rgba(236,72,153,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabAudio')}
          >
            <Music className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="export" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-[#F5C76A]/15 data-[state=active]:text-[#F5C76A] data-[state=active]:shadow-[0_0_12px_rgba(245,199,106,0.2)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabExport')}
          >
            <Download className="h-3.5 w-3.5" />
          </TabsTrigger>
          <TabsTrigger 
            value="settings" 
            className="flex flex-col items-center gap-0.5 py-1.5 rounded-lg data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:shadow-[0_0_8px_rgba(255,255,255,0.1)] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
            title={t('dc.tabSettings')}
          >
            <Settings className="h-3.5 w-3.5" />
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="flex-1">
          {/* TAB: Cut (Schnitt) */}
          <TabsContent value="cut" className="mt-0">
            <CutPanel
              scenes={scenes}
              transitions={transitions}
              onTransitionsChange={onTransitionsChange}
              selectedSceneId={selectedSceneId}
              currentTime={currentTime}
              videoDuration={videoDuration}
              onSplitAtPlayhead={onSplitAtPlayhead || (() => {})}
              onDeleteScene={onDeleteScene || (() => {})}
              onDuplicateScene={onDuplicateScene || (() => {})}
              onSceneSelect={onSceneSelect || (() => {})}
              onAutocut={onAutocut}
              isAnalyzing={isAnalyzing}
              onSceneAdd={onSceneAdd}
              onSceneRename={onSceneRename}
              onTrimScene={onTrimScene}
              onAddVideoAsScene={onAddVideoAsScene}
            />
          </TabsContent>

          {/* TAB: Look (Style + Farbe) */}
          <TabsContent value="look" className="mt-0">
            <LookPanel
              effects={appliedEffects || { brightness: 100, contrast: 100, saturation: 100, sharpness: 0, temperature: 0, vignette: 0 }}
              onEffectsChange={onEffectsChange || (() => {})}
              colorGrading={colorGrading || { enabled: false, grade: null, intensity: 50 }}
              onColorGradingChange={onColorGradingChange || (() => {})}
              styleTransfer={styleTransfer || { enabled: false, style: null, intensity: 50 }}
              onStyleTransferChange={onStyleTransferChange || (() => {})}
              selectedSceneId={selectedSceneId}
              sceneEffects={sceneEffects}
              onSceneEffectsChange={onSceneEffectsChange}
            />
          </TabsContent>

          {/* TAB: FX (Effekte) */}
          <TabsContent value="fx" className="mt-0">
            <FXPanel
              chromaKey={chromaKey || { enabled: false, color: '#00ff00', tolerance: 40 }}
              onChromaKeyChange={onChromaKeyChange || (() => {})}
              upscaling={upscaling || { enabled: false, targetResolution: '4K' }}
              onUpscalingChange={onUpscalingChange || (() => {})}
              interpolation={interpolation || { enabled: false, targetFps: 60 }}
              onInterpolationChange={onInterpolationChange || (() => {})}
              restoration={restoration || { enabled: false, level: 'medium' }}
              onRestorationChange={onRestorationChange || (() => {})}
              selectedSceneId={selectedSceneId}
              scenes={scenes}
              sceneEffects={sceneEffects}
              onSceneEffectsChange={onSceneEffectsChange}
              onScenePlaybackRateChange={onScenePlaybackRateChange}
            />
          </TabsContent>

          {/* TAB: Export */}
          <TabsContent value="export" className="mt-0">
            <ExportPanel
              exportSettings={exportSettings as any || { quality: 'hd' as const, format: 'mp4' as const, fps: 30, aspect_ratio: '16:9' }}
              onExportSettingsChange={onExportSettingsChange || (() => {})}
              onExport={onStartExport || onExportClick || (() => {})}
              videoDuration={videoDuration}
              scenesCount={sceneCount || scenes.length}
            />
          </TabsContent>


          {/* TAB 2: Subtitles (COMPLETE) */}
          <TabsContent value="subtitle" className="p-3 space-y-4 mt-0">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Type className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">{t('dc.subtitles')}</span>
            </div>

            {/* Original Subtitles Detection Banner */}
            {isDetectingOriginalSubs && (
              <div className="p-2.5 rounded bg-indigo-500/10 border border-indigo-500/30 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                <p className="text-[11px] text-indigo-300">{t('dc.detectingOriginalSubs')}</p>
              </div>
            )}

            {hasOriginalSubtitles && !isDetectingOriginalSubs && (
              <div className="p-2.5 rounded bg-indigo-500/10 border border-indigo-500/30 space-y-2">
                <p className="text-[11px] text-indigo-300 flex items-center gap-1.5">
                  🎬 {t('dc.originalSubsDetected')}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRemoveOriginalSubtitles}
                    className="h-6 text-[10px] border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300 px-2"
                  >
                    Entfernen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateCaptions}
                    disabled={isGeneratingCaptions}
                    className="h-6 text-[10px] border-[#00d4ff]/30 text-[#00d4ff] hover:bg-[#00d4ff]/10 px-2"
                  >
                    <Sparkles className="h-2.5 w-2.5 mr-1" />
                    Neu generieren
                  </Button>
                </div>
              </div>
            )}

            {/* Retry button when no original subs and not detecting */}
            {!hasOriginalSubtitles && !isDetectingOriginalSubs && existingCaptions.length === 0 && onRetryDetection && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRetryDetection}
                className="w-full h-7 text-[10px] border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10"
              >
                <RotateCcw className="h-2.5 w-2.5 mr-1" />
                {t('dc.retryDetection')}
              </Button>
            )}

            {/* Remove ALL subtitles button */}
            {existingCaptions.length > 0 && !isDetectingOriginalSubs && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRemoveAllSubtitles}
                className="w-full h-7 text-[10px] border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                {t('dc.removeAllSubtitles', { count: existingCaptions.length })}
              </Button>
            )}

            {/* Text-Overlays Editor */}
            <TextOverlayEditor2028
              overlays={textOverlays}
              onOverlaysChange={onTextOverlaysChange || (() => {})}
              videoDuration={videoDuration}
              currentTime={currentTime}
              videoUrl={videoUrl}
            />

            {/* Preview Layer Toggles */}
            <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
              <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">{t('dc.previewVisibility')}</p>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-white/70">💬 Untertitel</span>
                <Switch
                  checked={showSubtitles}
                  onCheckedChange={(v) => onShowSubtitlesChange?.(v)}
                  className="scale-75"
                />
              </div>
              {textOverlayCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/70">📝 Text-Overlays</span>
                  <Switch
                    checked={showTextOverlays}
                    onCheckedChange={(v) => onShowTextOverlaysChange?.(v)}
                    className="scale-75"
                  />
                </div>
              )}
              {existingCaptions.length === 0 && textOverlayCount === 0 && !hasCleanedVideo && (
                <p className="text-[10px] text-amber-400/80 mt-1">
                  ⚠️ {t('dc.burnedInTextWarning')}
                </p>
              )}
            </div>

            {/* Burned-in Subtitle Removal */}
            <div className="space-y-2 p-2.5 rounded bg-[#2a2a2a] border border-[#3a3a3a]">
              <p className="text-[11px] text-white/50 font-medium uppercase tracking-wider">{t('dc.burnedInText')}</p>
              <p className="text-[9px] text-white/30">
                {t('dc.burnedInTextDesc')}
              </p>

              {/* Auto-Detect + Apply Button */}
              <Button
                size="sm"
                variant="outline"
                onClick={onDetectSubtitleBand}
                disabled={isDetectingBand || (subtitleSafeZone.enabled && subtitleSafeZone.mode === 'reframe')}
                className="w-full h-8 text-[11px] border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-medium"
              >
                {isDetectingBand ? (
                  <>
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                    {t('dc.beingAnalyzed')}
                  </>
                ) : subtitleSafeZone.enabled && subtitleSafeZone.mode === 'reframe' ? (
                  <>
                    <Crop className="h-3 w-3 mr-1.5" />
                    ✅ {t('dc.cropActive')}
                  </>
                ) : (
                  <>
                    <Crop className="h-3 w-3 mr-1.5" />
                    {t('dc.autoCleanRemove')}
                  </>
                )}
              </Button>

              {/* Reframe Mode Controls (shown when active) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Crop className="h-3 w-3 text-emerald-400" />
                    <span className="text-[11px] text-white/70">{t('dc.reframeRecommended')}</span>
                  </div>
                  <Switch
                    checked={subtitleSafeZone.enabled && subtitleSafeZone.mode === 'reframe'}
                    onCheckedChange={(v) => {
                      onSubtitleSafeZoneChange?.({
                        ...subtitleSafeZone,
                        enabled: v,
                        mode: 'reframe',
                      });
                    }}
                    className="scale-75"
                  />
                </div>
                <p className="text-[9px] text-white/30">
                  {t('dc.reframeDesc')}
                </p>

                {subtitleSafeZone.enabled && subtitleSafeZone.mode === 'reframe' && (
                  <div className="space-y-2 pt-1">
                    {/* Presets */}
                    <div className="flex gap-1">
                      {(['light', 'medium', 'strong'] as const).map((preset) => (
                        <button
                          key={preset}
                          onClick={() => {
                            const p = SAFE_ZONE_PRESETS[preset];
                            onSubtitleSafeZoneChange?.({
                              ...subtitleSafeZone,
                              preset,
                              zoom: p.zoom!,
                              offsetY: p.offsetY!,
                              bottomBandPercent: p.bottomBandPercent!,
                            });
                          }}
                          className={cn(
                            "flex-1 px-2 py-1 rounded text-[10px] transition-colors",
                            subtitleSafeZone.preset === preset
                              ? "bg-emerald-500/20 border border-emerald-500 text-emerald-400"
                              : "bg-[#3a3a3a] border border-[#4a4a4a] text-white/60 hover:bg-[#4a4a4a]"
                          )}
                        >
                          {preset === 'light' ? 'Leicht' : preset === 'medium' ? 'Mittel' : 'Stark'}
                        </button>
                      ))}
                    </div>

                    {/* Bottom Band / Crop Slider — primary control */}
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <label className="text-[10px] text-white/50 flex items-center gap-1">
                          <Crop className="h-2.5 w-2.5" /> Zuschnittbereich
                        </label>
                        <span className="text-[10px] text-white/40">{subtitleSafeZone.bottomBandPercent}%</span>
                      </div>
                      <Slider
                        value={[subtitleSafeZone.bottomBandPercent]}
                        onValueChange={([v]) => {
                          const zoom = Math.round((1 / (1 - v / 100)) * 100) / 100;
                          const offsetY = Math.round(-(v / 2) * 10) / 10;
                          onSubtitleSafeZoneChange?.({ ...subtitleSafeZone, preset: 'custom', bottomBandPercent: v, zoom, offsetY });
                        }}
                        min={4}
                        max={30}
                        step={1}
                        className="cursor-pointer"
                      />
                    </div>

                    {/* Advanced: Zoom & Offset */}
                    <details className="group">
                      <summary className="text-[10px] text-white/30 cursor-pointer hover:text-white/50">Erweitert</summary>
                      <div className="space-y-2 pt-1.5">
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <label className="text-[10px] text-white/50 flex items-center gap-1">
                              <ZoomIn className="h-2.5 w-2.5" /> Zoom
                            </label>
                            <span className="text-[10px] text-white/40">{Math.round((subtitleSafeZone.zoom - 1) * 100)}%</span>
                          </div>
                          <Slider
                            value={[subtitleSafeZone.zoom * 100]}
                            onValueChange={([v]) => onSubtitleSafeZoneChange?.({ ...subtitleSafeZone, preset: 'custom', zoom: v / 100 })}
                            min={100}
                            max={145}
                            step={1}
                            className="cursor-pointer"
                          />
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <label className="text-[10px] text-white/50">Verschiebung ↑</label>
                            <span className="text-[10px] text-white/40">{Math.abs(subtitleSafeZone.offsetY)}%</span>
                          </div>
                          <Slider
                            value={[Math.abs(subtitleSafeZone.offsetY)]}
                            onValueChange={([v]) => onSubtitleSafeZoneChange?.({ ...subtitleSafeZone, preset: 'custom', offsetY: -v })}
                            min={0}
                            max={20}
                            step={1}
                            className="cursor-pointer"
                          />
                        </div>
                      </div>
                    </details>
                  </div>
                )}
              </div>

              {/* Divider */}
              <div className="border-t border-[#4a4a4a] my-1" />

              {/* AI Mode (Experimental Fallback) */}
              <details className="group">
                <summary className="flex items-center gap-1.5 cursor-pointer text-[10px] text-white/40 hover:text-white/60">
                  <Sparkles className="h-2.5 w-2.5" />
                  KI-Rekonstruktion (experimentell)
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-[9px] text-white/30">
                    {t('dc.aiReconstructionDesc')}
                  </p>
              {hasCleanedVideo ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1">
                    ✅ {t('dc.cleanedVideoActive')}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={onRestoreOriginalVideo}
                    className="w-full h-7 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  >
                    <RotateCcw className="h-2.5 w-2.5 mr-1" />
                    {t('dc.restoreOriginal')}
                  </Button>
                </div>
              ) : burnedSubsStatus === 'processing' || isRemovingBurnedSubs ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin text-purple-400" />
                    <p className="text-[10px] text-purple-400">{t('dc.aiRemovalProgress')}</p>
                  </div>
                  <div className="w-full bg-[#3a3a3a] rounded-full h-1.5">
                    <div className="bg-purple-500 h-1.5 rounded-full animate-pulse" style={{ width: '45%' }} />
                  </div>
                </div>
              ) : burnedSubsStatus === 'failed' ? (
                <div className="space-y-2">
                  <p className="text-[10px] text-red-400">❌ {t('dc.aiRemovalFailed')}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onRemoveBurnedSubtitles?.()}
                    className="w-full h-7 text-[10px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                  >
                    <RotateCcw className="h-2.5 w-2.5 mr-1" /> {t('dc.retryRender')}
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onRemoveBurnedSubtitles?.()}
                  disabled={isRemovingBurnedSubs}
                  className="w-full h-7 text-[10px] border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                >
                  <Sparkles className="h-2.5 w-2.5 mr-1" /> {t('dc.startAiRemoval')}
                </Button>
              )}
                </div>
              </details>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">{t('dc.language')}</label>
              <Select value={captionLanguage} onValueChange={setCaptionLanguage}>
                <SelectTrigger className="w-full h-8 bg-[#2a2a2a] border-[#3a3a3a] text-sm text-white">
                  <SelectValue placeholder={t('dc.chooseLanguage')} />
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
                {t('dc.subtitleText')} {selectedSubtitleId && <span className="text-[#00d4ff]">{t('dc.subtitleSelected')}</span>}
              </label>
              <Textarea
                value={selectedSubtitleText}
                onChange={(e) => {
                  if (selectedSubtitleId) {
                    onSubtitleTextUpdate?.(selectedSubtitleId, e.target.value);
                  }
                }}
                placeholder={selectedSubtitleId ? t('dc.enterText') : t('dc.clickSubtitleHint')}
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
              <h4 className="text-xs font-medium text-white/70 mb-3">{t('dc.stylingOptions')}</h4>
            </div>

            {/* Position */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">{t('dc.position')}</label>
              <div className="flex gap-1">
                {[
                  { value: 'top', icon: AlignVerticalJustifyStart, label: t('dc.posTop') },
                  { value: 'center', icon: AlignVerticalJustifyCenter, label: t('dc.posCenter') },
                  { value: 'bottom', icon: AlignVerticalJustifyEnd, label: t('dc.posBottom') },
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
              <label className="text-xs text-white/70">{t('dc.fontSize')}</label>
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
                <label className="text-xs text-white/70">{t('dc.textColor')}</label>
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
                <label className="text-xs text-white/70">{t('dc.background')}</label>
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
              <label className="text-xs text-white/70">{t('dc.fontFamily')}</label>
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
              <label className="text-xs text-white/70">{t('dc.maxLines')}</label>
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
                    {t('dc.lines', { n: lines })}
                  </button>
                ))}
              </div>
            </div>

            {/* Text Stroke / Outline */}
            <div className="space-y-2">
              <label className="text-xs text-white/70">{t('dc.outline')}</label>
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
                  {localStyle.textStroke ? t('dc.outlineOn') : t('dc.outlineOff')}
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
                  {t('dc.voiceoverDetected')}
                </p>
              ) : (
                <p className="text-[10px] text-white/50">
                  {t('dc.noVoiceover')}
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
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {t('dc.generating')}</>
              ) : voiceOverUrl ? (
                <><Sparkles className="h-4 w-4 mr-2" /> {t('dc.transcribeFromVoiceover')}</>
              ) : (
                <><Type className="h-4 w-4 mr-2" /> {t('dc.createEmptySubtitles')}</>
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
                toast.success(t('dc.newSubtitleAdded'));
              }}
              className="w-full border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a] text-white/70 hover:text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              {t('dc.addNewSubtitle')}
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
                <ScrollArea className="h-32 [&>div]:pointer-events-auto">
                  <div className="space-y-1 pointer-events-auto">
                    {musicSearchResults.map(track => (
                      <DraggableMusicItem
                        key={track.id}
                        track={track}
                        isPlaying={playingTrackId === track.id}
                        onTogglePreview={() => toggleMusicPreview(track)}
                        onAddToTimeline={() => onMusicDrop?.(track)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}

              <p className="text-[10px] text-white/40">
                {t('dc.dragMusicToTimeline')}
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
                {t('dc.audioEffectsHint')}
              </p>
            </div>
          </TabsContent>

          {/* TAB 4: Settings */}
          <TabsContent value="settings" className="p-3 space-y-4 mt-0">
            {/* Header */}
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-white/70" />
              <span className="text-sm font-medium text-white">{t('dc.settings')}</span>
            </div>

            {/* Projekt-Info */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-xs font-medium text-white/70">{t('dc.projectInfoLabel')}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">{t('dc.durationInfo')}</div>
                  <div className="text-sm text-white font-mono">{formatDuration(videoDuration)}</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">{t('dc.scenesInfo')}</div>
                  <div className="text-sm text-white font-mono">{sceneCount}</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">{t('dc.audioTracks')}</div>
                  <div className="text-sm text-white font-mono">4</div>
                </div>
                <div className="p-2 bg-[#2a2a2a] rounded">
                  <div className="text-[10px] text-white/40">{t('dc.subtitlesInfo')}</div>
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
                <span className="text-xs font-medium text-white/70">{t('dc.keyboardShortcuts')}</span>
              </div>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Space</kbd>
                  <span className="text-white/50">Play/Pause</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">←/→</kbd>
                  <span className="text-white/50">{t('dc.frameJump')}</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Ctrl+Z</kbd>
                  <span className="text-white/50">{t('dc.shortcutUndo')}</span>
                </div>
                <div className="flex justify-between p-1.5 bg-[#2a2a2a] rounded">
                  <kbd className="px-1.5 py-0.5 bg-[#3a3a3a] rounded text-white/60 font-mono">Del</kbd>
                  <span className="text-white/50">{t('dc.deleteClip')}</span>
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
