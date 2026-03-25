import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { X, GripVertical } from "lucide-react";

interface Scene {
  variant: number;
  imageUrl: string;
  sceneName?: string;
  sceneDescription?: string;
  cameraSetup?: string;
  seed?: number;
  qualityScores?: {
    overall: number;
    shadow: number;
    color: number;
  };
  quality?: string;
}

interface ImageLightboxProps {
  scene: Scene;
  cutoutPreview: string;
  open: boolean;
  onClose: () => void;
}

export function ImageLightbox({ scene, cutoutPreview, open, onClose }: ImageLightboxProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handlePointerDown = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handlePointerUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    setSliderPos(Math.max(5, Math.min(95, x)));
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (open) window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const getQualityColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 85) return "text-emerald-400";
    if (score >= 70) return "text-amber-400";
    return "text-red-400";
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="relative max-w-4xl w-full mx-4 flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="absolute -top-12 right-0 text-white/70 hover:text-white hover:bg-white/10 z-10"
            >
              <X className="h-6 w-6" />
            </Button>

            {/* Before/After Slider */}
            <div
              ref={containerRef}
              className="relative aspect-square max-h-[70vh] rounded-xl overflow-hidden cursor-col-resize select-none"
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* After (full image behind) */}
              <img
                src={scene.imageUrl}
                alt="Generated"
                className="absolute inset-0 w-full h-full object-contain bg-black"
                draggable={false}
              />

              {/* Before (cutout, clipped) */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
              >
                <img
                  src={cutoutPreview}
                  alt="Original cutout"
                  className="w-full h-full object-contain bg-[#1a1a2e]"
                  draggable={false}
                />
              </div>

              {/* Slider handle */}
              <div
                className="absolute top-0 bottom-0 z-10 flex items-center"
                style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
                onPointerDown={handlePointerDown}
              >
                <div className="w-0.5 h-full bg-white/80" />
                <div className="absolute top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-white/90 shadow-lg cursor-grab active:cursor-grabbing">
                  <GripVertical className="h-4 w-4 text-black" />
                </div>
              </div>

              {/* Labels */}
              <div className="absolute top-3 left-3 z-10">
                <Badge variant="outline" className="bg-black/60 text-white border-white/20 text-xs">
                  Vorher
                </Badge>
              </div>
              <div className="absolute top-3 right-3 z-10">
                <Badge variant="outline" className="bg-black/60 text-white border-white/20 text-xs">
                  Nachher
                </Badge>
              </div>
            </div>

            {/* Metadata panel */}
            <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm text-white">
              <div>
                <p className="text-white/50 text-xs">Szene</p>
                <p className="font-medium">{scene.sceneName || `Variant ${scene.variant}`}</p>
              </div>
              {scene.cameraSetup && (
                <div>
                  <p className="text-white/50 text-xs">Kamera</p>
                  <p className="font-medium text-xs">{scene.cameraSetup}</p>
                </div>
              )}
              {scene.qualityScores && (
                <>
                  <div>
                    <p className="text-white/50 text-xs">Qualität</p>
                    <p className={`font-bold ${getQualityColor(scene.qualityScores.overall)}`}>
                      {scene.qualityScores.overall}/100
                    </p>
                  </div>
                  <div className="flex gap-4">
                    <div>
                      <p className="text-white/50 text-xs">Schatten</p>
                      <p className="font-medium">{scene.qualityScores.shadow}/100</p>
                    </div>
                    <div>
                      <p className="text-white/50 text-xs">Farbe</p>
                      <p className="font-medium">{scene.qualityScores.color}/100</p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
