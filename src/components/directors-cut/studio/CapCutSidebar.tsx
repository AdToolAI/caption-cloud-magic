import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  FolderOpen, Headphones, Type, Sparkles, Wand2,
  Mic, Music, Volume2, Search, Play, Plus, Loader2, Pause, GripVertical, FileText,
  Upload, Trash2, FileAudio, FileVideo, X
} from 'lucide-react';
import { AudioClip } from '@/types/timeline';
import { AudioEnhancements } from '@/types/directors-cut';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import { VoiceoverScriptGenerator } from '@/components/universal-creator/VoiceoverScriptGenerator';

// Types
interface AudioEffectsLocal {
  reverb: number;
  echo: number;
  pitch: number;
  bass: number;
  mid: number;
  treble: number;
}

interface CapCutSidebarProps {
  onAddClip: (trackId: string, clip: Omit<AudioClip, 'id'>) => void;
  audioEnhancements: AudioEnhancements;
  onAudioChange: (enhancements: AudioEnhancements) => void;
  videoUrl?: string;
  voiceOverUrl?: string;
  onCaptionsGenerated?: (captions: Caption[]) => void;
  onAddVideoAsScene?: (videoUrl: string, duration: number, name: string) => void;
  // Audio effects props (lifted state)
  audioEffects?: AudioEffectsLocal;
  onAudioEffectsChange?: (effects: AudioEffectsLocal) => void;
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

interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: 'audio' | 'video';
  duration: number;
  size: number;
}

interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
}

interface AudioEffects {
  reverb: number;
  echo: number;
  pitch: number;
  bass: number;
  mid: number;
  treble: number;
}

// Constants
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

const CAPTION_STYLES = [
  { id: 'standard', name: 'Standard', description: 'Weiß auf Schwarz' },
  { id: 'tiktok', name: 'TikTok', description: 'Bunt & animiert' },
  { id: 'subtitle', name: 'Untertitel', description: 'Klassisch' },
  { id: 'highlight', name: 'Highlight', description: 'Wort-Animation' },
];

// Components
const DraggableMusicItem: React.FC<{
  track: JamendoTrack;
  isPlaying: boolean;
  isLoading: boolean;
  onPlayPause: () => void;
  onAddToTimeline: () => void;
  getProxiedUrl: (url: string | null) => string | null;
}> = ({ track, isPlaying, isLoading, onPlayPause, onAddToTimeline, getProxiedUrl }) => {
  const trackUrl = track.url || track.preview_url;
  const proxiedUrl = getProxiedUrl(trackUrl);
  
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-music-${track.id}`,
    data: {
      source: 'sidebar',
      type: 'music',
      clip: {
        trackId: 'track-music',
        name: track.title,
        url: proxiedUrl || '',
        duration: track.duration,
        volume: 70,
        fadeIn: 2,
        fadeOut: 2,
        source: 'library',
        color: '#10b981',
      },
    },
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 p-1.5 rounded hover:bg-[#2a2a2a] group",
        isDragging && "opacity-50"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      
      <button
        onClick={onPlayPause}
        className="w-7 h-7 rounded-full bg-[#00d4ff]/20 hover:bg-[#00d4ff]/30 flex items-center justify-center flex-shrink-0"
      >
        {isPlaying ? (
          isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-[#00d4ff]" />
          ) : (
            <Pause className="h-3 w-3 text-[#00d4ff]" />
          )
        ) : (
          <Play className="h-3 w-3 text-[#00d4ff] ml-0.5" />
        )}
      </button>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{track.title}</p>
        <p className="text-[10px] text-white/40 truncate">
          {track.artist} • {formatDuration(track.duration)}
        </p>
      </div>
      
      <Button
        size="sm"
        variant="ghost"
        onClick={onAddToTimeline}
        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-[#00d4ff]/20"
      >
        <Plus className="h-3.5 w-3.5 text-[#00d4ff]" />
      </Button>
    </div>
  );
};

const DraggableSFXItem: React.FC<{
  sfx: { name: string; duration: number; category: string };
  onAddToTimeline: () => void;
}> = ({ sfx, onAddToTimeline }) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-sfx-${sfx.name}`,
    data: {
      source: 'sidebar',
      type: 'sfx',
      clip: {
        trackId: 'track-sfx',
        name: sfx.name,
        url: '',
        duration: sfx.duration,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        source: 'library',
        color: '#ec4899',
      },
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-2 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] transition-colors cursor-grab active:cursor-grabbing group",
        isDragging && "opacity-50"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-white">{sfx.name}</p>
          <p className="text-[10px] text-white/40">{sfx.duration}s</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onAddToTimeline();
          }}
          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:bg-[#ec4899]/20"
        >
          <Plus className="h-3 w-3 text-[#ec4899]" />
        </Button>
      </div>
    </div>
  );
};

