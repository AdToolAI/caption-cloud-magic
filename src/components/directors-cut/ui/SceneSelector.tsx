import { motion } from 'framer-motion';
import { Globe, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { SceneAnalysis, SceneEffects } from '@/types/directors-cut';

interface SceneSelectorProps {
  scenes: SceneAnalysis[];
  selectedSceneId: string | null; // null = global
  onSceneSelect: (sceneId: string | null) => void;
  sceneEffects: Record<string, SceneEffects>;
  videoUrl: string;
}

export function SceneSelector({
  scenes,
  selectedSceneId,
  onSceneSelect,
  sceneEffects,
  videoUrl,
}: SceneSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  // Extract thumbnails from video
  useEffect(() => {
    if (!videoUrl || scenes.length === 0) return;

    const extractThumbnails = async () => {
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.preload = 'metadata';
      video.muted = true;

      video.onloadedmetadata = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const newThumbnails: Record<string, string> = {};

        for (const scene of scenes) {
          try {
            video.currentTime = scene.start_time + 0.5;
            await new Promise<void>((resolve) => {
              video.onseeked = () => resolve();
            });
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            newThumbnails[scene.id] = canvas.toDataURL('image/jpeg', 0.7);
          } catch (e) {
            console.error('Thumbnail extraction error:', e);
          }
        }

        setThumbnails(newThumbnails);
      };

      video.src = videoUrl;
    };

    extractThumbnails();
  }, [videoUrl, scenes]);

  // Check scroll state
  useEffect(() => {
    const checkScroll = () => {
      if (scrollRef.current) {
        const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
        setCanScrollLeft(scrollLeft > 0);
        setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
      }
    };
    checkScroll();
    scrollRef.current?.addEventListener('scroll', checkScroll);
    return () => scrollRef.current?.removeEventListener('scroll', checkScroll);
  }, [scenes]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 200;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  const hasCustomEffects = (sceneId: string) => {
    return sceneEffects[sceneId] && Object.keys(sceneEffects[sceneId]).length > 0;
  };

  return (
    <div className="relative">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-muted-foreground">
          Anwendungsbereich
        </h4>
        <span className="text-xs text-muted-foreground">
          {selectedSceneId ? `Szene ${scenes.findIndex(s => s.id === selectedSceneId) + 1}` : 'Alle Szenen'}
        </span>
      </div>

      {/* Scroll Container */}
      <div className="relative group">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-r from-background/90 to-transparent"
          >
            <ChevronLeft className="h-5 w-5 text-foreground" />
          </motion.button>
        )}

        {/* Scenes Carousel */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide py-2 px-1 snap-x snap-mandatory"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {/* Global Option */}
          <motion.button
            whileHover={{ scale: 1.03, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSceneSelect(null)}
            className={cn(
              "flex-shrink-0 snap-center relative rounded-xl overflow-hidden transition-all duration-300",
              "w-[120px] h-[80px]",
              "backdrop-blur-xl border",
              selectedSceneId === null
                ? "border-primary bg-primary/20 ring-2 ring-primary/50 shadow-lg shadow-primary/20"
                : "border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10"
            )}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
              <Globe className={cn(
                "h-6 w-6 transition-colors",
                selectedSceneId === null ? "text-primary" : "text-muted-foreground"
              )} />
              <span className={cn(
                "text-xs font-medium",
                selectedSceneId === null ? "text-primary" : "text-muted-foreground"
              )}>
                Global
              </span>
            </div>
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent pointer-events-none" />
          </motion.button>

          {/* Scene Thumbnails */}
          {scenes.map((scene, index) => (
            <motion.button
              key={scene.id}
              whileHover={{ scale: 1.03, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSceneSelect(scene.id)}
              className={cn(
                "flex-shrink-0 snap-center relative rounded-xl overflow-hidden transition-all duration-300",
                "w-[120px] h-[80px]",
                "backdrop-blur-xl border",
                selectedSceneId === scene.id
                  ? "border-primary ring-2 ring-primary/50 shadow-lg shadow-primary/20"
                  : "border-white/10 hover:border-white/20"
              )}
            >
              {/* Thumbnail */}
              {thumbnails[scene.id] ? (
                <img
                  src={thumbnails[scene.id]}
                  alt={`Szene ${index + 1}`}
                  className="absolute inset-0 w-full h-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-muted/50 to-muted animate-pulse" />
              )}

              {/* Overlay with scene info */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

              {/* Scene Number */}
              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                <span className="text-xs font-medium text-white">
                  Szene {index + 1}
                </span>
                <span className="text-[10px] text-white/70">
                  {(scene.end_time - scene.start_time).toFixed(1)}s
                </span>
              </div>

              {/* Custom Effects Indicator */}
              {hasCustomEffects(scene.id) && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-2 right-2"
                >
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-primary/80 backdrop-blur-sm">
                    <Sparkles className="h-3 w-3 text-primary-foreground" />
                  </div>
                </motion.div>
              )}

              {/* Selection indicator */}
              {selectedSceneId === scene.id && (
                <motion.div
                  layoutId="scene-selector-indicator"
                  className="absolute inset-0 border-2 border-primary rounded-xl pointer-events-none"
                />
              )}
            </motion.button>
          ))}
        </div>

        {/* Right Scroll Button */}
        {canScrollRight && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-l from-background/90 to-transparent"
          >
            <ChevronRight className="h-5 w-5 text-foreground" />
          </motion.button>
        )}
      </div>

      {/* Info text */}
      <p className="text-xs text-muted-foreground mt-2">
        {selectedSceneId 
          ? "Änderungen gelten nur für diese Szene"
          : "Änderungen gelten für das gesamte Video"
        }
      </p>
    </div>
  );
}
