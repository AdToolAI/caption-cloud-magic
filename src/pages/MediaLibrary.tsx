import { useState, useEffect } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Upload, Image, Video, FileText, Trash2, Download, Search, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function MediaLibrary() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [media, setMedia] = useState<any[]>([]);
  const [filteredMedia, setFilteredMedia] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    if (user) {
      loadMedia();
    }
  }, [user]);

  useEffect(() => {
    applyFilters();
  }, [media, searchQuery, filterType, filterCategory]);

  const loadMedia = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('media_library')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setMedia(data || []);
    } catch (error) {
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
        item.file_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (filterType !== "all") {
      filtered = filtered.filter(item => item.file_type === filterType);
    }

    // Category filter
    if (filterCategory !== "all") {
      filtered = filtered.filter(item => item.category === filterCategory);
    }

    setFilteredMedia(filtered);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !user) return;

    const file = e.target.files[0];
    setLoading(true);

    try {
      // Upload to Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('media-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('media-assets')
        .getPublicUrl(filePath);

      // Save metadata to database
      const fileType = file.type.startsWith('image/') ? 'image' :
                      file.type.startsWith('video/') ? 'video' : 'document';

      const { error: dbError } = await supabase
        .from('media_library')
        .insert({
          user_id: user.id,
          file_name: file.name,
          file_url: publicUrl,
          file_type: fileType,
          file_size: file.size,
          mime_type: file.type,
        });

      if (dbError) throw dbError;

      toast({
        title: t('success'),
        description: t('mediaLibrary.uploadSuccess'),
      });

      loadMedia();
    } catch (error) {
      toast({
        title: t('error'),
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, fileUrl: string) => {
    try {
      // Extract file path from URL
      const path = fileUrl.split('/').slice(-2).join('/');
      
      // Delete from storage
      await supabase.storage
        .from('media-assets')
        .remove([path]);

      // Delete from database
      const { error } = await supabase
        .from('media_library')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: t('success'),
        description: t('mediaLibrary.deleteSuccess'),
      });

      loadMedia();
    } catch (error) {
      toast({
        title: t('error'),
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
          <h1 className="text-3xl font-bold mb-2">{t('mediaLibrary.title')}</h1>
          <p className="text-muted-foreground">{t('mediaLibrary.subtitle')}</p>
        </div>
        <div>
          <input
            type="file"
            id="file-upload"
            className="hidden"
            onChange={handleUpload}
            accept="image/*,video/*,.pdf,.doc,.docx"
          />
          <Button asChild disabled={loading}>
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload className="h-4 w-4 mr-2" />
              {t('mediaLibrary.upload')}
            </label>
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label>{t('search')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('mediaLibrary.searchPlaceholder')}
                  className="pl-10"
                />
              </div>
            </div>

            <div>
              <Label>{t('mediaLibrary.fileType')}</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('mediaLibrary.allTypes')}</SelectItem>
                  <SelectItem value="image">{t('mediaLibrary.images')}</SelectItem>
                  <SelectItem value="video">{t('mediaLibrary.videos')}</SelectItem>
                  <SelectItem value="document">{t('mediaLibrary.documents')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Media Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {filteredMedia.map((item) => (
          <Card key={item.id} className="overflow-hidden">
            <div className="aspect-square bg-muted flex items-center justify-center relative group">
              {item.file_type === 'image' ? (
                <img 
                  src={item.file_url} 
                  alt={item.file_name}
                  className="object-cover w-full h-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-2">
                  {getFileIcon(item.file_type)}
                  <span className="text-sm text-center px-2 break-words">{item.file_name}</span>
                </div>
              )}
              
              {/* Action Overlay */}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button 
                  size="icon" 
                  variant="secondary"
                  onClick={() => window.open(item.file_url, '_blank')}
                >
                  <Download className="h-4 w-4" />
                </Button>
                <Button 
                  size="icon" 
                  variant="destructive"
                  onClick={() => handleDelete(item.id, item.file_url)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <CardContent className="p-3">
              <p className="text-sm font-medium truncate">{item.file_name}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs">
                  {item.file_type}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {(item.file_size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredMedia.length === 0 && !loading && (
        <Card className="p-12">
          <div className="text-center">
            <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">{t('mediaLibrary.noMedia')}</h3>
            <p className="text-muted-foreground mb-4">{t('mediaLibrary.uploadFirst')}</p>
          </div>
        </Card>
      )}
    </div>
  );
}
