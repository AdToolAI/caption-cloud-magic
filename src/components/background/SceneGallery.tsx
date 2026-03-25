import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Expand, FolderPlus, Check as CheckIcon } from "lucide-react";
import { useState } from "react";
import { motion } from "framer-motion";
import { Checkbox } from "@/components/ui/checkbox";

interface Scene {
  variant: number;
  imageUrl: string;
  sceneName?: string;
  sceneDescription?: string;
  theme?: string;
  category?: string;
  lighting?: string;
  cameraSetup?: string;
  seed?: number;
  qualityScores?: {
    overall: number;
    shadow: number;
    color: number;
  };
  quality?: string;
}

interface SceneGalleryProps {
  scenes: Scene[];
  selectedImages: Set<number>;
  onToggleSelection: (index: number) => void;
  onOpenLightbox?: (index: number) => void;
  onSaveToAlbum?: (index: number) => void;
  onAcceptScene?: (index: number) => void;
}

export const SceneGallery = ({ scenes, selectedImages, onToggleSelection, onOpenLightbox, onSaveToAlbum, onAcceptScene }: SceneGalleryProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getQualityGlow = (score?: number) => {
    if (!score) return "";
    if (score >= 85) return "shadow-[0_0_20px_hsla(142,76%,36%,0.3)]";
    if (score >= 70) return "shadow-[0_0_20px_hsla(43,90%,68%,0.2)]";
    return "";
  };

  const getQualityBadgeClass = (quality?: string, score?: number) => {
    if (quality === 'Excellent' || (score && score >= 85)) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (quality === 'Good' || (score && score >= 70)) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-muted/40 text-muted-foreground border-white/10";
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {scenes.map((scene, index) => {
        const isSelected = selectedImages.has(index);
        const isHovered = hoveredIndex === index;

        return (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: index * 0.08 }}
          >
            <div
              className={`relative overflow-hidden cursor-pointer rounded-xl transition-all duration-300 group
                backdrop-blur-xl bg-card/40 border
                ${isSelected 
                  ? 'border-primary/60 ring-2 ring-primary/30 ' + getQualityGlow(scene.qualityScores?.overall) 
                  : 'border-white/10 hover:border-primary/30'}
                hover:shadow-[0_0_30px_hsla(43,90%,68%,0.15)] hover:-translate-y-1`}
              onClick={() => onOpenLightbox?.(index)}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="aspect-square relative overflow-hidden rounded-t-xl">
                <img
                  src={scene.imageUrl}
                  alt={`${scene.sceneName || 'Scene'} - Variant ${scene.variant}`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                
                {/* Quality Badge - Top Left */}
                {scene.quality && (
                  <div className="absolute top-2 left-2">
                    <Badge 
                      variant="outline"
                      className={`text-[10px] backdrop-blur-md ${getQualityBadgeClass(scene.quality, scene.qualityScores?.overall)}`}
                    >
                      {scene.quality} {scene.qualityScores?.overall && `${scene.qualityScores.overall}`}
                    </Badge>
                  </div>
                )}

                {/* Selection Checkbox - Top Right */}
                <div
                  className="absolute top-2 right-2 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelection(index);
                  }}
                >
                  <div className={`h-6 w-6 rounded-md border-2 flex items-center justify-center transition-all
                    ${isSelected 
                      ? 'bg-primary border-primary shadow-[0_0_8px_hsla(43,90%,68%,0.6)]' 
                      : 'bg-black/40 border-white/40 hover:border-primary/60 backdrop-blur-sm'}`}
                  >
                    {isSelected && <CheckIcon className="h-4 w-4 text-primary-foreground" />}
                  </div>
                </div>

                {/* Action buttons on hover */}
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute bottom-2 right-2 flex gap-1.5 z-10"
                  >
                    {onSaveToAlbum && (
                      <button
                        className="p-1.5 rounded-lg bg-black/60 backdrop-blur-sm border border-white/20 hover:bg-black/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSaveToAlbum(index);
                        }}
                      >
                        <FolderPlus className="h-4 w-4 text-white" />
                      </button>
                    )}
                    {onAcceptScene && (
                      <button
                        className="px-2 py-1.5 rounded-lg bg-primary/80 backdrop-blur-sm border border-primary/40 hover:bg-primary transition-colors text-xs font-medium text-primary-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAcceptScene(index);
                        }}
                      >
                        Übernehmen
                      </button>
                    )}
                  </motion.div>
                )}

                {/* Scene Name - Bottom gradient */}
                {!isHovered && scene.sceneName && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 pt-8">
                    <p className="text-white text-xs font-medium">{scene.sceneName}</p>
                  </div>
                )}

                {/* Hover Overlay with Details */}
                {isHovered && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="absolute inset-0 bg-black/85 backdrop-blur-sm text-white p-3 flex flex-col justify-between text-xs pointer-events-none"
                  >
                    <div>
                      <p className="font-semibold mb-1">{scene.sceneName || `Scene ${index + 1}`}</p>
                      {scene.sceneDescription && (
                        <p className="text-xs opacity-90 line-clamp-2 mb-2">{scene.sceneDescription}</p>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="opacity-70">Variant:</span>
                        <span>#{scene.variant}</span>
                      </div>
                      {scene.qualityScores && (
                        <>
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">Qualität:</span>
                            <span className={scene.qualityScores.overall >= 85 ? "text-emerald-400" : scene.qualityScores.overall >= 70 ? "text-amber-400" : "text-red-400"}>
                              {scene.qualityScores.overall}/100
                            </span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">Schatten:</span>
                            <span>{scene.qualityScores.shadow}/100</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="opacity-70">Farbe:</span>
                            <span>{scene.qualityScores.color}/100</span>
                          </div>
                        </>
                      )}
                      {scene.cameraSetup && (
                        <div className="mt-2 pt-2 border-t border-white/20">
                          <span className="opacity-70 block mb-1">Camera:</span>
                          <span className="text-xs line-clamp-1">{scene.cameraSetup}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};