const DraggableUploadedFile: React.FC<{
  file: UploadedFile;
  onAddToTimeline: () => void;
  onDelete: () => void;
}> = ({ file, onAddToTimeline, onDelete }) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  // Extract video thumbnail on mount
  useEffect(() => {
    if (file.type === 'video' && file.url) {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.src = file.url;
      video.currentTime = 1; // Frame at 1 second
      video.onloadeddata = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 64;
          canvas.height = 36;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0, 64, 36);
          setThumbnail(canvas.toDataURL('image/jpeg', 0.6));
        } catch (e) {
          console.log('Thumbnail extraction failed:', e);
        }
      };
      video.onerror = () => setThumbnail(null);
    }
  }, [file.url, file.type]);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `sidebar-upload-${file.id}`,
    data: {
      source: 'sidebar',
      type: file.type,
      clip: {
        trackId: file.type === 'video' ? 'track-original' : 'track-music',
        name: file.name,
        url: file.url,
        duration: file.duration,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        source: 'uploaded',
        color: file.type === 'video' ? '#6366f1' : '#10b981',
      },
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center gap-2 p-2 rounded bg-[#2a2a2a] hover:bg-[#3a3a3a] group",
        isDragging && "opacity-50"
      )}
    >
      <div 
        {...attributes} 
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      
      {file.type === 'audio' ? (
        <FileAudio className="h-4 w-4 text-emerald-400 flex-shrink-0" />
      ) : thumbnail ? (
        <img 
          src={thumbnail} 
          alt="" 
          className="w-12 h-7 rounded object-cover flex-shrink-0 border border-white/10"
        />
      ) : (
        <div className="w-12 h-7 rounded bg-[#3a3a3a] flex items-center justify-center flex-shrink-0 border border-white/10">
          <FileVideo className="h-4 w-4 text-indigo-400" />
        </div>
      )}
      
      <div className="flex-1 min-w-0">
        <p className="text-xs text-white truncate">{file.name}</p>
        <p className="text-[10px] text-white/40">
          {formatDuration(file.duration)} • {formatFileSize(file.size)}
        </p>
      </div>
      
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddToTimeline}
          className="h-5 w-5 p-0 hover:bg-[#00d4ff]/20"
          title={file.type === 'video' ? 'Als neue Szene hinzufügen' : 'Zur Musik-Spur hinzufügen'}
        >
          <Plus className="h-3 w-3 text-[#00d4ff]" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          className="h-5 w-5 p-0 hover:bg-red-500/20"
        >
          <Trash2 className="h-3 w-3 text-red-400" />
        </Button>
      </div>
    </div>
  );
};

