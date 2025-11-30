import { useMemo } from 'react';

interface TimelineRulerProps {
  duration: number;
  zoom: number;
}

export function TimelineRuler({ duration, zoom }: TimelineRulerProps) {
  // Calculate tick marks based on zoom level
  const ticks = useMemo(() => {
    const result: { time: number; major: boolean }[] = [];
    
    // Determine tick interval based on zoom
    let majorInterval: number;
    let minorInterval: number;
    
    if (zoom >= 80) {
      majorInterval = 1; // 1 second major ticks
      minorInterval = 0.25; // 0.25 second minor ticks
    } else if (zoom >= 40) {
      majorInterval = 5;
      minorInterval = 1;
    } else if (zoom >= 20) {
      majorInterval = 10;
      minorInterval = 2;
    } else if (zoom >= 10) {
      majorInterval = 30;
      minorInterval = 5;
    } else {
      majorInterval = 60;
      minorInterval = 10;
    }
    
    for (let t = 0; t <= duration; t += minorInterval) {
      const isMajor = t % majorInterval === 0;
      result.push({ time: t, major: isMajor });
    }
    
    return result;
  }, [duration, zoom]);
  
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    return `${secs}s`;
  };

  return (
    <div className="h-8 border-b bg-muted/30 relative select-none">
      {ticks.map(({ time, major }) => (
        <div
          key={time}
          className="absolute top-0"
          style={{ left: `${time * zoom}px` }}
        >
          {/* Tick Mark */}
          <div 
            className={`w-px bg-border ${major ? 'h-4' : 'h-2'}`}
          />
          
          {/* Label for major ticks */}
          {major && (
            <div className="absolute top-4 left-0 -translate-x-1/2 text-[10px] text-muted-foreground whitespace-nowrap">
              {formatTime(time)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
