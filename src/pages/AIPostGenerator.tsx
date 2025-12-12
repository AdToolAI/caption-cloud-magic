import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Footer } from "@/components/Footer";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PostInputPanel } from "@/components/post-generator/PostInputPanel";
import { PreviewTabs } from "@/components/post-generator/PreviewTabs";
import { PostGeneratorHeroHeader } from "@/components/post-generator/PostGeneratorHeroHeader";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Crown } from "lucide-react";

export default function AIPostGenerator() {
  const { t } = useTranslation();
  const { user, session } = useAuth();
  const navigate = useNavigate();

  // States
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
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
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<any>(null);
  const [autoSaveToLibrary, setAutoSaveToLibrary] = useState<boolean>(() => {
    return localStorage.getItem('ai-post-auto-save') === 'true';
  });

  // Load workspace ID
  useEffect(() => {
    const loadWorkspace = async () => {
      if (!user) return;
      
      const { data } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      
      if (data) setWorkspaceId(data.workspace_id);
    };
    
    loadWorkspace();
  }, [user]);

  const fetchBrandKits = async () => {
    const { data } = await supabase
      .from('brand_kits')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setBrandKits(data);
  };

  // Load from sessionStorage if coming from background replacer
  useEffect(() => {
    const savedMedia = sessionStorage.getItem('bg_replacer_media');
    const savedBrief = sessionStorage.getItem('bg_replacer_brief');
    
    if (savedMedia) {
      setMediaPreview(savedMedia);
      setMediaType('image');
      sessionStorage.removeItem('bg_replacer_media');
    }
    
    if (savedBrief) {
      setBrief(savedBrief);
      sessionStorage.removeItem('bg_replacer_brief');
    }

    // Load media import from Media Library
    const mediaImport = sessionStorage.getItem('generator_media_import');
    if (mediaImport) {
      try {
        const data = JSON.parse(mediaImport);
        
        // Check expiry (5 minutes)
        if (Date.now() - data.timestamp < 5 * 60 * 1000) {
          setMediaPreview(data.mediaUrl);
          setMediaType(data.mediaType);
          
          toast.success("✅ Media aus Media Library importiert");
        }
        
        sessionStorage.removeItem('generator_media_import');
      } catch (e) {
        console.error('Error loading media import:', e);
      }
    }
  }, []);

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
          workspaceId,
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
          saveToLibrary: false,
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) throw error;

      console.log("✅ Post generated successfully:", {
        draft_id: data.draft?.id,
        workspace_id: workspaceId,
        media_type: data.draft?.media_type,
        auto_save_enabled: autoSaveToLibrary
      });

      setCurrentDraft(data.draft);
      setPendingDraft(data.draft);
      
      // Auto-save if enabled, otherwise show dialog
      if (autoSaveToLibrary) {
        console.log("🔵 Auto-save aktiviert - Speichere automatisch...");
        await handleSaveToLibrary(data.draft);
      } else {
        console.log("🔵 Dialog öffnen - User entscheidet...");
        setShowSaveDialog(true);
        toast.info("💾 Möchtest du diesen Post speichern?", {
          description: "Wähle eine Option im Dialog",
          duration: 5000
        });
      }
      
      toast.success("Post generiert! 🎉");
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

  // Helper function to get exact file size via HEAD request
  const getMediaFileSize = async (url: string, mediaType: string): Promise<number> => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const sizeBytes = parseInt(response.headers.get('content-length') || '0');
      return sizeBytes / (1024 * 1024);
    } catch (error) {
      console.error('Failed to get file size:', error);
      return mediaType === 'video' ? 20 : 2;
    }
  };

  const handleSaveToLibrary = async (draft = pendingDraft) => {
    console.log("🔵 handleSaveToLibrary aufgerufen", {
      has_draft: !!draft,
      state_workspace_id: workspaceId,
      has_user: !!user
    });
    
    if (!draft) {
      console.error("❌ Kein Draft zum Speichern");
      toast.error("Kein Draft zum Speichern");
      return;
    }
    
    let targetWorkspaceId = workspaceId;
    
    if (!targetWorkspaceId && user) {
      console.log("⚠️ workspaceId fehlt im State, lade aus DB...");
      const { data, error: wsError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      
      if (wsError) {
        console.error("❌ Fehler beim Laden der Workspace ID:", wsError);
        toast.error("Workspace konnte nicht geladen werden");
        return;
      }
      
      if (data) {
        targetWorkspaceId = data.workspace_id;
        setWorkspaceId(targetWorkspaceId);
        console.log("✅ Workspace ID aus DB geladen:", targetWorkspaceId);
      }
    }
    
    if (!targetWorkspaceId) {
      console.error("❌ Keine Workspace ID gefunden");
      toast.error("Keine Workspace-Daten gefunden");
      return;
    }
    
    const toastId = toast.loading("Speichere in Media Library...");
    
    try {
      const fileSizeMB = await getMediaFileSize(draft.media_url, draft.media_type);
      
      console.log("🔵 Versuche zu speichern:", {
        workspace_id: targetWorkspaceId,
        type: draft.media_type === 'video' ? 'video' : 'image',
        has_caption: !!draft.caption,
        source_id: draft.id,
        file_size_mb: fileSizeMB
      });

      const { error } = await supabase
        .from('content_items')
        .insert({
          workspace_id: targetWorkspaceId,
          type: draft.media_type === 'video' ? 'video' : 'image',
          title: draft.brief?.slice(0, 100) || 'KI-generierter Post',
          caption: draft.caption,
          thumb_url: draft.media_url,
          targets: draft.platforms,
          tags: draft.hashtags?.reach || [],
          source: 'ai',
          source_id: draft.id,
          file_size_mb: fileSizeMB,
        });

      if (error) {
        console.error("❌ RLS Policy oder Fehler:", {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        });
        throw error;
      }

      console.log("✅ Erfolgreich in content_items gespeichert");
      toast.dismiss(toastId);
      toast.success("✅ In Media Library gespeichert!", {
        description: "Jetzt in der Media Library verfügbar"
      });
      setShowSaveDialog(false);
    } catch (error: any) {
      console.error("❌ Fehler beim Speichern:", error);
      toast.dismiss(toastId);
      toast.error("Fehler beim Speichern: " + error.message);
    }
  };

  const handleSkipSave = () => {
    console.log("🟡 User hat 'Überspringen' gewählt");
    toast.info("Nur als Entwurf gespeichert");
    setShowSaveDialog(false);
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
    
    const hooks = currentDraft.hooks;
    const caption = currentDraft.caption;
    const hashtags = currentDraft.hashtags;
    
    const cleanHook = (hooks?.A || '').replace(/\*\*/g, '');
    const cleanCaption = (caption || '').replace(/\*\*/g, '');
    
    const fullCaption = `${cleanHook}\n\n${cleanCaption}\n\n${hashtags?.reach?.join(' ') || ''}`.trim();
    
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
    
    sessionStorage.setItem('calendar_prefill', JSON.stringify(prefillData));
    navigate('/calendar?prefill=true');
    toast.success('📅 Post an Kalender gesendet - Jetzt Zeit & Details festlegen!');
  };

  const handleSendToReview = () => {
    toast.info("Freigabe-Workflow kommt bald - Benötigt Team-Workspace 👥");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1 container mx-auto px-4 py-8">
        <Breadcrumbs category="design" feature="KI-Post-Generator v2" />

        {/* Hero Header */}
        <PostGeneratorHeroHeader />

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Input Panel (Links) - Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl
                       shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
          >
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
          </motion.div>

          {/* Preview Panel (Rechts) - Glassmorphism */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl
                       shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
          >
            <PreviewTabs
              draft={currentDraft}
              mediaPreview={mediaPreview}
              mediaType={mediaType}
              onCopyCaption={handleCopyCaption}
              onExportZip={handleExportZip}
              onSendToCalendar={handleSendToCalendar}
              onSendToReview={handleSendToReview}
            />
          </motion.div>
        </div>

        {/* Save to Media Library Dialog - Premium Styling */}
        <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
          <AlertDialogContent className="backdrop-blur-xl bg-card/90 border border-white/10 max-w-md">
            <AlertDialogHeader>
              {/* Crown Icon with Glow */}
              <div className="flex justify-center mb-4">
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/20 
                             flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.2)]"
                >
                  <Crown className="h-8 w-8 text-primary" />
                </motion.div>
              </div>
              <AlertDialogTitle className="text-center text-xl">
                Post erfolgreich generiert!
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p className="text-center">Möchtest du diesen Post in deiner Media Library speichern?</p>
                <div className="bg-muted/30 border border-white/10 p-3 rounded-xl text-sm">
                  📚 In der Media Library kannst du den Post später im Planner wiederverwenden.
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <Checkbox 
                    id="auto-save" 
                    checked={autoSaveToLibrary}
                    onCheckedChange={(checked) => {
                      const isChecked = checked === true;
                      setAutoSaveToLibrary(isChecked);
                      localStorage.setItem('ai-post-auto-save', String(isChecked));
                      console.log("🔵 Auto-Save Einstellung geändert:", isChecked);
                    }}
                  />
                  <label htmlFor="auto-save" className="text-sm cursor-pointer">
                    Zukünftig automatisch speichern
                  </label>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel 
                onClick={handleSkipSave}
                className="border-white/20 hover:bg-white/5"
              >
                Nicht speichern
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => handleSaveToLibrary()}
                className="bg-gradient-to-r from-primary to-primary/80 
                           hover:shadow-[0_0_20px_hsla(43,90%,68%,0.3)]"
              >
                In Media Library speichern
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>

      <Footer />
    </div>
  );
}
