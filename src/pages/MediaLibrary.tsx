import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, Video, FileText, Trash2, Search, ExternalLink, Play, Sparkles, Send, Calendar, Layers, FolderOpen, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MediaLibraryHeroHeader } from "@/components/media-library/MediaLibraryHeroHeader";
import { motion, AnimatePresence } from "framer-motion";

// Storage Limits
const MAX_VIDEOS = 250;
const MAX_STORAGE_GB = 10;

// Normalized media item type
interface NormalizedMediaItem {
  id: string;
  source: 'upload' | 'ai' | 'ai_generator' | 'campaign' | 'video-creator';
  type: 'image' | 'video';
  title?: string;
  caption?: string;
  url: string;
  storagePath?: string;
  thumbUrl?: string;
  createdAt: string;
  sourceId?: string;
  platforms?: string[];
  sizeBytes?: number;
  fileSizeMb?: number;
}

export default function MediaLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [media, setMedia] = useState<NormalizedMediaItem[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<NormalizedMediaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "upload" | "ai" | "ai_generator" | "campaign" | "video-creator">("all");
  const [storageQuota, setStorageQuota] = useState({ used_mb: 0, quota_mb: MAX_STORAGE_GB * 1024 });
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [importUrl, setImportUrl] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  // Handle tab parameter from URL
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tabParam = searchParams.get('tab');
    if (tabParam === 'ai') {
      setCategoryFilter('ai');
    } else if (tabParam === 'rendered') {
      setCategoryFilter('video-creator');
    }
  }, [location.search]);

  useEffect(() => {
    if (user) {
      loadMedia();
      loadStorageQuota();
      loadWorkspaceId();
    }
  }, [user]);

  const loadWorkspaceId = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)
      .single();
    
    if (data) setWorkspaceId(data.workspace_id);
  };

  // Realtime subscription for content_items
  useEffect(() => {
    if (!workspaceId) return;

    console.log("🔴 Setting up Realtime subscription for workspace:", workspaceId);

    const channel = supabase
      .channel('content_items_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_items',
          filter: `workspace_id=eq.${workspaceId}`
        },
        (payload) => {
          console.log('🔴 Realtime update empfangen:', payload);
          loadMedia();
          toast({
            title: "🎉 Neue Medien hinzugefügt!",
            description: "Deine Media Library wurde aktualisiert",
          });
        }
      )
      .subscribe();

    return () => {
      console.log("🔴 Cleaning up Realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  // Realtime subscription for video_creations (AI videos)
  useEffect(() => {
    if (!user) return;

    console.log("🎥 Setting up Realtime subscription for video_creations");

    const channel = supabase
      .channel('video_creations_changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'video_creations',
          filter: `user_id=eq.${user.id}`
        },
        (payload) => {
          console.log('🎥 Neues Video hinzugefügt:', payload);
          loadMedia();
          toast({
            title: "🎬 Neues AI-Video verfügbar!",
            description: "Dein AI-Video wurde zur Mediathek hinzugefügt"
          });
        }
      )
      .subscribe();

    return () => {
      console.log("🎥 Cleaning up video_creations subscription");
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Removed fetchUserPlan, getPlanDisplayName, getPlanLimitDisplay - using fixed limits now

  useEffect(() => {
    applyFilters();
  }, [media, searchQuery, filterType, categoryFilter]);

  const loadStorageQuota = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('user_storage')
      .select('used_mb, quota_mb')
      .eq('user_id', user.id)
      .single();
    
    if (data) setStorageQuota(data);
  };

  const loadMedia = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Load from media_assets (manual uploads)
      const { data: assetsData, error: assetsError } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (assetsError) throw assetsError;

      // Load from content_items (AI-generated and campaigns)
      // First get user's workspace
      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();

      let contentData: any[] = [];
      if (workspaceData?.workspace_id) {
        const { data: contentItems, error: contentError } = await supabase
          .from('content_items')
          .select('*')
          .eq('workspace_id', workspaceData.workspace_id)
          .in('source', ['ai', 'ai_generator', 'campaign'])
          .order('created_at', { ascending: false });

        if (!contentError && contentItems) {
          contentData = contentItems;
        }
      }

      // Normalize data from both sources
      const normalizedAssets: NormalizedMediaItem[] = (assetsData || []).map(asset => ({
        id: asset.id,
        source: 'upload' as const,
        type: (asset.type === 'video' ? 'video' : 'image') as 'image' | 'video',
        url: supabase.storage.from('media-assets').getPublicUrl(asset.storage_path).data.publicUrl,
        storagePath: asset.storage_path,
        thumbUrl: asset.storage_path,
        createdAt: asset.created_at,
        sizeBytes: asset.size_bytes,
      }));

      const normalizedContent: NormalizedMediaItem[] = contentData.map(item => ({
        id: item.id,
        source: item.source,
        type: item.type,
        title: item.title,
        caption: item.caption,
        url: item.thumb_url || '',
        thumbUrl: item.thumb_url,
        createdAt: item.created_at,
        sourceId: item.source_id,
        platforms: item.targets || [],
        fileSizeMb: item.file_size_mb,
      }));

      // Load video creations
      const { data: videoCreations, error: videoError } = await supabase
        .from('video_creations')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      const normalizedVideoCreations: NormalizedMediaItem[] = (videoCreations || []).map(video => {
        // Check if it's a Sora-2-AI, Director's Cut Enhancement, Director's Cut, or Universal Creator video
        const metadata = video.metadata as any;
        const isSoraAI = metadata?.source === 'sora-2-ai';
        const isDirectorCutEnhancement = metadata?.source === 'director-cut-enhancement';
        const isDirectorsCut = metadata?.source === 'directors-cut';
        const isUniversalCreator = metadata?.source === 'universal-creator';
        
        return {
          id: video.id,
          source: (isSoraAI || isDirectorCutEnhancement || isDirectorsCut) 
            ? 'ai' as const 
            : isUniversalCreator ? 'video-creator' as const : 'upload' as const,
          type: 'video' as const,
          title: isSoraAI 
            ? (metadata?.prompt?.slice(0, 60) + '...' || 'AI Video')
            : isDirectorCutEnhancement
              ? `KI-Szene: ${metadata?.prompt?.slice(0, 40) || 'Enhancement'}...`
              : isDirectorsCut
                ? `Director's Cut - ${new Date(video.created_at).toLocaleDateString('de-DE')}`
                : isUniversalCreator
                  ? `Universal Creator Video - ${new Date(video.created_at).toLocaleDateString('de-DE')}`
                  : `Erstelltes Video - ${new Date(video.created_at).toLocaleDateString('de-DE')}`,
          caption: isSoraAI 
            ? `Sora 2 ${metadata?.model === 'sora-2-pro' ? 'Pro' : 'Standard'} · ${metadata?.duration_seconds}s`
            : isDirectorCutEnhancement
              ? `Director's Cut · Sora 2 ${metadata?.model === 'sora-2-pro' ? 'Pro' : 'Standard'} · ${metadata?.duration_seconds}s`
              : isDirectorsCut
                ? 'Exportiert mit Universal Director\'s Cut'
                : isUniversalCreator
                  ? 'Gerendert mit Universal Creator'
                  : '',
          url: video.output_url || '',
          thumbUrl: video.output_url || '',
          createdAt: video.created_at,
        };
      });

      // Calculate storage quota including estimated sizes for content_items
      let totalUsedMB = 0;

      // Real file sizes from media_assets
      totalUsedMB += normalizedAssets.reduce((sum, item) => {
        return sum + ((item.sizeBytes || 0) / (1024 * 1024));
      }, 0);

      // Use actual file sizes for content_items if available, otherwise estimate
      totalUsedMB += normalizedContent.reduce((sum, item) => {
        // Use actual file_size_mb if available, otherwise estimate
        const fileSize = item.fileSizeMb || (item.type === 'video' ? 20 : 2);
        return sum + fileSize;
      }, 0);

      // Add AI video sizes to storage calculation
      totalUsedMB += normalizedVideoCreations.reduce((sum, item) => {
        // Estimate 20 MB per AI video if size not available
        const fileSize = item.fileSizeMb || 20;
        return sum + fileSize;
      }, 0);

      setStorageQuota(prev => ({ ...prev, used_mb: totalUsedMB }));

      // Merge and sort by creation date - including AI videos
      const merged = [...normalizedAssets, ...normalizedContent, ...normalizedVideoCreations].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setMedia(merged);
    } catch (error: any) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...media];

    // Category filter
    if (categoryFilter === "ai") {
      // Show both 'ai' and 'ai_generator' under the AI category
      filtered = filtered.filter(item => item.source === 'ai' || item.source === 'ai_generator');
    } else if (categoryFilter !== "all") {
      filtered = filtered.filter(item => item.source === categoryFilter);
    }

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.caption?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.url?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter(item => item.type === filterType);
    }

    setFilteredMedia(filtered);
  };

  const handleImportUrl = async () => {
    if (!importUrl || !user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('media-import', {
        body: { url: importUrl, type: 'image' }
      });
      
      if (error) throw error;
      
      toast({
        title: 'Import successful',
        description: 'Media imported from URL',
      });
      
      setImportUrl("");
      loadMedia();
      loadStorageQuota();
    } catch (error: any) {
      toast({
        title: 'Import failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;

    const file = e.target.files[0];
    
    // Check quota against fixed limits
    const fileSizeMb = file.size / 1024 / 1024;
    if (storageQuota.used_mb + fileSizeMb > MAX_STORAGE_GB * 1024) {
      toast({
        title: 'Storage-Limit erreicht',
        description: `Maximal ${MAX_STORAGE_GB} GB Speicher. Bei Überschreitung werden automatisch die ältesten Medien gelöscht.`,
        variant: 'destructive',
      });
      return;
    }
    
    setLoading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const fileType = file.type.startsWith('image/') ? 'image' : 'video';

      const { error: dbError } = await supabase
        .from('media_assets')
        .insert({
          user_id: user.id,
          source: 'upload',
          storage_path: filePath,
          type: fileType,
          mime: file.type,
          size_bytes: file.size,
        });

      if (dbError) throw dbError;

      toast({
        title: 'Upload successful',
        description: 'Media uploaded successfully',
      });

      loadMedia();
      loadStorageQuota();
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, mediaItem: NormalizedMediaItem) => {
    try {
      // Handle deletion based on source
      if (mediaItem.source === 'upload' && mediaItem.storagePath) {
        await supabase.storage
          .from('media-assets')
          .remove([mediaItem.storagePath]);

        const { error } = await supabase
          .from('media_assets')
          .delete()
          .eq('id', id);

        if (error) throw error;
      } else if (mediaItem.source === 'ai' || mediaItem.source === 'ai_generator' || mediaItem.source === 'campaign') {
        // Delete from content_items
        const { error } = await supabase
          .from('content_items')
          .delete()
          .eq('id', id);

        if (error) throw error;
      }

      toast({
        title: 'Gelöscht',
        description: 'Medium erfolgreich gelöscht',
      });

      setSelectedAssets(prev => prev.filter(assetId => assetId !== id));
      loadMedia();
      if (mediaItem.source === 'upload') {
        loadStorageQuota();
      }
    } catch (error: any) {
      toast({
        title: 'Fehler beim Löschen',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Send to AI Post Generator
  const sendToAIPostGenerator = (mediaItem: NormalizedMediaItem) => {
    sessionStorage.setItem('generator_media_import', JSON.stringify({
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      timestamp: Date.now(),
    }));
    
    toast({
      title: "📸 Media gesendet",
      description: "Wird im KI-Post-Generator geladen...",
    });
    
    navigate('/ai-post-generator');
  };

  // Send to Composer
  const sendToComposer = (mediaItem: NormalizedMediaItem) => {
    localStorage.setItem('composer_import', JSON.stringify({
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      platforms: ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: "✉️ Media gesendet",
      description: "Wird im Composer geladen...",
    });
    
    navigate('/composer');
  };

  // Send to Calendar
  const sendToCalendar = (mediaItem: NormalizedMediaItem) => {
    sessionStorage.setItem('calendar_prefill', JSON.stringify({
      title: mediaItem.title || `Post vom ${new Date().toLocaleDateString('de-DE')}`,
      caption: mediaItem.caption || '',
      mediaUrl: mediaItem.url,
      mediaType: mediaItem.type,
      platforms: mediaItem.platforms || ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: "📅 Media gesendet",
      description: "Wird im Kalender geladen...",
    });
    
    navigate('/calendar?prefill=true');
  };

  // Send to Background Replacer
  const sendToBackgroundReplacer = (mediaItem: NormalizedMediaItem) => {
    // Only allow images for background replacer
    if (mediaItem.type !== 'image') {
      toast({
        title: "⚠️ Nur Bilder erlaubt",
        description: "Smart Background funktioniert nur mit Bildern.",
        variant: "destructive",
      });
      return;
    }
    
    sessionStorage.setItem('bg_replacer_import', JSON.stringify({
      imageUrl: mediaItem.url,
      timestamp: Date.now(),
    }));
    
    toast({
      title: "🎨 Media gesendet",
      description: "Wird in Smart Background geladen...",
    });
    
    navigate('/background-replacer');
  };

  // Bulk send to Composer
  const bulkSendToComposer = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    const mediaUrls = selectedItems.map(item => ({
      url: item.url,
      type: item.type,
    }));
    
    localStorage.setItem('composer_import', JSON.stringify({
      media: mediaUrls,
      platforms: ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: "✉️ Medien gesendet",
      description: `${selectedItems.length} Dateien werden im Composer geladen...`,
    });
    
    navigate('/composer');
  };

  // Bulk send to AI Post Generator
  const bulkSendToAIPostGenerator = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For generator, use first media item only
    const firstItem = selectedItems[0];
    
    sessionStorage.setItem('generator_media_import', JSON.stringify({
      mediaUrl: firstItem.url,
      mediaType: firstItem.type,
      timestamp: Date.now(),
    }));
    
    toast({
      title: "📸 Media gesendet",
      description: `Erstes Medium wird im KI-Post-Generator geladen...`,
    });
    
    navigate('/ai-post-generator');
  };

  // Bulk send to Calendar
  const bulkSendToCalendar = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For calendar, use first media item only
    const firstItem = selectedItems[0];
    
    sessionStorage.setItem('calendar_prefill', JSON.stringify({
      title: firstItem.title || `Post vom ${new Date().toLocaleDateString('de-DE')}`,
      caption: firstItem.caption || '',
      mediaUrl: firstItem.url,
      mediaType: firstItem.type,
      platforms: firstItem.platforms || ['instagram'],
      timestamp: Date.now(),
    }));
    
    toast({
      title: "📅 Media gesendet",
      description: `Erstes Medium wird im Kalender geladen...`,
    });
    
    navigate('/calendar?prefill=true');
  };

  // Bulk send to Background Replacer
  const bulkSendToBackgroundReplacer = () => {
    const selectedItems = media.filter(item => selectedAssets.includes(item.id));
    
    if (selectedItems.length === 0) return;
    
    // For background replacer, use first image only
    const firstImageItem = selectedItems.find(item => item.type === 'image');
    
    if (!firstImageItem) {
      toast({
        title: "⚠️ Kein Bild ausgewählt",
        description: "Der Hintergrund-Ersatz funktioniert nur mit Bildern.",
        variant: "destructive",
      });
      return;
    }
    
    sessionStorage.setItem('bg_replacer_import', JSON.stringify({
      imageUrl: firstImageItem.url,
      timestamp: Date.now(),
    }));
    
    toast({
      title: "🎨 Media gesendet",
      description: `Erstes Bild wird im Hintergrund-Ersatz geladen...`,
    });
    
    navigate('/background-replacer');
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'upload':
        return <Badge variant="secondary" className="text-xs"><Upload className="h-3 w-3 mr-1" /> Upload</Badge>;
      case 'ai':
        return <Badge variant="default" className="text-xs bg-purple-500/10 text-purple-500"><Sparkles className="h-3 w-3 mr-1" /> AI Video</Badge>;
      case 'ai_generator':
        return <Badge variant="default" className="text-xs"><Sparkles className="h-3 w-3 mr-1" /> KI</Badge>;
      case 'campaign':
        return <Badge variant="outline" className="text-xs"><Layers className="h-3 w-3 mr-1" /> Kampagne</Badge>;
      case 'video-creator':
        return <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-500"><Video className="h-3 w-3 mr-1" /> Video Creator</Badge>;
      default:
        return null;
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  // Calculate counts for header
  const videoCount = media.filter(m => m.type === 'video').length;
  const usedGB = storageQuota.used_mb / 1024;

  const triggerUpload = () => {
    document.getElementById('file-upload')?.click();
  };

  return (
    <div className="container py-8 space-y-6">
      {/* Hidden file input */}
      <input
        type="file"
        id="file-upload"
        className="hidden"
        onChange={handleUpload}
        accept="image/*,video/*"
      />

      {/* Premium Hero Header */}
      <MediaLibraryHeroHeader
        videoCount={videoCount}
        maxVideos={MAX_VIDEOS}
        usedGB={usedGB}
        maxGB={MAX_STORAGE_GB}
        onUploadClick={triggerUpload}
      />

      {/* URL Import - Glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="backdrop-blur-xl bg-card/60 border-white/10">
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <Input 
                placeholder="Externe URL importieren (z.B. https://...)" 
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                className="bg-muted/20 border-white/10 focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
              />
              <Button 
                onClick={handleImportUrl} 
                disabled={!importUrl || loading}
                className="group relative overflow-hidden"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent
                                 -translate-x-full group-hover:translate-x-full transition-transform duration-500" />
                <ExternalLink className="h-4 w-4 mr-2" />
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Category Tabs - Premium Glassmorphism */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <Card className="backdrop-blur-xl bg-card/60 border-white/10">
          <CardContent className="pt-6">
            <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as typeof categoryFilter)}>
              <TabsList className="grid w-full grid-cols-5 bg-muted/30">
                <TabsTrigger 
                  value="all" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <FolderOpen className="h-4 w-4" />
                  Alle Medien
                </TabsTrigger>
                <TabsTrigger 
                  value="upload" 
                  className="flex items-center gap-2 data-[state=active]:bg-primary/20 data-[state=active]:shadow-[0_0_15px_hsla(43,90%,68%,0.2)]"
                >
                  <Upload className="h-4 w-4" />
                  Uploads
                </TabsTrigger>
                <TabsTrigger 
                  value="ai" 
                  className="flex items-center gap-2 data-[state=active]:bg-purple-500/20 data-[state=active]:shadow-[0_0_15px_hsla(270,80%,60%,0.2)]"
                >
                  <Sparkles className="h-4 w-4" />
                  KI Generiert
                </TabsTrigger>
                <TabsTrigger 
                  value="video-creator" 
                  className="flex items-center gap-2 data-[state=active]:bg-cyan-500/20 data-[state=active]:shadow-[0_0_15px_hsla(180,80%,60%,0.2)]"
                >
                  <Video className="h-4 w-4" />
                  Gerendert
                </TabsTrigger>
                <TabsTrigger 
                  value="campaign" 
                  className="flex items-center gap-2 data-[state=active]:bg-orange-500/20 data-[state=active]:shadow-[0_0_15px_hsla(30,80%,60%,0.2)]"
                >
                  <Layers className="h-4 w-4" />
                  Kampagnen
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters & Selection Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <Label>Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search media..."
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>File Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="image">Images</SelectItem>
                  <SelectItem value="video">Videos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedAssets.length > 0 && (
            <div className="flex items-center gap-4 p-4 border-t bg-muted/30 flex-wrap mt-4">
              <span className="text-sm text-muted-foreground">
                {selectedAssets.length} ausgewählt
              </span>
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToAIPostGenerator}
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  An Generator ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToComposer}
                >
                  <Send className="h-4 w-4 mr-2" />
                  An Composer ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToCalendar}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  In Kalender ({selectedAssets.length})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={bulkSendToBackgroundReplacer}
                >
                  <Layers className="h-4 w-4 mr-2" />
                  Hintergrund-Ersatz ({selectedAssets.length})
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    selectedAssets.forEach(id => {
                      const item = media.find(m => m.id === id);
                      if (item) handleDelete(id, item);
                    });
                    setSelectedAssets([]);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Löschen ({selectedAssets.length})
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.map((item) => {
          return (
            <Card key={item.id} className="overflow-hidden">
              <div className="aspect-square bg-muted flex items-center justify-center relative group">
                {/* Checkbox for selection */}
                <div className="absolute top-2 left-2 z-10">
                  <Checkbox
                    checked={selectedAssets.includes(item.id)}
                    onCheckedChange={(checked) => {
                      setSelectedAssets(prev => 
                        checked ? [...prev, item.id] : prev.filter(id => id !== item.id)
                      );
                    }}
                  />
                </div>

                {/* Source Badge */}
                <div className="absolute top-2 right-2 z-10">
                  {getSourceBadge(item.source)}
                </div>

                {item.type === 'video' && item.url ? (
                  <video
                    src={item.url}
                    className="object-cover w-full h-full cursor-pointer"
                    muted
                    playsInline
                    preload="metadata"
                    onClick={() => setSelectedVideo(item.url)}
                  />
                ) : item.type === 'image' && item.url ? (
                  <img 
                    src={item.url} 
                    alt={item.title || "Media"}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {getFileIcon(item.type)}
                    <span className="text-sm text-center px-2 break-words">
                      {item.title || item.storagePath?.split('/').pop() || 'Unbenannt'}
                    </span>
                  </div>
                )}
                
                {/* Action Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                  <TooltipProvider>
                    {item.type === 'video' && item.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => setSelectedVideo(item.url)}
                          >
                            <Play className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Video abspielen</TooltipContent>
                      </Tooltip>
                    )}
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToAIPostGenerator(item)}
                        >
                          <Sparkles className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>An KI-Post-Generator senden</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToComposer(item)}
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>An Composer senden</TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="secondary"
                          onClick={() => sendToCalendar(item)}
                        >
                          <Calendar className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>In Kalender einplanen</TooltipContent>
                    </Tooltip>
                    
                    {item.type === 'image' && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => sendToBackgroundReplacer(item)}
                          >
                            <Layers className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Hintergrund ersetzen</TooltipContent>
                      </Tooltip>
                    )}
                    
                    {item.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            size="icon" 
                            variant="secondary"
                            onClick={() => window.open(item.url, '_blank')}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Herunterladen</TooltipContent>
                      </Tooltip>
                    )}
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="destructive"
                          onClick={() => handleDelete(item.id, item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Löschen</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">
                  {item.title || item.storagePath?.split('/').pop() || 'Unbenannt'}
                </p>
                {item.caption && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.caption}</p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {item.type}
                  </Badge>
                  {item.sizeBytes && (
                    <span className="text-xs text-muted-foreground">
                      {(item.sizeBytes / 1024 / 1024).toFixed(2)} MB
                    </span>
                  )}
                  {item.platforms && item.platforms.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {item.platforms.join(', ')}
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {filteredMedia.length === 0 && !loading && (
        <Card className="p-12">
          <div className="text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-medium mb-2">Keine Medien gefunden</p>
            <p className="text-sm text-muted-foreground mb-4">Laden Sie Ihre ersten Dateien hoch</p>
            <Button asChild>
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="h-4 w-4 mr-2" />
                Datei hochladen
              </label>
            </Button>
          </div>
        </Card>
      )}

      {/* Video Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-2xl">
          <DialogTitle>Video Preview</DialogTitle>
          {selectedVideo && (
            <div className="flex justify-center">
              <video 
                src={selectedVideo} 
                controls 
                autoPlay
                className="max-h-[70vh] w-auto rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
