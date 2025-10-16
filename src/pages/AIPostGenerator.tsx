import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PostInputPanel } from "@/components/post-generator/PostInputPanel";
import { PreviewTabs } from "@/components/post-generator/PreviewTabs";

export default function AIPostGenerator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  // States
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [brief, setBrief] = useState("");
  const [platforms, setPlatforms] = useState<string[]>(["instagram"]);
  const [stylePreset, setStylePreset] = useState("clean");
  const [languages, setLanguages] = useState<string[]>(["de"]);
  const [tone, setTone] = useState("friendly");
  const [ctaInput, setCTAInput] = useState("");
  const [brandKits, setBrandKits] = useState<any[]>([]);
  const [selectedBrandKit, setSelectedBrandKit] = useState<string>("default");
  const [options, setOptions] = useState({
    localize: false,
    brandFidelity: 80,
    abVariant: false,
    altText: false,
    utm: false,
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentDraft, setCurrentDraft] = useState<any>(null);

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  useEffect(() => {
    if (user) {
      fetchBrandKits();
    }

    // Check for background scenes from BackgroundReplacer
    const scenesData = sessionStorage.getItem('backgroundScenes');
    if (scenesData) {
      try {
        const scenes = JSON.parse(scenesData);
        if (scenes.length > 0) {
          // Use first scene image
          setImagePreview(scenes[0].imageUrl);
          // Pre-fill brief from scene
          if (scenes[0].sceneName) {
            setBrief(`Produktfoto mit ${scenes[0].sceneName} Hintergrund`);
          }
          toast.success("✅ Bild aus KI-Hintergrund-Ersteller übernommen");
          sessionStorage.removeItem('backgroundScenes');
        }
      } catch (e) {
        console.error('Error loading background scenes:', e);
      }
    }
  }, [user]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Bild muss unter 10MB sein");
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePlatformToggle = (platform: string) => {
    setPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform]
    );
  };

  const handleLanguageToggle = (language: string) => {
    setLanguages((prev) =>
      prev.includes(language) ? prev.filter((l) => l !== language) : [...prev, language]
    );
  };

  const handleGenerate = async () => {
    if (!user) {
      toast.error("Bitte melde dich an, um Posts zu generieren");
      navigate("/auth");
      return;
    }

    if (!brief.trim()) {
      toast.error("Bitte gib eine Kurzbeschreibung ein");
      return;
    }

    if (platforms.length === 0) {
      toast.error("Bitte wähle mindestens eine Plattform");
      return;
    }

    setIsGenerating(true);

    try {
      let imageUrl = imagePreview;

      // Upload image if we have a file
      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("image-captions")
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("image-captions").getPublicUrl(fileName);

        imageUrl = publicUrl;
      }

      // Get current session for authentication
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error("Sitzung abgelaufen. Bitte melde dich erneut an.");
        navigate("/auth");
        return;
      }

      // Call v2 edge function with authorization
      const { data, error } = await supabase.functions.invoke("generate-post-v2", {
        body: {
          brief: brief.trim(),
          imageUrl,
          platforms,
          languages,
          stylePreset,
          toneOverride: tone,
          brandKitId: selectedBrandKit === "default" ? null : selectedBrandKit,
          ctaInput: ctaInput.trim(),
          options,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      setCurrentDraft(data.draft);
      toast.success("Post erfolgreich generiert! 🎉");
    } catch (error: any) {
      console.error("Generation error:", error);
      let errorMessage = "Fehler beim Generieren des Posts";

      if (error.message?.includes("non-2xx")) {
        errorMessage = "Server-Fehler. Bitte versuche es erneut.";
      } else if (error.message) {
        errorMessage = error.message;
      }

      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyCaption = () => {
    if (!currentDraft) return;
    const { hooks, caption, hashtags } = currentDraft;
    const fullCaption = `${hooks.A}\n\n${caption}\n\n${hashtags.reach.join(" ")}`;
    navigator.clipboard.writeText(fullCaption);
    toast.success("Caption in Zwischenablage kopiert! 📋");
  };

  const handleExportZip = async () => {
    if (!currentDraft) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('export-post-bundle', {
        body: { draftId: currentDraft.id }
      });

      if (error) throw error;

      // Download ZIP
      if (data?.url) {
        const link = document.createElement('a');
        link.href = data.url;
        link.download = data.fileName || 'post-export.zip';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        toast.success("✅ ZIP-Bundle wurde heruntergeladen");
      }
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(`Export fehlgeschlagen: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendToCalendar = async () => {
    if (!currentDraft) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('schedule-post-with-ab', {
        body: { 
          draftId: currentDraft.id,
          platforms: platforms,
          useAB: options.abVariant
        }
      });

      if (error) throw error;

      toast.success(data?.message || "✅ Post wurde zum Kalender hinzugefügt");
      
      // Navigate to calendar after short delay
      setTimeout(() => {
        navigate('/calendar');
      }, 1500);
    } catch (error: any) {
      console.error('Schedule error:', error);
      toast.error(`Planung fehlgeschlagen: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendToReview = () => {
    toast.info("Freigabe-Workflow kommt bald - Benötigt Team-Workspace 👥");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature="KI-Post-Generator v2" />

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">KI-Post-Generator v2 🚀</h1>
          <p className="text-muted-foreground">
            Agentur-Level Posts mit Hook-Optimierung, Brand-Sync & A/B-Planung
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Panel (Links) */}
          <PostInputPanel
            brief={brief}
            setBrief={setBrief}
            imagePreview={imagePreview}
            onImageUpload={handleImageUpload}
            platforms={platforms}
            onPlatformToggle={handlePlatformToggle}
            stylePreset={stylePreset}
            setStylePreset={setStylePreset}
            languages={languages}
            onLanguageToggle={handleLanguageToggle}
            tone={tone}
            setTone={setTone}
            brandKits={brandKits}
            selectedBrandKit={selectedBrandKit}
            setSelectedBrandKit={setSelectedBrandKit}
            ctaInput={ctaInput}
            setCTAInput={setCTAInput}
            options={options}
            setOptions={setOptions}
            onGenerate={handleGenerate}
            isGenerating={isGenerating}
          />

          {/* Preview Panel (Rechts) */}
          <PreviewTabs
            draft={currentDraft}
            imagePreview={imagePreview}
            onCopyCaption={handleCopyCaption}
            onExportZip={handleExportZip}
            onSendToCalendar={handleSendToCalendar}
            onSendToReview={handleSendToReview}
          />
        </div>
      </main>

      <Footer />
    </div>
  );
}
