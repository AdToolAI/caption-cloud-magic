import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, Video, FileText, Trash2, Download, Search, Filter, ExternalLink, Play, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export default function MediaLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const [media, setMedia] = useState<any[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [storageQuota, setStorageQuota] = useState({ used_mb: 0, quota_mb: 1024 });
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [importUrl, setImportUrl] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [userPlan, setUserPlan] = useState<string>('free');

  useEffect(() => {
    if (user) {
      loadMedia();
      loadStorageQuota();
      fetchUserPlan();
    }
  }, [user]);

  const fetchUserPlan = async () => {
    if (!user) return;
    
    const { data } = await supabase
      .from('wallets')
      .select('plan_code')
      .eq('user_id', user.id)
      .single();
    
    if (data) {
      setUserPlan(data.plan_code || 'free');
    }
  };

  const getPlanDisplayName = (planCode: string): string => {
    const names: Record<string, string> = {
      free: 'Free',
      basic: 'Basic',
      pro: 'Pro',
      enterprise: 'Enterprise'
    };
    return names[planCode] || 'Free';
  };

  const getPlanLimitDisplay = (planCode: string): string => {
    const limits: Record<string, string> = {
      free: '1 GB',
      basic: '2 GB',
      pro: '5 GB',
      enterprise: '10 GB'
    };
    return limits[planCode] || '1 GB';
  };

  useEffect(() => {
    applyFilters();
  }, [media, searchQuery, filterType]);

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
      const { data, error } = await supabase
        .from('media_assets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedia(data || []);
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

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.storage_path?.toLowerCase().includes(searchQuery.toLowerCase())
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
    
    // Check quota
    const fileSizeMb = file.size / 1024 / 1024;
    if (storageQuota.used_mb + fileSizeMb > storageQuota.quota_mb) {
      toast({
        title: 'Storage-Limit erreicht',
        description: `Dein ${getPlanDisplayName(userPlan)}-Plan bietet ${getPlanLimitDisplay(userPlan)} Speicher. Upgrade für mehr Kapazität.`,
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

  const handleDelete = async (id: string, storagePath: string) => {
    try {
      await supabase.storage
        .from('media-assets')
        .remove([storagePath]);

      const { error } = await supabase
        .from('media_assets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Delete successful',
        description: 'Media deleted successfully',
      });

      setSelectedAssets(prev => prev.filter(assetId => assetId !== id));
      loadMedia();
      loadStorageQuota();
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'image': return <Image className="h-5 w-5" />;
      case 'video': return <Video className="h-5 w-5" />;
      default: return <FileText className="h-5 w-5" />;
    }
  };

  return (
    <div className="container py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Media Library</h1>
          <p className="text-muted-foreground">Manage your media assets</p>
        </div>
        <div className="flex items-center gap-4">
          <Badge 
            variant={storageQuota.used_mb > storageQuota.quota_mb * 0.9 ? "destructive" : "default"}
            className="text-sm"
          >
            {(storageQuota.used_mb / 1024).toFixed(2)} GB / {getPlanLimitDisplay(userPlan)}
            <span className="ml-2 text-xs opacity-70">({getPlanDisplayName(userPlan)})</span>
          </Badge>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleUpload}
            accept="image/*,video/*"
          />
          <Button asChild disabled={loading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              Upload
            </label>
          </Button>
        </div>
      </div>

      {/* Storage Warning */}
      {storageQuota.used_mb > storageQuota.quota_mb * 0.8 && userPlan !== 'enterprise' && (
        <Alert variant="default" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Storage fast voll</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              Du hast {((storageQuota.used_mb / storageQuota.quota_mb) * 100).toFixed(0)}% 
              deines {getPlanDisplayName(userPlan)}-Speichers genutzt.
            </span>
            <Button 
              size="sm" 
              onClick={() => window.location.href = '/#pricing'}
            >
              Jetzt upgraden
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Storage Warning */}
      {storageQuota.used_mb > storageQuota.quota_mb * 0.8 && userPlan !== 'enterprise' && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
                  <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100">Storage fast voll</h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    Du hast {((storageQuota.used_mb / storageQuota.quota_mb) * 100).toFixed(0)}% 
                    deines {getPlanDisplayName(userPlan)}-Speichers genutzt ({(storageQuota.used_mb / 1024).toFixed(2)} GB / {getPlanLimitDisplay(userPlan)}).
                  </p>
                </div>
              </div>
              <Button 
                size="sm" 
                onClick={() => window.location.href = '/#pricing'}
                className="flex-shrink-0"
              >
                Jetzt upgraden
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* URL Import */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <Input 
              placeholder="External URL (e.g., https://...)" 
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
            />
            <Button onClick={handleImportUrl} disabled={!importUrl || loading}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Import
            </Button>
          </div>
        </CardContent>
      </Card>

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

            {selectedAssets.length > 0 && (
              <Button 
                onClick={() => {
                  navigate('/composer', { state: { assetIds: selectedAssets } });
                }}
              >
                Use {selectedAssets.length} in Composer
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.map((item) => {
          const publicUrl = item.storage_path 
            ? supabase.storage.from('media-assets').getPublicUrl(item.storage_path).data.publicUrl 
            : null;
          
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

                {item.type === 'video' && publicUrl ? (
                  <video
                    src={publicUrl}
                    className="object-cover w-full h-full cursor-pointer"
                    muted
                    playsInline
                    preload="metadata"
                    onClick={() => setSelectedVideo(publicUrl)}
                  />
                ) : item.type === 'image' && publicUrl ? (
                  <img 
                    src={publicUrl} 
                    alt="Media"
                    className="object-cover w-full h-full"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    {getFileIcon(item.type)}
                    <span className="text-sm text-center px-2 break-words">{item.storage_path?.split('/').pop()}</span>
                  </div>
                )}
                
                {/* Action Overlay */}
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {item.type === 'video' && publicUrl && (
                    <Button 
                      size="icon" 
                      variant="secondary"
                      onClick={() => setSelectedVideo(publicUrl)}
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  )}
                  {publicUrl && (
                    <Button 
                      size="icon" 
                      variant="secondary"
                      onClick={() => window.open(publicUrl, '_blank')}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                  <Button 
                    size="icon" 
                    variant="destructive"
                    onClick={() => handleDelete(item.id, item.storage_path)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardContent className="p-3">
                <p className="text-sm font-medium truncate">{item.storage_path?.split('/').pop()}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {item.type}
                  </Badge>
                  {item.size_bytes && (
                    <span className="text-xs text-muted-foreground">
                      {(item.size_bytes / 1024 / 1024).toFixed(2)} MB
                    </span>
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
            <h3 className="text-lg font-semibold mb-2">No media found</h3>
            <p className="text-muted-foreground mb-4">Upload files or import from URL to get started</p>
          </div>
        </Card>
      )}

      {/* Video Preview Dialog */}
      <Dialog open={!!selectedVideo} onOpenChange={() => setSelectedVideo(null)}>
        <DialogContent className="max-w-4xl">
          <DialogTitle>Video Vorschau</DialogTitle>
          {selectedVideo && (
            <video
              src={selectedVideo}
              controls
              className="w-full rounded-lg"
              autoPlay={false}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
