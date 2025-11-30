import { VideoTrackScene } from '@/types/timeline';
import { cn } from '@/lib/utils';

interface VideoTrackProps {
  scenes: VideoTrackScene[];
  zoom: number;
  duration: number;
}

export function VideoTrack({ scenes, zoom, duration }: VideoTrackProps) {
  return (
    <div className="absolute inset-0 flex">
      {scenes.map((scene, index) => {
        const left = scene.startTime * zoom;
        const width = (scene.endTime - scene.startTime) * zoom;
        
        // Alternate colors for visual distinction
        const colors = [
          'bg-indigo-500/30',
          'bg-purple-500/30',
          'bg-blue-500/30',
          'bg-cyan-500/30',
        ];
        
        return (
          <div
            key={scene.id}
            className={cn(
              "absolute h-full border-r border-border/50 overflow-hidden",
              colors[index % colors.length]
            )}
            style={{ left, width }}
            title={scene.name}
          >
            {/* Thumbnail */}
            {scene.thumbnailUrl && (
              <div 
                className="absolute inset-0 bg-cover bg-center opacity-60"
                style={{ backgroundImage: `url(${scene.thumbnailUrl})` }}
              />
            )}
            
            {/* Scene Label */}
            <div className="relative z-10 h-full flex items-center px-2">
              <div className="text-[10px] font-medium text-foreground/80 truncate">
                {width > 50 && scene.name}
              </div>
            </div>
            
            {/* Scene Number Badge */}
            <div className="absolute top-1 left-1 bg-black/50 text-white text-[9px] px-1 rounded">
              {index + 1}
            </div>
          </div>
        );
      })}
      
      {/* Fill remaining space if scenes don't cover full duration */}
      {scenes.length > 0 && scenes[scenes.length - 1].endTime < duration && (
        <div 
          className="absolute h-full bg-muted/20"
          style={{ 
            left: scenes[scenes.length - 1].endTime * zoom,
            width: (duration - scenes[scenes.length - 1].endTime) * zoom
          }}
        />
      )}
    </div>
  );
}
