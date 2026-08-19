import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Layers, Plus, Trash2, Eye, EyeOff, Lock, Unlock, 
  Volume2, VolumeX, Film, Music, Type, Image,
  ChevronUp, ChevronDown, Scissors, Copy
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface TimelineTrack {
  id: string;
  type: 'video' | 'audio' | 'text' | 'overlay';
  name: string;
  visible: boolean;
  locked: boolean;
  muted: boolean;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  trackId: string;
  startTime: number;
  duration: number;
  sourceUrl?: string;
  content?: string;
  color: string;
}

interface MultiTrackTimelineProps {
  tracks: TimelineTrack[];
  onTracksChange: (tracks: TimelineTrack[]) => void;
  totalDuration: number;
  currentTime: number;
  onSeek: (time: number) => void;
}

const TRACK_ICONS = {
  video: Film,
  audio: Music,
  text: Type,
  overlay: Image,
};

const TRACK_COLORS = {
  video: 'bg-blue-500/20 border-blue-500',
  audio: 'bg-green-500/20 border-green-500',
  text: 'bg-yellow-500/20 border-yellow-500',
  overlay: 'bg-purple-500/20 border-purple-500',
};

export function MultiTrackTimeline({
  tracks,
  onTracksChange,
  totalDuration,
  currentTime,
  onSeek,
}: MultiTrackTimelineProps) {
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const timelineRef = useRef<HTMLDivElement>(null);

  const addTrack = (type: TimelineTrack['type']) => {
    const newTrack: TimelineTrack = {
      id: `track-${Date.now()}`,
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${tracks.filter(t => t.type === type).length + 1}`,
      visible: true,
      locked: false,
      muted: false,
      clips: [],
    };
    onTracksChange([...tracks, newTrack]);
  };

  const removeTrack = (trackId: string) => {
    onTracksChange(tracks.filter(t => t.id !== trackId));
  };

  const toggleTrackVisibility = (trackId: string) => {
    onTracksChange(tracks.map(t => 
      t.id === trackId ? { ...t, visible: !t.visible } : t
    ));
  };

  const toggleTrackLock = (trackId: string) => {
    onTracksChange(tracks.map(t => 
      t.id === trackId ? { ...t, locked: !t.locked } : t
    ));
  };

  const toggleTrackMute = (trackId: string) => {
    onTracksChange(tracks.map(t => 
      t.id === trackId ? { ...t, muted: !t.muted } : t
    ));
  };

  const moveTrack = (trackId: string, direction: 'up' | 'down') => {
    const index = tracks.findIndex(t => t.id === trackId);
    if (
      (direction === 'up' && index === 0) || 
      (direction === 'down' && index === tracks.length - 1)
    ) return;
    
    const newTracks = [...tracks];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    [newTracks[index], newTracks[newIndex]] = [newTracks[newIndex], newTracks[index]];
    onTracksChange(newTracks);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    onSeek(percentage * totalDuration);
  };

  const playheadPosition = (currentTime / totalDuration) * 100;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            Multi-Track Timeline
            <Badge variant="secondary">Pro</Badge>
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Zoom:</span>
            <Slider
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0])}
              min={50}
              max={200}
              step={10}
              className="w-20"
            />
            <span className="text-xs w-8">{zoom}%</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add Track Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => addTrack('video')}>
            <Film className="h-3 w-3 mr-1" />
            Video
          </Button>
          <Button size="sm" variant="outline" onClick={() => addTrack('audio')}>
            <Music className="h-3 w-3 mr-1" />
            Audio
          </Button>
          <Button size="sm" variant="outline" onClick={() => addTrack('text')}>
            <Type className="h-3 w-3 mr-1" />
            Text
          </Button>
          <Button size="sm" variant="outline" onClick={() => addTrack('overlay')}>
            <Image className="h-3 w-3 mr-1" />
            Overlay
          </Button>
        </div>

        {/* Timeline Container */}
        <div className="border rounded-lg overflow-hidden">
          {/* Time Ruler */}
          <div className="h-6 bg-muted/50 border-b flex items-center relative">
            <div className="w-32 flex-shrink-0 border-r px-2">
              <span className="text-[10px] text-muted-foreground">Tracks</span>
            </div>
            <div 
              ref={timelineRef}
              className="flex-1 relative cursor-pointer"
              onClick={handleTimelineClick}
              style={{ width: `${zoom}%` }}
            >
              {/* Time markers */}
              {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => (
                <div 
                  key={i}
                  className="absolute top-0 h-full flex flex-col justify-end"
                  style={{ left: `${(i * 5 / totalDuration) * 100}%` }}
                >
                  <div className="w-px h-2 bg-border" />
                  <span className="text-[8px] text-muted-foreground ml-0.5">
                    {formatTime(i * 5)}
                  </span>
                </div>
              ))}
              {/* Playhead */}
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{ left: `${playheadPosition}%` }}
              >
                <div className="w-2 h-2 bg-red-500 rounded-full -ml-[3px] -mt-1" />
              </div>
            </div>
          </div>

          {/* Tracks */}
          <ScrollArea className="h-64">
            {tracks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                Klicke oben um Tracks hinzuzufügen
              </div>
            ) : (
              tracks.map((track, index) => {
                const Icon = TRACK_ICONS[track.type];
                const colorClass = TRACK_COLORS[track.type];
                
                return (
                  <div 
                    key={track.id}
                    className={`flex border-b last:border-b-0 ${track.visible ? '' : 'opacity-50'}`}
                  >
                    {/* Track Header */}
                    <div className="w-32 flex-shrink-0 border-r p-2 bg-muted/30">
                      <div className="flex items-center gap-1 mb-1">
                        <Icon className="h-3 w-3" />
                        <span className="text-[10px] font-medium truncate flex-1">
                          {track.name}
                        </span>
                      </div>
                      <div className="flex gap-0.5">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => toggleTrackVisibility(track.id)}
                        >
                          {track.visible ? (
                            <Eye className="h-3 w-3" />
                          ) : (
                            <EyeOff className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => toggleTrackLock(track.id)}
                        >
                          {track.locked ? (
                            <Lock className="h-3 w-3" />
                          ) : (
                            <Unlock className="h-3 w-3" />
                          )}
                        </Button>
                        {(track.type === 'video' || track.type === 'audio') && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-5 w-5"
                            onClick={() => toggleTrackMute(track.id)}
                          >
                            {track.muted ? (
                              <VolumeX className="h-3 w-3" />
                            ) : (
                              <Volume2 className="h-3 w-3" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => moveTrack(track.id, 'up')}
                          disabled={index === 0}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5"
                          onClick={() => moveTrack(track.id, 'down')}
                          disabled={index === tracks.length - 1}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 text-destructive hover:text-destructive"
                          onClick={() => removeTrack(track.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {/* Track Content */}
                    <div 
                      className="flex-1 h-16 relative bg-muted/10"
                      style={{ width: `${zoom}%` }}
                    >
                      {/* Clips */}
                      {track.clips.map((clip) => (
                        <div
                          key={clip.id}
                          className={`absolute top-1 bottom-1 rounded border-2 cursor-pointer transition-all
                            ${colorClass}
                            ${selectedClip === clip.id ? 'ring-2 ring-primary' : ''}
                          `}
                          style={{
                            left: `${(clip.startTime / totalDuration) * 100}%`,
                            width: `${(clip.duration / totalDuration) * 100}%`,
                          }}
                          onClick={() => setSelectedClip(clip.id)}
                        >
                          <span className="text-[8px] p-1 truncate block">
                            {clip.content || 'Clip'}
                          </span>
                        </div>
                      ))}

                      {/* Drop zone indicator */}
                      {track.clips.length === 0 && !track.locked && (
                        <div className="absolute inset-1 border-2 border-dashed border-border rounded flex items-center justify-center">
                          <span className="text-[10px] text-muted-foreground">
                            + Clip hinzufügen
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </ScrollArea>
        </div>

        {/* Timeline Controls */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={!selectedClip}>
              <Scissors className="h-3 w-3 mr-1" />
              Schneiden
            </Button>
            <Button size="sm" variant="outline" disabled={!selectedClip}>
              <Copy className="h-3 w-3 mr-1" />
              Duplizieren
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
