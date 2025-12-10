import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Copy, Trash2, Sparkles, Clock, Eye, Wand2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import ImageCaptionHeroHeader from "@/components/image-caption/ImageCaptionHeroHeader";

interface Caption {
  style: string;
  text: string;
}

interface ImageAnalysis {
  description: string;
  objects: string[];
  emotion: string;
  theme: string;
  scene_type: string;
}

interface HistoryItem {
  id: string;
  image_url: string;
  platform: string;
  captions_json: Caption[];
  hashtags_json: string[];
  ai_description: string;
  created_at: string;
}

const ImageCaptionPairing = () => {
  const { t, language } = useTranslation();
  const { user, subscribed } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [platform, setPlatform] = useState<string>("Instagram");
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageAnalysis, setImageAnalysis] = useState<ImageAnalysis | null>(null);
  const [captions, setCaptions] = useState<Caption[]>([]);
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [userPlan, setUserPlan] = useState<string>("free");
  const [dailyUploads, setDailyUploads] = useState(0);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  useEffect(() => {
    if (user) {
      loadUserPlan();
      loadHistory();
      checkDailyLimit();
    }
  }, [user]);

  const loadUserPlan = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();
    if (data?.plan) {
      setUserPlan(data.plan);
    }
  };

  const checkDailyLimit = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const { count } = await supabase
      .from("image_caption_history")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", user.id)
      .gte("created_at", today);
    
    setDailyUploads(count || 0);
  };

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("image_caption_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(15);
    
    if (data) {
      setHistory(data as unknown as HistoryItem[]);
    }
  };

  const enforceImageLimit = async () => {
    if (!user) return;
    
    const MAX_IMAGES = 15;
    
    const { count } = await supabase
      .from("image_caption_history")
      .select("*", { count: 'exact', head: true })
      .eq("user_id", user.id);
    
    if (count && count > MAX_IMAGES) {
      const toDelete = count - MAX_IMAGES;
      const { data: oldestItems } = await supabase
        .from("image_caption_history")
        .select("id, image_url")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(toDelete);
      
      if (oldestItems && oldestItems.length > 0) {
        for (const item of oldestItems) {
          const path = item.image_url.split('/image-captions/')[1];
          if (path) {
            await supabase.storage.from('image-captions').remove([path]);
          }
          await supabase.from('image_caption_history').delete().eq('id', item.id);
        }
        
        toast({
          title: "🗑️ Automatisch aufgeräumt",
          description: `${toDelete} älteste(s) Bild(er) gelöscht (Limit: 15)`,
        });
      }
    }
  };

  const handleFileSelect = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("common.error"),
        description: t("max_file_size"),
        variant: "destructive",
      });
      return;
    }

    // Pro und Enterprise haben unbegrenzten Zugang
    const hasPremiumAccess = userPlan === "pro" || userPlan === "enterprise" || subscribed;
    if (!hasPremiumAccess && dailyUploads >= 2) {
      setShowLimitDialog(true);
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('image-captions')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('image-captions')
        .getPublicUrl(uploadData.path);

      setUploadedImage(publicUrl);
      await analyzeImage(publicUrl);
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: t("common.error"),
        description: t("upload_error"),
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const analyzeImage = async (imageUrl: string) => {
    if (!user) return;

    setAnalyzing(true);
    setCaptions([]);
    setHashtags([]);
    setImageAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-image-caption', {
        body: {
          imageUrl,
          platform,
          language
        }
      });

      if (error) throw error;

      setImageAnalysis(data.analysis);
      setCaptions(data.captions);
      setHashtags(data.hashtags);

      const { error: saveError } = await supabase
        .from('image_caption_history')
        .insert({
          user_id: user.id,
          platform,
          language,
          image_url: imageUrl,
          ai_description: data.description,
          captions_json: data.captions,
          hashtags_json: data.hashtags
        });

      if (saveError) throw saveError;

      await loadHistory();
      await checkDailyLimit();
      await enforceImageLimit();

      toast({
        title: t("common.success"),
        description: "Captions generated successfully!",
      });

    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: t("common.error"),
        description: error.message || t("analysis_error"),
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  }, [user, userPlan, dailyUploads]);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: t("caption_copied"),
    });
  };

  const useInGenerator = (caption: Caption) => {
    // Caption + Hashtags + Platform für Generator vorbereiten
    localStorage.setItem('generator_prefill', JSON.stringify({
      topic: caption.text.substring(0, 100),
      caption: caption.text,
      hashtags: hashtags,
      platform: platform.toLowerCase()
    }));
    navigate('/generator');
    toast({
      title: "✨ Caption an Generator gesendet!",
    });
  };

  const sendToCalendar = (caption: Caption) => {
    const prefillData = {
      title: `${platform} Post`,
      caption: caption.text,
      platforms: [platform.toLowerCase()],
      hashtags: hashtags,
      timestamp: Date.now(),
      mediaUrl: uploadedImage,
      mediaType: 'image' as const
    };
    
    sessionStorage.setItem('calendar_prefill', JSON.stringify(prefillData));
    navigate('/calendar?prefill=true');
    toast({
      title: "📅 Caption an Kalender gesendet!",
    });
  };

  const deleteHistoryItem = async (id: string) => {
    await supabase
      .from('image_caption_history')
      .delete()
      .eq('id', id);
    
    await loadHistory();
  };

  const getCaptionStyleColor = (style: string) => {
    const colors: Record<string, string> = {
      Emotional: "bg-pink-500/20 text-pink-300 border border-pink-500/30",
      Funny: "bg-warning/20 text-warning border border-warning/30",
      Minimal: "bg-muted/40 text-muted-foreground border border-white/10",
      Storytelling: "bg-primary/20 text-primary border border-primary/30",
      Engagement: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    };
    return colors[style] || "bg-muted/40 text-muted-foreground border border-white/10";
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      Instagram: "bg-gradient-to-r from-pink-500/20 to-purple-500/20 text-pink-300 border-pink-500/30",
      TikTok: "bg-black/40 text-cyan-300 border-cyan-500/30",
      LinkedIn: "bg-blue-500/20 text-blue-300 border-blue-500/30",
      Facebook: "bg-blue-600/20 text-blue-300 border-blue-500/30",
    };
    return colors[platform] || "bg-muted/40 text-muted-foreground border-white/10";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Premium Hero Header */}
        <ImageCaptionHeroHeader 
          dailyUploads={dailyUploads} 
          isPro={userPlan === "pro"} 
        />

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel: Upload & Controls */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Upload Card - Premium Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                         shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                                flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                  <Upload className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{t("upload_image")}</h3>
                  <p className="text-sm text-muted-foreground">
                    JPG, PNG, WebP • Max. 10MB
                  </p>
                </div>
              </div>

              {/* Platform Selector - Premium */}
              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block text-muted-foreground">
                  {t("select_platform")}
                </label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="bg-muted/20 border-white/10 h-12 rounded-xl
                                           focus:border-primary/60 focus:ring-2 focus:ring-primary/20
                                           transition-all duration-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card/95 backdrop-blur-xl border-white/10">
                    <SelectItem value="Instagram">Instagram</SelectItem>
                    <SelectItem value="TikTok">TikTok</SelectItem>
                    <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                    <SelectItem value="Facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Upload Area - Premium with Animation */}
              <motion.div
                whileHover={{ scale: 1.01 }}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border-2 border-dashed border-white/20 rounded-xl p-8 text-center 
                           hover:border-primary/50 hover:shadow-[0_0_30px_hsla(43,90%,68%,0.15)]
                           transition-all duration-300 cursor-pointer bg-muted/10"
                onClick={() => document.getElementById('file-input')?.click()}
              >
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/30
                                 flex items-center justify-center shadow-[0_0_25px_hsla(43,90%,68%,0.3)]"
                    >
                      <Loader2 className="h-8 w-8 text-primary" />
                    </motion.div>
                    <p className="text-sm text-muted-foreground">{t("common.uploading")}</p>
                  </div>
                ) : uploadedImage ? (
                  <div className="space-y-4">
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative inline-block"
                    >
                      <img
                        src={uploadedImage}
                        alt="Uploaded"
                        className="max-h-64 mx-auto rounded-xl shadow-[0_0_30px_hsla(0,0%,0%,0.3)]"
                      />
                      <div className="absolute inset-0 rounded-xl ring-2 ring-primary/30" />
                    </motion.div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-muted/20 border-white/10 hover:bg-muted/40"
                      onClick={(e) => {
                        e.stopPropagation();
                        setUploadedImage(null);
                        setCaptions([]);
                        setHashtags([]);
                        setImageAnalysis(null);
                      }}
                    >
                      Anderes Bild hochladen
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <motion.div
                      animate={{ scale: [1, 1.05, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                                 flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
                    >
                      <Upload className="h-8 w-8 text-primary" />
                    </motion.div>
                    <p className="text-sm text-muted-foreground">
                      {t("drag_drop_image")}
                    </p>
                  </div>
                )}
                <input
                  id="file-input"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileSelect(file);
                  }}
                />
              </motion.div>
            </motion.div>

            {/* Image Analysis Card - Premium Glassmorphism */}
            {imageAnalysis && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl p-6
                           shadow-[0_0_30px_hsla(43,90%,68%,0.06)]"
              >
                <div className="flex items-center gap-3 mb-4">
                  <motion.div
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-purple-500/20
                               flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                  >
                    <Eye className="h-5 w-5 text-primary" />
                  </motion.div>
                  <h3 className="text-lg font-semibold">{t("image_analysis")}</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-muted/20 border border-white/5">
                    <p className="text-sm font-medium text-muted-foreground mb-1">Beschreibung:</p>
                    <p className="text-sm">{imageAnalysis.description}</p>
                  </div>

                  {imageAnalysis.objects?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {t("detected_objects")}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {imageAnalysis.objects.map((obj, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <Badge className="bg-primary/20 text-primary border border-primary/30
                                             shadow-[0_0_8px_hsla(43,90%,68%,0.15)]">
                              {obj}
                            </Badge>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: t("emotion"), value: imageAnalysis.emotion },
                      { label: t("theme"), value: imageAnalysis.theme },
                      { label: t("scene_type"), value: imageAnalysis.scene_type },
                    ].map((item, idx) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-muted/20 border border-white/5">
                        <p className="text-xs font-medium text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium">{item.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </motion.div>

          {/* Right Panel: Captions - Premium */}
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            {/* Analyzing State - Premium */}
            {analyzing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl py-16
                           shadow-[0_0_40px_hsla(43,90%,68%,0.08)]"
              >
                <div className="flex flex-col items-center gap-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/30 to-cyan-500/30
                               flex items-center justify-center shadow-[0_0_30px_hsla(43,90%,68%,0.3)]"
                  >
                    <Sparkles className="h-8 w-8 text-primary" />
                  </motion.div>
                  <p className="text-muted-foreground">{t("generating_captions")}</p>
                </div>
              </motion.div>
            )}

            {/* Generated Captions - Premium Cards */}
            {captions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                                   flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                      <Wand2 className="h-5 w-5 text-primary" />
                    </div>
                    <h2 className="text-xl font-bold">Generierte Captions</h2>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => uploadedImage && analyzeImage(uploadedImage)}
                    disabled={analyzing}
                    className="group relative overflow-hidden bg-gradient-to-r from-primary to-primary/80
                               text-primary-foreground border-0
                               shadow-[0_0_20px_hsla(43,90%,68%,0.3)]
                               hover:shadow-[0_0_30px_hsla(43,90%,68%,0.5)]"
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent
                                     -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t("regenerate")}
                  </Button>
                </div>

                {captions.map((caption, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    whileHover={{ y: -4 }}
                    className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-xl p-5
                               hover:border-primary/30 hover:shadow-[0_0_25px_hsla(43,90%,68%,0.12)]
                               transition-all duration-300"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Badge className={`${getCaptionStyleColor(caption.style)} shadow-[0_0_10px_hsla(43,90%,68%,0.1)]`}>
                        {caption.style}
                      </Badge>
                    </div>
                    <p className="text-sm whitespace-pre-wrap mb-4 leading-relaxed">{caption.text}</p>
                    <div className="flex gap-2 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(caption.text)}
                        className="bg-gradient-to-r from-primary/10 to-cyan-500/10 border-primary/30
                                   hover:shadow-[0_0_15px_hsla(43,90%,68%,0.2)] transition-all"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Kopieren
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => useInGenerator(caption)}
                        className="bg-muted/20 border-white/10 hover:bg-muted/40"
                      >
                        <Wand2 className="h-4 w-4 mr-2" />
                        Im Generator
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => sendToCalendar(caption)}
                        className="bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20 transition-all"
                      >
                        <Calendar className="h-4 w-4 mr-2" />
                        Zum Kalender
                      </Button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Empty State - Premium */}
            {!analyzing && captions.length === 0 && uploadedImage && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="backdrop-blur-xl bg-card/60 border border-white/10 rounded-2xl py-16
                           shadow-[0_0_30px_hsla(43,90%,68%,0.06)]"
              >
                <div className="flex flex-col items-center gap-4">
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                               flex items-center justify-center shadow-[0_0_20px_hsla(43,90%,68%,0.2)]"
                  >
                    <Sparkles className="h-8 w-8 text-primary" />
                  </motion.div>
                  <p className="text-muted-foreground text-center">
                    Bild wurde hochgeladen. Captions werden generiert...
                  </p>
                </div>
              </motion.div>
            )}
          </motion.div>
        </div>

        {/* History Section - Premium */}
        {history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-12"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-500/20
                              flex items-center justify-center shadow-[0_0_15px_hsla(43,90%,68%,0.2)]">
                <Clock className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">{t("history_title")}</h2>
              <Badge variant="outline" className="ml-2 border-primary/30 text-primary">
                {history.length} / 15
              </Badge>
            </div>
            
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
              {history.map((item, idx) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  whileHover={{ y: -4 }}
                  className="group relative overflow-hidden rounded-xl
                             backdrop-blur-sm bg-card/40 border border-white/10
                             hover:border-primary/30 hover:shadow-[0_0_20px_hsla(43,90%,68%,0.12)]
                             transition-all duration-300"
                >
                  <div 
                    className="relative cursor-pointer"
                    onClick={() => {
                      setUploadedImage(item.image_url);
                      setCaptions(item.captions_json);
                      setHashtags(item.hashtags_json);
                      setPlatform(item.platform);
                      setImageAnalysis({
                        description: item.ai_description,
                        objects: [],
                        emotion: '',
                        theme: '',
                        scene_type: ''
                      });
                      toast({
                        title: "✨ Bild geladen",
                        description: "Bild und Captions aus History übernommen",
                      });
                    }}
                  >
                    <img
                      src={item.image_url}
                      alt="History"
                      className="w-full h-40 object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent 
                                    opacity-0 group-hover:opacity-100 transition-opacity duration-300 
                                    flex items-center justify-center">
                      <span className="text-sm font-medium text-primary bg-background/80 px-3 py-1.5 rounded-full
                                       shadow-[0_0_15px_hsla(43,90%,68%,0.3)] border border-primary/30">
                        Bild verwenden
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity
                                 bg-red-500/80 hover:bg-red-500 shadow-[0_0_15px_hsla(0,60%,50%,0.3)]"
                      onClick={() => deleteHistoryItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="p-3">
                    <p className="text-xs text-muted-foreground mb-2">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                    <Badge className={`${getPlatformColor(item.platform)} text-xs`}>
                      {item.platform}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <PlanLimitDialog
        open={showLimitDialog}
        onOpenChange={setShowLimitDialog}
        feature="Image Caption Pairing"
      />
    </div>
  );
};

export default ImageCaptionPairing;
