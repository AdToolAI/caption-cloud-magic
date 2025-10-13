import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Download } from "lucide-react";
import { useState } from "react";

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
}

export const SceneGallery = ({ scenes, selectedImages, onToggleSelection }: SceneGalleryProps) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const getQualityColor = (score?: number) => {
    if (!score) return "text-muted-foreground";
    if (score >= 85) return "text-success";
    if (score >= 70) return "text-warning";
    return "text-destructive";
  };

  const getQualityBadge = (quality?: string, score?: number) => {
    if (quality === 'Excellent') return "default";
    if (quality === 'Good') return "secondary";
    if (!score) return "secondary";
    if (score >= 85) return "default";
    if (score >= 70) return "secondary";
    return "outline";
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {scenes.map((scene, index) => {
        const isSelected = selectedImages.has(index);
        const isHovered = hoveredIndex === index;

        return (
          <Card
            key={index}
            className={`relative overflow-hidden cursor-pointer transition-all ${
              isSelected ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => onToggleSelection(index)}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <div className="aspect-square relative">
              <img
                src={scene.imageUrl}
                alt={`${scene.sceneName || 'Scene'} - Variant ${scene.variant}`}
                className="w-full h-full object-cover"
              />
              
              {/* Quality Badge - Top Left */}
              {scene.quality && (
                <div className="absolute top-2 left-2">
                  <Badge variant={getQualityBadge(scene.quality, scene.qualityScores?.overall)}>
                    {scene.quality}
                  </Badge>
                </div>
              )}

              {/* Selection Indicator - Top Right */}
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-6 w-6 text-primary bg-background rounded-full" />
                </div>
              )}

              {/* Scene Name - Bottom */}
              {!isHovered && scene.sceneName && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-white text-xs font-medium">{scene.sceneName}</p>
                </div>
              )}

              {/* Hover Overlay with Details */}
              {isHovered && (
                <div className="absolute inset-0 bg-black/85 text-white p-3 flex flex-col justify-between text-xs transition-opacity">
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
                          <span className="opacity-70">Quality:</span>
                          <span className={getQualityColor(scene.qualityScores.overall)}>
                            {scene.qualityScores.overall}/100
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="opacity-70">Shadow:</span>
                          <span>{scene.qualityScores.shadow}/100</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="opacity-70">Color:</span>
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
                    {scene.seed && (
                      <div className="flex items-center justify-between text-xs opacity-60">
                        <span>Seed:</span>
                        <span>{scene.seed}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
