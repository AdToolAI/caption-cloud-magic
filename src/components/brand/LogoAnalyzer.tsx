import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Eye, Palette, Type, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LogoAnalyzerProps {
  onAnalysisComplete: (analysis: any) => void;
}

export function LogoAnalyzer({ onAnalysisComplete }: LogoAnalyzerProps) {
  const { toast } = useToast();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Datei zu groß",
        description: "Logo muss kleiner als 5MB sein",
        variant: "destructive"
      });
      return;
    }

    setLogoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setLogoPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!logoFile || !logoPreview) return;

    setIsAnalyzing(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Upload logo
      const fileExt = logoFile.name.split('.').pop();
      const filePath = `${user.id}/temp-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('brand-logos')
        .upload(filePath, logoFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('brand-logos')
        .getPublicUrl(filePath);

      // Call edge function for analysis (moved to backend for security)
      const { data: analysisData, error: analysisError } = await supabase.functions.invoke('analyze-logo', {
        body: { logoUrl: publicUrl }
      });

      if (analysisError) throw analysisError;
      const logoAnalysis = analysisData.analysis;
      logoAnalysis.logoUrl = publicUrl;
      setAnalysis(logoAnalysis);
      onAnalysisComplete(logoAnalysis);

      toast({
        title: "Logo analysiert! 🎨",
        description: "KI hat dein Logo ausgewertet",
        duration: 4000
      });

    } catch (error: any) {
      console.error('Logo analysis error:', error);
      toast({
        title: "Analyse fehlgeschlagen",
        description: error.message || "Konnte Logo nicht analysieren",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <Card className="border-2 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Eye className="h-5 w-5" />
          KI Logo-Analyse
        </CardTitle>
        <CardDescription>
          Lade dein Logo hoch und lass die KI Farben, Stil & Stimmung extrahieren
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!logoPreview ? (
          <label 
            htmlFor="logo-upload" 
            className="flex flex-col items-center justify-center h-48 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors hover:bg-muted/30"
          >
            <Upload className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Logo hochladen</p>
            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG • Max 5MB</p>
            <input
              id="logo-upload"
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/svg+xml"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        ) : (
          <div className="space-y-4">
            <div className="relative w-full h-48 border rounded-lg overflow-hidden bg-muted/30">
              <img 
                src={logoPreview} 
                alt="Logo preview" 
                className="w-full h-full object-contain p-4" 
              />
            </div>

            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing}
              className="w-full"
              size="lg"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analysiere Logo...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Mit KI analysieren
                </>
              )}
            </Button>

            {analysis && (
              <div className="space-y-4 pt-4 border-t animate-fade-in">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Palette className="h-4 w-4" />
                    <p className="text-sm font-medium">Extrahierte Farben</p>
                  </div>
                  <div className="flex gap-2">
                    {analysis.colors?.palette?.map((color: string, idx: number) => (
                      <div key={idx} className="flex flex-col items-center gap-1">
                        <div
                          className="w-12 h-12 rounded-lg border-2"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-mono">{color}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Type className="h-4 w-4" />
                    <p className="text-sm font-medium">Font-Empfehlungen</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm">
                      <span className="text-muted-foreground">Headlines:</span> {analysis.typography_suggestions?.headline}
                    </p>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Body:</span> {analysis.typography_suggestions?.body}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Stil & Charakter</p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{analysis.style}</Badge>
                    <Badge variant="secondary">{analysis.mood}</Badge>
                    {analysis.emotions?.map((emotion: string, idx: number) => (
                      <Badge key={idx} variant="outline">{emotion}</Badge>
                    ))}
                  </div>
                </div>

                {analysis.character && (
                  <p className="text-sm text-muted-foreground italic border-l-2 border-primary pl-3">
                    {analysis.character}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}