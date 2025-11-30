import { useDroppable } from '@dnd-kit/core';
import { AudioTrack } from '@/types/timeline';
import { AudioClipComponent } from './AudioClipComponent';
import { cn } from '@/lib/utils';

interface AudioTrackRowProps {
  track: AudioTrack;
  zoom: number;
  duration: number;
  selectedClipId: string | null;
  onClipSelect: (clipId: string | null) => void;
  onClipResize: (clipId: string, newDuration: number, edge: 'start' | 'end') => void;
  onClipDelete: (clipId: string) => void;
  onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export function AudioTrackRow({
  track,
  zoom,
  duration,
  selectedClipId,
  onClipSelect,
  onClipResize,
  onClipDelete,
  onClick,
}: AudioTrackRowProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: track.id,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "h-14 border-b relative cursor-pointer transition-colors",
        track.muted && "opacity-50",
        isOver && "bg-accent/30"
      )}
      onClick={onClick}
      style={{ 
        backgroundColor: isOver ? undefined : `${track.color}08`,
      }}
    >
      {/* Grid lines for visual reference */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: Math.ceil(duration) }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 w-px bg-border/30"
            style={{ left: `${i * zoom}px` }}
          />
        ))}
      </div>
      
      {/* Audio Clips */}
      {track.clips.map(clip => (
        <AudioClipComponent
          key={clip.id}
          clip={clip}
          trackColor={track.color}
          zoom={zoom}
          isSelected={selectedClipId === clip.id}
          onSelect={() => onClipSelect(clip.id)}
          onResize={(duration, edge) => onClipResize(clip.id, duration, edge)}
          onDelete={() => onClipDelete(clip.id)}
        />
      ))}
      
      {/* Drop indicator */}
      {isOver && (
        <div className="absolute inset-0 border-2 border-dashed border-primary/50 rounded pointer-events-none" />
      )}
    </div>
  );
}