// Helpers
const getProxiedUrl = (url: string | null): string | null => {
  if (!url) return null;
  if (url.includes('jamendo.com') || url.includes('storage.jamendo.com')) {
    return `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-audio?url=${encodeURIComponent(url)}`;
  }
  return url;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Main Component
export const CapCutSidebar: React.FC<CapCutSidebarProps> = ({
  onAddClip,
  audioEnhancements,
  onAudioChange,
  videoUrl,
  voiceOverUrl,
  onCaptionsGenerated,
  onAddVideoAsScene,
  audioEffects: audioEffectsProp,
  onAudioEffectsChange,
}) => {
  // Voice State
  const [voiceText, setVoiceText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showScriptGenerator, setShowScriptGenerator] = useState(false);
  
  // Jamendo Search State
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);
  const [selectedMood, setSelectedMood] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  
  // Audio Playback State
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Media Upload State
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Captions State
  const [captionLanguage, setCaptionLanguage] = useState('de');
  const [captionStyle, setCaptionStyle] = useState('standard');
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const [generatedCaptions, setGeneratedCaptions] = useState<Caption[]>([]);

  // Audio Effects State - use props if available, local state as fallback
  const [localAudioEffects, setLocalAudioEffects] = useState<AudioEffectsLocal>({
    reverb: 0,
    echo: 0,
    pitch: 0,
    bass: 0,
    mid: 0,
    treble: 0,
  });

  // Use prop value if provided, otherwise local state
  const audioEffects = audioEffectsProp ?? localAudioEffects;

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

  // Handlers
  const handleSearch = () => setSearchTriggered(true);

  const handlePlayPause = (track: JamendoTrack) => {
    const trackUrl = track.url || track.preview_url;
    const proxiedUrl = getProxiedUrl(trackUrl);
    if (!proxiedUrl) return;

    if (playingTrackId === track.id) {
      audioRef.current?.pause();
      setPlayingTrackId(null);
    } else {
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

      audio.addEventListener('ended', () => setPlayingTrackId(null), { once: true });
      audio.src = proxiedUrl;
      audioRef.current = audio;
    }
  };

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
      toast.success('Voice-Over generiert');
    }, 2000);
  };

  // Media Upload Handlers
  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.type.startsWith('audio/') || f.type.startsWith('video/')
    );
    if (files.length > 0) {
      await uploadFiles(files);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length > 0) {
      await uploadFiles(files);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFiles = async (files: File[]) => {
    setIsUploading(true);
    
    for (const file of files) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast.error('Bitte einloggen um Dateien hochzuladen');
          continue;
        }

        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        const { data, error } = await supabase.storage
          .from('media-assets')
          .upload(`capcut/${fileName}`, file, { cacheControl: '3600', upsert: false });

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('media-assets')
          .getPublicUrl(data.path);

        // Get duration using audio/video element
        const duration = await getMediaDuration(file);

        const uploadedFile: UploadedFile = {
          id: `upload-${Date.now()}`,
          name: file.name,
          url: publicUrl,
          type: file.type.startsWith('video/') ? 'video' : 'audio',
          duration,
          size: file.size,
        };

        setUploadedFiles(prev => [...prev, uploadedFile]);
        toast.success(`${file.name} hochgeladen`);
      } catch (err) {
        console.error('Upload error:', err);
        toast.error(`Fehler beim Upload: ${file.name}`);
      }
    }
    
    setIsUploading(false);
  };

  const getMediaDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const element = file.type.startsWith('video/') 
        ? document.createElement('video')
        : document.createElement('audio');
      element.src = URL.createObjectURL(file);
      element.addEventListener('loadedmetadata', () => {
        resolve(element.duration || 30);
        URL.revokeObjectURL(element.src);
      });
      element.addEventListener('error', () => resolve(30));
    });
  };

  const handleAddUploadedToTimeline = (file: UploadedFile) => {
    if (file.type === 'video') {
      // Videos als neue Szene hinzufügen, nicht als Audio-Clip
      if (onAddVideoAsScene) {
        onAddVideoAsScene(file.url, file.duration, file.name);
        toast.success(`"${file.name}" als neue Szene hinzugefügt`);
      } else {
        toast.error('Video-Szenen können hier nicht hinzugefügt werden');
      }
    } else {
      // Audio-Dateien zur Musik-Spur hinzufügen
      onAddClip('track-music', {
        trackId: 'track-music',
        name: file.name,
        url: file.url,
        startTime: 0,
        duration: file.duration,
        trimStart: 0,
        trimEnd: file.duration,
        volume: 100,
        fadeIn: 0,
        fadeOut: 0,
        source: 'uploaded',
        color: '#10b981',
      });
      toast.success(`"${file.name}" zur Musik-Spur hinzugefügt`);
    }
  };

  const handleDeleteUploadedFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // AI Captions Handler
  const handleGenerateCaptions = async () => {
    const audioUrl = voiceOverUrl || videoUrl;
    if (!audioUrl) {
      toast.error('Kein Audio/Video vorhanden');
      return;
    }

    setIsGeneratingCaptions(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-subtitles', {
        body: { audioUrl, language: captionLanguage },
      });

      if (error) throw error;

      const captions: Caption[] = (data.subtitles || []).map((s: any) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        text: s.text,
      }));

      setGeneratedCaptions(captions);
      onCaptionsGenerated?.(captions);
      toast.success(`${captions.length} Untertitel generiert`);
    } catch (err) {
      console.error('Caption generation error:', err);
      toast.error('Fehler bei der Untertitel-Generierung');
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  // Audio Effects Handler - update either via callback prop or local state
  const updateAudioEffect = (key: keyof AudioEffectsLocal, value: number) => {
    const newEffects = { ...audioEffects, [key]: value };
    if (onAudioEffectsChange) {
      onAudioEffectsChange(newEffects);
    } else {
      setLocalAudioEffects(newEffects);
    }
  };

  return (
    <div className="w-64 flex flex-col border-r border-[#2a2a2a] bg-[#1e1e1e] h-full">
      <Tabs defaultValue="audio" className="flex-1 flex flex-col min-h-0">
        <TabsList className="h-12 grid grid-cols-5 bg-[#242424] rounded-none border-b border-[#2a2a2a] p-0 flex-shrink-0">
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

        <ScrollArea className="flex-1 min-h-0">
          {/* Media Tab - Upload */}
          <TabsContent value="media" className="m-0 p-3 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <FolderOpen className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">Media Upload</span>
            </div>

            {/* Upload Area */}
            <div 
              onDrop={handleFileDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all",
                isDraggingOver 
                  ? "border-[#00d4ff] bg-[#00d4ff]/10" 
                  : "border-[#3a3a3a] hover:border-[#00d4ff]/50 hover:bg-[#2a2a2a]"
              )}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-8 w-8 mx-auto mb-2 text-[#00d4ff] animate-spin" />
                  <p className="text-sm text-white/60">Uploading...</p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 mx-auto mb-2 text-white/40" />
                  <p className="text-sm text-white/60">Audio oder Video hochladen</p>
                  <p className="text-xs text-white/30 mt-1">MP3, WAV, MP4, MOV</p>
                </>
              )}
              <input 
                ref={fileInputRef}
                type="file" 
                accept="audio/*,video/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Uploaded Files List */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-medium text-white/70 flex items-center justify-between">
                  Hochgeladene Dateien
                  <span className="text-white/40">{uploadedFiles.length}</span>
                </h4>
                <div className="space-y-1.5 max-h-60 overflow-y-auto">
                  {uploadedFiles.map((file) => (
                    <DraggableUploadedFile
                      key={file.id}
                      file={file}
                      onAddToTimeline={() => handleAddUploadedToTimeline(file)}
                      onDelete={() => handleDeleteUploadedFile(file.id)}
                    />
                  ))}
                </div>
              </div>
            )}
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
                placeholder="Voiceover-Text eingeben..."
                className="w-full h-20 bg-[#2a2a2a] border border-[#3a3a3a] rounded-md p-2 text-sm text-white placeholder:text-white/40 resize-none focus:outline-none focus:border-[#00d4ff]"
              />
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setShowScriptGenerator(true)}
                className="w-full mt-2 mb-2 border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a] text-white/70 hover:text-white"
              >
                <FileText className="h-3.5 w-3.5 mr-1.5" />
                Script generieren
              </Button>
              <Button 
                className="w-full bg-[#00d4ff] hover:bg-[#00b8e0] text-black text-sm h-8"
                onClick={handleGenerateVoice}
                disabled={!voiceText.trim() || isGenerating}
              >
                {isGenerating ? (
                  <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generiere...</>
                ) : (
                  <><Mic className="h-3.5 w-3.5 mr-1.5" /> Voice generieren</>
                )}
              </Button>
            </div>

            {/* Script Generator Dialog */}
            <VoiceoverScriptGenerator
              open={showScriptGenerator}
              onClose={() => setShowScriptGenerator(false)}
              onScriptGenerated={(script) => {
                setVoiceText(script);
                toast.success('Script übernommen');
              }}
            />

            {/* Music Section */}
            <div className="p-3 border-b border-[#2a2a2a]">
              <div className="flex items-center gap-2 mb-3">
                <Music className="h-4 w-4 text-[#00d4ff]" />
                <span className="text-sm font-medium text-white">Music</span>
                <span className="text-[10px] text-white/40 ml-auto">via Jamendo</span>
              </div>
              
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

              {stockLoading ? (
                <div className="text-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin mx-auto text-[#00d4ff]" />
                  <p className="text-[10px] text-white/40 mt-2">Suche läuft...</p>
                </div>
              ) : stockMusic && stockMusic.length > 0 ? (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {stockMusic.map((track) => (
                    <DraggableMusicItem
                      key={track.id}
                      track={track}
                      isPlaying={playingTrackId === track.id}
                      isLoading={isLoadingAudio && playingTrackId === track.id}
                      onPlayPause={() => handlePlayPause(track)}
                      onAddToTimeline={() => handleAddToTimeline(track)}
                      getProxiedUrl={getProxiedUrl}
                    />
                  ))}
                </div>
              ) : searchTriggered ? (
                <div className="text-center py-6 text-white/40">
                  <Music className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Keine Ergebnisse</p>
                </div>
              ) : (
                <div className="text-center py-6 text-white/40">
                  <Music className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  <p className="text-xs">Lizenzfreie Musik suchen</p>
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
                  <DraggableSFXItem
                    key={i}
                    sfx={sfx}
                    onAddToTimeline={() => onAddClip('track-sfx', {
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
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Text Tab - AI Captions */}
          <TabsContent value="text" className="m-0 p-3 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Type className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">AI Captions</span>
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

            {/* Generate Button */}
            <Button
              onClick={handleGenerateCaptions}
              disabled={isGeneratingCaptions || (!videoUrl && !voiceOverUrl)}
              className="w-full bg-[#00d4ff] hover:bg-[#00b8e0] text-black"
            >
              {isGeneratingCaptions ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generiere...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" /> Captions generieren</>
              )}
            </Button>

            {!videoUrl && !voiceOverUrl && (
              <p className="text-[10px] text-white/40 text-center">
                Audio/Video erforderlich
              </p>
            )}

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
                      <p className="text-white mt-1">{caption.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Effects Tab - Audio Effects */}
          <TabsContent value="effects" className="m-0 p-3 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-[#00d4ff]" />
              <span className="text-sm font-medium text-white">Audio Effects</span>
            </div>

            {/* Voice Effects */}
            <div className="space-y-3">
              <h4 className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                <Mic className="h-3 w-3" /> Voice Effects
              </h4>
              
              {/* Reverb */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Reverb</span>
                  <span className="text-[10px] text-white/40">{audioEffects.reverb}%</span>
                </div>
                <Slider
                  value={[audioEffects.reverb]}
                  max={100}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('reverb', v)}
                  className="w-full"
                />
              </div>

              {/* Echo */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Echo</span>
                  <span className="text-[10px] text-white/40">{audioEffects.echo}%</span>
                </div>
                <Slider
                  value={[audioEffects.echo]}
                  max={100}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('echo', v)}
                  className="w-full"
                />
              </div>

              {/* Pitch Shift */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Pitch</span>
                  <span className="text-[10px] text-white/40">{audioEffects.pitch > 0 ? '+' : ''}{audioEffects.pitch}</span>
                </div>
                <Slider
                  value={[audioEffects.pitch]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('pitch', v)}
                  className="w-full"
                />
              </div>
            </div>

            {/* EQ Section */}
            <div className="space-y-3 pt-3 border-t border-[#2a2a2a]">
              <h4 className="text-xs font-medium text-white/70 flex items-center gap-1.5">
                <Music className="h-3 w-3" /> Equalizer
              </h4>

              {/* Bass */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Bass</span>
                  <span className="text-[10px] text-white/40">{audioEffects.bass > 0 ? '+' : ''}{audioEffects.bass} dB</span>
                </div>
                <Slider
                  value={[audioEffects.bass]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('bass', v)}
                  className="w-full"
                />
              </div>

              {/* Mid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Mid</span>
                  <span className="text-[10px] text-white/40">{audioEffects.mid > 0 ? '+' : ''}{audioEffects.mid} dB</span>
                </div>
                <Slider
                  value={[audioEffects.mid]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('mid', v)}
                  className="w-full"
                />
              </div>

              {/* Treble */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-white/60">Treble</span>
                  <span className="text-[10px] text-white/40">{audioEffects.treble > 0 ? '+' : ''}{audioEffects.treble} dB</span>
                </div>
                <Slider
                  value={[audioEffects.treble]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([v]) => updateAudioEffect('treble', v)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Reset Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const resetEffects = { reverb: 0, echo: 0, pitch: 0, bass: 0, mid: 0, treble: 0 };
                if (onAudioEffectsChange) {
                  onAudioEffectsChange(resetEffects);
                } else {
                  setLocalAudioEffects(resetEffects);
                }
              }}
              className="w-full border-[#3a3a3a] bg-transparent hover:bg-[#2a2a2a] text-white/70"
            >
              Zurücksetzen
            </Button>
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
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a] accent-[#00d4ff]"
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
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a] accent-[#00d4ff]"
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
                  className="w-4 h-4 rounded bg-[#2a2a2a] border-[#3a3a3a] accent-[#00d4ff]"
                />
              </label>
              <p className="text-[10px] text-white/40 mt-1">Musik leiser wenn Voice spielt</p>
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
            
            {/* Extra padding at bottom for scroll */}
            <div className="h-20" />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
};
