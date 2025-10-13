import { Button } from "@/components/ui/button";
import { Download, FileImage, FileText, Package } from "lucide-react";
import { toast } from "sonner";

interface ExportBundleProps {
  onExportPNG: () => void;
  onExportPDF: () => void;
  onExportBundle: () => void;
  isPro: boolean;
}

export const ExportBundle = ({ onExportPNG, onExportPDF, onExportBundle, isPro }: ExportBundleProps) => {
  const handleExport = (type: string, callback: () => void) => {
    if (!isPro && type !== "png") {
      toast.error("🔒 Diese Funktion ist nur für Pro-Nutzer verfügbar");
      return;
    }
    callback();
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button 
        onClick={() => handleExport("png", onExportPNG)} 
        variant="outline" 
        size="sm"
        className="gap-2"
      >
        <FileImage className="h-4 w-4" />
        PNG exportieren
      </Button>
      
      <Button 
        onClick={() => handleExport("pdf", onExportPDF)} 
        variant="outline" 
        size="sm"
        className="gap-2"
      >
        <FileText className="h-4 w-4" />
        PDF exportieren
        {!isPro && " 🔒"}
      </Button>
      
      <Button 
        onClick={() => handleExport("bundle", onExportBundle)} 
        variant="default" 
        size="sm"
        className="gap-2"
      >
        <Package className="h-4 w-4" />
        Bundle exportieren
        {!isPro && " 🔒"}
      </Button>
    </div>
  );
};