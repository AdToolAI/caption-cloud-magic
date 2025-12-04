import { ReactNode, useState } from 'react';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';
import { DirectorsCutPreviewPlayer } from '../DirectorsCutPreviewPlayer';
import { SceneSelector } from './SceneSelector';
import type { 
  SceneAnalysis, 
  GlobalEffects, 
  SceneEffects, 
  TransitionAssignment,
  AudioEnhancements,
  TextOverlay 
} from '@/types/directors-cut';
import type { KenBurnsKeyframe } from '../features/KenBurnsEffect';

interface StepLayoutWrapperProps {
  videoUrl: string;
  videoDuration: number;
  scenes: SceneAnalysis[];
  selectedSceneId: string | null;
  onSceneSelect: (sceneId: string | null) => void;
  globalEffects: GlobalEffects;
  sceneEffects: Record<string, SceneEffects>;
  transitions: TransitionAssignment[];
  audio: AudioEnhancements;
  title: string;
  description: string;
  icon: LucideIcon;
  children: ReactNode;
  showSceneSelector?: boolean;
  // Additional effect props for large preview
  colorGrading?: { enabled: boolean; grade: string | null; intensity?: number };
  sceneColorGrading?: Record<string, { grade?: string | null; intensity?: number }>;
  styleTransfer?: { enabled: boolean; style: string | null };
  speedKeyframes?: { time: number; speed: number; sceneId?: string }[];
  chromaKey?: { enabled: boolean; color: string; tolerance: number };
  textOverlays?: TextOverlay[];
  kenBurns?: KenBurnsKeyframe[];
  voiceoverUrl?: string;
  backgroundMusicUrl?: string;
}

export function StepLayoutWrapper({
  videoUrl,
  videoDuration,
  scenes,
  selectedSceneId,
  onSceneSelect,
  globalEffects,
  sceneEffects,
  transitions,
  audio,
  title,
  description,
  icon: Icon,
  children,
  showSceneSelector = true,
  colorGrading,
  sceneColorGrading,
  styleTransfer,
  speedKeyframes,
  chromaKey,
  textOverlays,
  kenBurns,
  voiceoverUrl,
  backgroundMusicUrl,
}: StepLayoutWrapperProps) {
  const [currentTime, setCurrentTime] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header with glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-4"
      >
        <div className="p-3 rounded-xl bg-primary/10 backdrop-blur-sm border border-primary/20">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </motion.div>

      {/* Large Preview Player */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative rounded-2xl overflow-hidden backdrop-blur-xl bg-black/20 border border-white/10"
      >
        <div className="rounded-xl overflow-hidden bg-black/20 border border-border/50">
          <DirectorsCutPreviewPlayer
            videoUrl={videoUrl}
            scenes={scenes}
            effects={globalEffects}
            sceneEffects={sceneEffects}
            transitions={transitions}
            audio={audio}
            duration={videoDuration}
            currentTime={currentTime}
            onTimeUpdate={(time) => setCurrentTime(time)}
            colorGrading={colorGrading ? { ...colorGrading, intensity: colorGrading.intensity ?? 0.7 } : undefined}
            sceneColorGrading={sceneColorGrading}
            styleTransfer={styleTransfer ? { ...styleTransfer, intensity: (styleTransfer as any).intensity ?? 0.7 } : undefined}
            speedKeyframes={speedKeyframes}
            chromaKey={chromaKey}
            textOverlays={textOverlays}
            kenBurns={kenBurns}
            voiceoverUrl={voiceoverUrl}
            backgroundMusicUrl={backgroundMusicUrl}
          />
        </div>
        
        {/* Current scene overlay */}
        {selectedSceneId && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-primary/80 backdrop-blur-sm text-primary-foreground text-sm font-medium"
          >
            Szene {scenes.findIndex(s => s.id === selectedSceneId) + 1}
          </motion.div>
        )}
      </motion.div>

      {/* Scene Selector */}
      {showSceneSelector && scenes.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="p-4 rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10"
        >
          <SceneSelector
            scenes={scenes}
            selectedSceneId={selectedSceneId}
            onSceneSelect={onSceneSelect}
            sceneEffects={sceneEffects}
            videoUrl={videoUrl}
          />
        </motion.div>
      )}

      {/* Step-specific content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        {children}
      </motion.div>
    </div>
  );
}
