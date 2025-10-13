import { Button } from "@/components/ui/button";
import { Download, Package, ArrowRight, Calendar } from "lucide-react";
import { toast } from "sonner";
import JSZip from "jszip";
import { useNavigate } from "react-router-dom";

interface ExportControlsProps {
  selectedImages: Set<number>;
  scenes: any[];
  onClearSelection: () => void;
}

export const ExportControls = ({ selectedImages, scenes, onClearSelection }: ExportControlsProps) => {
  const navigate = useNavigate();

  const handleDownloadSelected = async () => {
    if (selectedImages.size === 0) {
      toast.error("Bitte wählen Sie mindestens ein Bild aus");
      return;
    }

    if (selectedImages.size === 1) {
      const index = Array.from(selectedImages)[0];
      const scene = scenes[index];
      const link = document.createElement('a');
      link.href = scene.imageUrl;
      link.download = `scene-variant-${scene.variant}.png`;
      link.click();
      toast.success("Bild wird heruntergeladen");
    } else {
      // Multiple images - create ZIP
      await handleExportBundle();
    }
  };

  const handleExportBundle = async () => {
    if (selectedImages.size === 0) {
      toast.error("Bitte wählen Sie mindestens ein Bild aus");
      return;
    }

    toast.info("Bundle wird erstellt...");
    
    try {
      const zip = new JSZip();
      const folder = zip.folder("background-scenes");

      for (const index of Array.from(selectedImages)) {
        const scene = scenes[index];
        
        // Fetch image as blob
        const response = await fetch(scene.imageUrl);
        const blob = await response.blob();
        
        // Add to ZIP
        folder?.file(`variant_${scene.variant}.png`, blob);
        
        // Add metadata
        const meta = {
          variant: scene.variant,
          sceneName: scene.sceneName,
          theme: scene.theme,
          lighting: scene.lighting,
          cameraSetup: scene.cameraSetup,
          qualityScores: scene.qualityScores
        };
        folder?.file(`variant_${scene.variant}_meta.json`, JSON.stringify(meta, null, 2));
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `background-scenes-${Date.now()}.zip`;
      link.click();
      URL.revokeObjectURL(url);

      toast.success(`Bundle mit ${selectedImages.size} Szenen erstellt`);
      onClearSelection();
    } catch (error) {
      console.error('Export error:', error);
      toast.error("Fehler beim Erstellen des Bundles");
    }
  };

  const handleUseInPostGenerator = () => {
    if (selectedImages.size === 0) {
      toast.error("Bitte wählen Sie mindestens ein Bild aus");
      return;
    }
    
    // Store selected scenes in sessionStorage for the post generator
    const selectedScenes = Array.from(selectedImages).map(i => scenes[i]);
    sessionStorage.setItem('backgroundScenes', JSON.stringify(selectedScenes));
    
    navigate('/ai-post-generator');
    toast.success("Szenen an Post-Generator übergeben");
  };

  const handleSchedulePost = () => {
    if (selectedImages.size === 0) {
      toast.error("Bitte wählen Sie mindestens ein Bild aus");
      return;
    }

    const selectedScenes = Array.from(selectedImages).map(i => scenes[i]);
    sessionStorage.setItem('backgroundScenes', JSON.stringify(selectedScenes));
    
    navigate('/calendar');
    toast.success("Szenen für Kalenderplanung übergeben");
  };

  return (
    <div className="flex flex-wrap gap-2 items-center justify-between p-4 border-t bg-muted/20">
      <div className="flex gap-2">
        <Button 
          onClick={handleDownloadSelected} 
          variant="outline" 
          size="sm"
          disabled={selectedImages.size === 0}
        >
          <Download className="h-4 w-4 mr-2" />
          Ausgewählte herunterladen ({selectedImages.size})
        </Button>
        
        {selectedImages.size > 1 && (
          <Button 
            onClick={handleExportBundle} 
            variant="outline" 
            size="sm"
          >
            <Package className="h-4 w-4 mr-2" />
            Als Bundle exportieren
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={handleUseInPostGenerator} 
          variant="default" 
          size="sm"
          disabled={selectedImages.size === 0}
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          Im Post-Generator verwenden
        </Button>
        
        <Button 
          onClick={handleSchedulePost} 
          variant="secondary" 
          size="sm"
          disabled={selectedImages.size === 0}
        >
          <Calendar className="h-4 w-4 mr-2" />
          Post planen
        </Button>
      </div>
    </div>
  );
};
