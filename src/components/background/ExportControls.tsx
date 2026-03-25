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
        const response = await fetch(scene.imageUrl);
        const blob = await response.blob();
        folder?.file(`variant_${scene.variant}.png`, blob);
        
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
    <div className="flex flex-wrap gap-2 items-center justify-between p-4 border-t border-white/10 backdrop-blur-xl bg-card/40">
      <div className="flex gap-2">
        <Button 
          onClick={handleDownloadSelected} 
          variant="outline" 
          size="sm"
          disabled={selectedImages.size === 0}
          className="relative overflow-hidden group border-white/10 bg-card/40 hover:border-primary/40"
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <Download className="h-4 w-4 mr-2" />
          Download ({selectedImages.size})
        </Button>
        
        {selectedImages.size > 1 && (
          <Button 
            onClick={handleExportBundle} 
            variant="outline" 
            size="sm"
            className="relative overflow-hidden group border-white/10 bg-card/40 hover:border-primary/40"
          >
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
            <Package className="h-4 w-4 mr-2" />
            ZIP Bundle
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <Button 
          onClick={handleUseInPostGenerator} 
          size="sm"
          disabled={selectedImages.size === 0}
          className="relative overflow-hidden group bg-gradient-to-r from-primary to-amber-500 border-0 hover:from-primary/90 hover:to-amber-500/90"
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <ArrowRight className="h-4 w-4 mr-2" />
          Post-Generator
        </Button>
        
        <Button 
          onClick={handleSchedulePost} 
          variant="secondary" 
          size="sm"
          disabled={selectedImages.size === 0}
          className="relative overflow-hidden group"
        >
          <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <Calendar className="h-4 w-4 mr-2" />
          Post planen
        </Button>
      </div>
    </div>
  );
};
