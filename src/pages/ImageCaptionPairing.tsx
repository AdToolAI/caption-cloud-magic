import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Upload, Copy, Trash2, ImagePlus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PlanLimitDialog } from "@/components/performance/PlanLimitDialog";
import { useNavigate } from "react-router-dom";

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
  const { user } = useAuth();
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
      .limit(10);
    
    if (data) {
      setHistory(data as unknown as HistoryItem[]);
    }
  };

  const handleFileSelect = async (file: File) => {
    // Check file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: t("common.error"),
        description: t("max_file_size"),
        variant: "destructive",
      });
      return;
    }

    // Check plan limits
    if (userPlan !== "pro" && dailyUploads >= 2) {
      setShowLimitDialog(true);
      return;
    }

    setUploading(true);

    try {
      // Create file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${user?.id}/${Date.now()}.${fileExt}`;

      // Upload to storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('image-captions')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('image-captions')
        .getPublicUrl(uploadData.path);

      setUploadedImage(publicUrl);
      
      // Automatically analyze after upload
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

      // Save to history
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

  const useInGenerator = (caption: string) => {
    localStorage.setItem('prefilled-caption', caption);
    navigate('/generator');
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
      Emotional: "bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-200",
      Funny: "bg-warning/10 text-warning border border-warning/30",
      Minimal: "bg-muted text-muted-foreground",
      Storytelling: "bg-primary/10 text-primary border border-primary/30",
      Engagement: "bg-success/10 text-success border border-success/30",
    };
    return colors[style] || "bg-muted text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-2">
            <ImagePlus className="h-8 w-8 text-primary" />
            {t("image_caption_title")}
          </h1>
          <p className="text-muted-foreground">{t("image_caption_subtitle")}</p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Left Panel: Upload & Controls */}
          <div className="space-y-6">
            {/* Upload Card */}
            <Card>
              <CardHeader>
                <CardTitle>{t("upload_image")}</CardTitle>
                <CardDescription>
                  {t("supported_formats")} • {t("max_file_size")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Platform Selector */}
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    {t("select_platform")}
                  </label>
                  <Select value={platform} onValueChange={setPlatform}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Instagram">Instagram</SelectItem>
                      <SelectItem value="TikTok">TikTok</SelectItem>
                      <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                      <SelectItem value="Facebook">Facebook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Upload Area */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => document.getElementById('file-input')?.click()}
                >
                  {uploading ? (
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      <p className="text-sm text-muted-foreground">{t("common.uploading")}</p>
                    </div>
                  ) : uploadedImage ? (
                    <div className="space-y-4">
                      <img
                        src={uploadedImage}
                        alt="Uploaded"
                        className="max-h-64 mx-auto rounded-lg"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setUploadedImage(null);
                          setCaptions([]);
                          setHashtags([]);
                          setImageAnalysis(null);
                        }}
                      >
                        Upload Different Image
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="h-12 w-12 text-muted-foreground" />
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
                </div>

                {/* Daily limit indicator */}
                {userPlan !== "pro" && (
                  <div className="text-sm text-muted-foreground text-center">
                    Uploads today: {dailyUploads}/2
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Image Analysis Card */}
            {imageAnalysis && (
              <Card>
                <CardHeader>
                  <CardTitle>{t("image_analysis")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Description:</p>
                    <p className="text-sm">{imageAnalysis.description}</p>
                  </div>
                  {imageAnalysis.objects?.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-2">
                        {t("detected_objects")}:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {imageAnalysis.objects.map((obj, idx) => (
                          <Badge key={idx} variant="secondary">{obj}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="font-medium text-muted-foreground">{t("emotion")}:</p>
                      <p>{imageAnalysis.emotion}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">{t("theme")}:</p>
                      <p>{imageAnalysis.theme}</p>
                    </div>
                    <div>
                      <p className="font-medium text-muted-foreground">{t("scene_type")}:</p>
                      <p>{imageAnalysis.scene_type}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel: Captions */}
          <div className="space-y-6">
            {analyzing && (
              <Card>
                <CardContent className="py-12">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                    <p className="text-muted-foreground">{t("generating_captions")}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {captions.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Generated Captions</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => uploadedImage && analyzeImage(uploadedImage)}
                    disabled={analyzing}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {t("regenerate")}
                  </Button>
                </div>

                {captions.map((caption, idx) => (
                  <Card key={idx} className="overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <Badge className={getCaptionStyleColor(caption.style)}>
                          {caption.style}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-sm whitespace-pre-wrap">{caption.text}</p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(caption.text)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          {t("copy_caption")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => useInGenerator(caption.text)}
                        >
                          {t("use_in_generator")}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {!analyzing && captions.length === 0 && uploadedImage && (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <p>Upload an image to generate captions</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* History Section */}
        {history.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-4">{t("history_title")}</h2>
            <div className="grid md:grid-cols-3 lg:grid-cols-4 gap-4">
              {history.map((item) => (
                <Card key={item.id} className="overflow-hidden">
                  <div className="relative">
                    <img
                      src={item.image_url}
                      alt="History"
                      className="w-full h-40 object-cover cursor-pointer"
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
                      }}
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => deleteHistoryItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardContent className="p-3">
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                    <Badge variant="secondary" className="text-xs mt-1">
                      {item.platform}
                    </Badge>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
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