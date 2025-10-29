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
  const { user, session } = useAuth();
  const navigate = useNavigate();

  // States
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string>("");
  const [mediaType, setMediaType] = useState<'image' | 'video' | null>(null);
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
          setMediaPreview(scenes[0].imageUrl);
          setMediaType('image');
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

  const handleMediaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');

    // Validate size
    const maxSize = isVideo ? 1024 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`${isVideo ? 'Video' : 'Bild'} muss unter ${isVideo ? '1' : '10'}${isVideo ? 'GB' : 'MB'} sein`);
      return;
    }

    // Validate format
    if (isVideo && !['video/mp4', 'video/quicktime'].includes(file.type)) {
      toast.error('Nur MP4 und MOV Videos werden unterstützt');
      return;
    }

    if (isImage && !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Nur JPEG, PNG und WEBP Bilder werden unterstützt');
      return;
    }

    setMediaFile(file);
    setMediaType(isVideo ? 'video' : 'image');
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setMediaPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
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
      let mediaUrl = mediaPreview;

      // Upload media if we have a file
      if (mediaFile) {
        const fileExt = mediaFile.name.split(".").pop();
        const fileName = `${user.id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("media-assets")
          .upload(fileName, mediaFile);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("media-assets").getPublicUrl(fileName);

        mediaUrl = publicUrl;
      }

      // Get current session for authentication
      if (!session) {
        toast.error("Sitzung abgelaufen. Bitte melde dich erneut an.");
        navigate("/auth");
        return;
      }

      // Call v2 edge function with authorization
      const { data, error } = await supabase.functions.invoke("generate-post-v2", {
        body: {
          brief: brief.trim(),
          mediaUrl,
          mediaType: mediaType || 'image',
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

  const handleSendToCalendar = () => {
    if (!currentDraft) return;
    
    // Get localized content
    const hooks = currentDraft.hooks;
    const caption = currentDraft.caption;
    const hashtags = currentDraft.hashtags;
    
    // Clean Markdown formatting
    const cleanHook = (hooks?.A || '').replace(/\*\*/g, '');
    const cleanCaption = (caption || '').replace(/\*\*/g, '');
    
    // Combine hook + caption + hashtags
    const fullCaption = `${cleanHook}\n\n${cleanCaption}\n\n${hashtags?.reach?.join(' ') || ''}`.trim();
    
    // Prepare prefill data
    const prefillData = {
      title: currentDraft.title || `Post vom ${new Date().toLocaleDateString('de-DE')}`,
      caption: fullCaption,
      mediaUrl: currentDraft.media_url || mediaPreview,
      mediaType: currentDraft.media_type || mediaType || 'image',
      platforms: platforms || ['instagram'],
      hashtags: hashtags?.reach || [],
      hook: cleanHook,
      timestamp: Date.now()
    };
    
    // Store in sessionStorage
    sessionStorage.setItem('calendar_prefill', JSON.stringify(prefillData));
    
    // Navigate to calendar with prefill flag
    navigate('/calendar?prefill=true');
    
    // Show success toast
    toast.success('📅 Post an Kalender gesendet - Jetzt Zeit & Details festlegen!');
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
            mediaPreview={mediaPreview}
            mediaType={mediaType}
            onMediaUpload={handleMediaUpload}
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
            mediaPreview={mediaPreview}
            mediaType={mediaType}
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
