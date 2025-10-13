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
  lighting?: string;
  qualityScores?: {
    overall: number;
    shadow: number;
    color: number;
  };
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

  const getQualityBadge = (score?: number) => {
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
              
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 className="h-6 w-6 text-primary bg-background rounded-full" />
                </div>
              )}

              {isHovered && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-3 flex flex-col justify-end">
                  {scene.sceneName && (
                    <p className="text-white text-sm font-medium mb-1">{scene.sceneName}</p>
                  )}
                  {scene.sceneDescription && (
                    <p className="text-white/80 text-xs mb-2 line-clamp-2">{scene.sceneDescription}</p>
                  )}
                  
                  <div className="flex gap-2 flex-wrap">
                    {scene.qualityScores?.overall && (
                      <Badge variant={getQualityBadge(scene.qualityScores.overall)}>
                        Quality: {scene.qualityScores.overall}/100
                      </Badge>
                    )}
                    <Badge variant="outline" className="bg-black/40">
                      Variant {scene.variant}
                    </Badge>
                    {scene.theme && (
                      <Badge variant="outline" className="bg-black/40">
                        {scene.theme}
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {!isHovered && (
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-white text-xs font-medium">Variant {scene.variant}</p>
                    {scene.qualityScores?.overall && (
                      <p className={`text-xs ${getQualityColor(scene.qualityScores.overall)}`}>
                        {scene.qualityScores.overall >= 85 ? '✓ Excellent' : scene.qualityScores.overall >= 70 ? '⚠ Good' : '⚠ Fair'}
                      </p>
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
