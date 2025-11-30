import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { SceneAnalysis } from '@/types/directors-cut';

interface SceneThumbnailBarProps {
  scenes: SceneAnalysis[];
  currentTime: number;
  videoDuration: number;
  onSceneClick: (time: number) => void;
  selectedSceneId: string | null;
  onSceneSelect: (id: string | null) => void;
}

export function SceneThumbnailBar({
  scenes,
  currentTime,
  videoDuration,
  onSceneClick,
  selectedSceneId,
  onSceneSelect,
}: SceneThumbnailBarProps) {
  const getCurrentSceneIndex = () => {
    return scenes.findIndex(s => currentTime >= s.start_time && currentTime < s.end_time);
  };

  const currentSceneIndex = getCurrentSceneIndex();

  return (
    <div className="h-20 bg-card/80 backdrop-blur-xl border-t flex items-center gap-1.5 px-3 overflow-x-auto scrollbar-thin scrollbar-thumb-muted">
      {scenes.map((scene, index) => {
        const duration = scene.end_time - scene.start_time;
        const minWidth = 48;
        const maxWidth = 120;
        const width = Math.min(maxWidth, Math.max(minWidth, duration * 8));
        const isCurrentScene = index === currentSceneIndex;
        const isSelected = scene.id === selectedSceneId;

        return (
          <motion.div
            key={scene.id}
            className={cn(
              "h-14 rounded-lg cursor-pointer border-2 overflow-hidden flex-shrink-0 relative group",
              isCurrentScene && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              isSelected ? "border-primary" : "border-transparent hover:border-muted-foreground/50"
            )}
            style={{ width }}
            onClick={() => {
              onSceneClick(scene.start_time);
              onSceneSelect(scene.id);
            }}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
          >
            {/* Thumbnail or Placeholder */}
            {scene.thumbnail_url ? (
              <img 
                src={scene.thumbnail_url} 
                alt={scene.description}
                className="w-full h-full object-cover"
              />
            ) : (
              <div 
                className={cn(
                  "w-full h-full flex items-center justify-center",
                  [
                    "bg-gradient-to-br from-indigo-500/30 to-purple-500/30",
                    "bg-gradient-to-br from-blue-500/30 to-cyan-500/30",
                    "bg-gradient-to-br from-emerald-500/30 to-teal-500/30",
                    "bg-gradient-to-br from-amber-500/30 to-orange-500/30",
                  ][index % 4]
                )}
              >
                <span className="text-lg font-bold text-foreground/80">{index + 1}</span>
              </div>
            )}

            {/* Scene Number Badge */}
            <div className="absolute top-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-medium">
              {index + 1}
            </div>

            {/* Duration Badge */}
            <div className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] px-1 py-0.5 rounded font-mono">
              {duration.toFixed(1)}s
            </div>

            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
              <span className="text-[10px] text-white font-medium px-1 bg-black/50 rounded truncate max-w-full">
                {scene.description?.slice(0, 20)}...
              </span>
            </div>

            {/* Playing Indicator */}
            {isCurrentScene && (
              <motion.div 
                className="absolute inset-0 border-2 border-primary rounded-lg"
                layoutId="currentScene"
              />
            )}
          </motion.div>
        );
      })}

      {/* Add Scene Placeholder */}
      <motion.div
        className="h-14 w-12 rounded-lg border-2 border-dashed border-muted-foreground/30 flex-shrink-0 flex items-center justify-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="text-xl text-muted-foreground/50">+</span>
      </motion.div>
    </div>
  );
}
