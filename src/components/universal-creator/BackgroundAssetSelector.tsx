import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Palette, Sparkles, Video, Image as ImageIcon, Upload, Trash2, Check, Search, Play, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { BackgroundAsset } from '@/types/background-assets';

interface BackgroundAssetSelectorProps {
  selectedAsset: BackgroundAsset | null;
  onSelectAsset: (asset: BackgroundAsset) => void;
}

const PRESET_COLORS = [
  '#000000', '#ffffff', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899',
  '#1f2937', '#6b7280', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7',
];

const PRESET_GRADIENTS = [
  { colors: ['#667eea', '#764ba2'], name: 'Purple Dreams' },
  { colors: ['#f093fb', '#f5576c'], name: 'Pink Passion' },
  { colors: ['#4facfe', '#00f2fe'], name: 'Ocean Blue' },
  { colors: ['#43e97b', '#38f9d7'], name: 'Mint Fresh' },
  { colors: ['#fa709a', '#fee140'], name: 'Sunset' },
  { colors: ['#30cfd0', '#330867'], name: 'Deep Ocean' },
];

export function BackgroundAssetSelector({ selectedAsset, onSelectAsset }: BackgroundAssetSelectorProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedColor, setSelectedColor] = useState('#000000');
  const [gradientColors, setGradientColors] = useState<[string, string]>(['#667eea', '#764ba2']);
  const [gradientDirection, setGradientDirection] = useState('diagonal');
  const [uploading, setUploading] = useState(false);
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [searchTriggered, setSearchTriggered] = useState(false);

  // Fetch user's background assets
  const { data: assets = [] } = useQuery({
    queryKey: ['background-assets', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('universal_background_assets')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BackgroundAsset[];
    },
    enabled: !!user,
  });

  // Stock Videos Search
  const { data: stockVideos, isLoading: isSearching } = useQuery({
    queryKey: ['stock-videos', stockSearchQuery],
    queryFn: async () => {
      if (!stockSearchQuery) return { videos: [], total: 0 };
      
      const { data, error } = await supabase.functions.invoke('search-stock-videos', {
        body: { query: stockSearchQuery, perPage: 12 }
      });

      if (error) throw error;
      return data;
    },
    enabled: searchTriggered && stockSearchQuery.length > 0,
  });

  // Create color background
  const createColorAsset = useMutation({
    mutationFn: async (color: string) => {
      const { data, error } = await supabase
        .from('universal_background_assets')
        .insert({
          user_id: user!.id,
          type: 'color',
          color,
          title: `Color ${color}`,
        })
        .select()
        .single();

      if (error) throw error;
      return data as BackgroundAsset;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['background-assets'] });
      onSelectAsset(data);
      toast.success('Farb-Hintergrund erstellt');
    },
  });

  // Create gradient background
  const createGradientAsset = useMutation({
    mutationFn: async (params: { colors: [string, string]; direction: string }) => {
      const { data, error } = await supabase
        .from('universal_background_assets')
        .insert({
          user_id: user!.id,
          type: 'gradient',
          gradient_colors: { colors: params.colors, direction: params.direction },
          title: `Gradient ${params.colors[0]} → ${params.colors[1]}`,
        })
        .select()
        .single();

      if (error) throw error;
      return data as BackgroundAsset;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['background-assets'] });
      onSelectAsset(data);
      toast.success('Gradient-Hintergrund erstellt');
    },
  });

  // Upload video/image
  const handleFileUpload = async (file: File, type: 'video' | 'image') => {
    if (!user) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // Upload to storage
      const { error: uploadError, data: uploadData } = await supabase.storage
        .from('background-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('background-assets')
        .getPublicUrl(filePath);

      // Create database entry
      const { data: assetData, error: dbError } = await supabase
        .from('universal_background_assets')
        .insert({
          user_id: user.id,
          type,
          url: urlData.publicUrl,
          storage_path: filePath,
          title: file.name,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      queryClient.invalidateQueries({ queryKey: ['background-assets'] });
      onSelectAsset(assetData as BackgroundAsset);
      toast.success(`${type === 'video' ? 'Video' : 'Bild'} hochgeladen`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(`Fehler beim Upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Upload multiple images
  const handleMultipleImageUpload = async (files: FileList) => {
    if (!user) return;
    
    const fileArray = Array.from(files);
    const maxFiles = 10;
    
    // Limit to 10 files
    if (fileArray.length > maxFiles) {
      toast.error(`Maximal ${maxFiles} Bilder gleichzeitig erlaubt`);
      return;
    }
    
    // Validate file types and sizes
    const validFiles: File[] = [];
    for (const file of fileArray) {
      if (!file.type.startsWith('image/')) {
        toast.error(`${file.name} ist kein Bild`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB
        toast.error(`${file.name} überschreitet 10MB`);
        continue;
      }
      validFiles.push(file);
    }
    
    if (validFiles.length === 0) return;
    
    setUploading(true);
    toast.info(`${validFiles.length} Bild(er) werden hochgeladen...`);
    
    try {
      // Upload all files in parallel
      const uploadPromises = validFiles.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${user.id}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = fileName;
        
        // Upload to storage
        const { error: uploadError } = await supabase.storage
          .from('background-assets')
          .upload(filePath, file);
        
        if (uploadError) throw uploadError;
        
        // Get public URL
        const { data: urlData } = supabase.storage
          .from('background-assets')
          .getPublicUrl(filePath);
        
        // Create database entry
        const { data: assetData, error: dbError } = await supabase
          .from('universal_background_assets')
          .insert({
            user_id: user.id,
            type: 'image',
            url: urlData.publicUrl,
            storage_path: filePath,
            title: file.name,
          })
          .select()
          .single();
        
        if (dbError) throw dbError;
        return assetData;
      });
      
      const results = await Promise.all(uploadPromises);
      
      queryClient.invalidateQueries({ queryKey: ['background-assets'] });
      
      // Select the first uploaded image
      if (results.length > 0 && results[0]) {
        onSelectAsset(results[0] as BackgroundAsset);
      }
      
      toast.success(`${results.length} Bild(er) erfolgreich hochgeladen`);
    } catch (error: any) {
      console.error('Multi-upload error:', error);
      toast.error(`Fehler beim Upload: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Delete asset
  const deleteAsset = useMutation({
    mutationFn: async (asset: BackgroundAsset) => {
      // Delete from storage if it exists
      if (asset.storage_path) {
        await supabase.storage.from('background-assets').remove([asset.storage_path]);
      }

      // Delete from database
      const { error } = await supabase
        .from('universal_background_assets')
        .delete()
        .eq('id', asset.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['background-assets'] });
      toast.success('Asset gelöscht');
    },
  });

  const renderAssetCard = (asset: BackgroundAsset) => {
    const isSelected = selectedAsset?.id === asset.id;

    return (
      <Card
        key={asset.id}
        className={`relative group cursor-pointer transition-all hover:shadow-lg ${
          isSelected ? 'ring-2 ring-primary' : ''
        }`}
        onClick={() => onSelectAsset(asset)}
      >
        <div className="aspect-video rounded-t-lg overflow-hidden">
          {asset.type === 'color' && (
            <div className="w-full h-full" style={{ backgroundColor: asset.color }} />
          )}
          {asset.type === 'gradient' && asset.gradient_colors && (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(${
                  asset.gradient_colors.direction === 'horizontal'
                    ? 'to right'
                    : asset.gradient_colors.direction === 'vertical'
                    ? 'to bottom'
                    : '135deg'
                }, ${asset.gradient_colors.colors[0]}, ${asset.gradient_colors.colors[1]})`,
              }}
            />
          )}
          {asset.type === 'video' && asset.url && (
            <video src={asset.url} className="w-full h-full object-cover" />
          )}
          {asset.type === 'image' && asset.url && (
            <img src={asset.url} alt={asset.title} className="w-full h-full object-cover" />
          )}
        </div>
        <div className="p-3">
          <p className="text-sm font-medium truncate">{asset.title || 'Untitled'}</p>
        </div>
        {isSelected && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1">
            <Check className="h-4 w-4" />
          </div>
        )}
        <Button
          size="icon"
          variant="destructive"
          className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            deleteAsset.mutate(asset);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Hintergrund wählen</h2>

        <Tabs defaultValue="colors">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="colors">
              <Palette className="h-4 w-4 mr-2" />
              Farben
            </TabsTrigger>
            <TabsTrigger value="gradients">
              <Sparkles className="h-4 w-4 mr-2" />
              Gradients
            </TabsTrigger>
            <TabsTrigger value="videos">
              <Video className="h-4 w-4 mr-2" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="images">
              <ImageIcon className="h-4 w-4 mr-2" />
              Bilder
            </TabsTrigger>
            <TabsTrigger value="stock">
              <Search className="h-4 w-4 mr-2" />
              Stock Videos
            </TabsTrigger>
          </TabsList>

          {/* Colors Tab */}
          <TabsContent value="colors" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Eigene Farbe</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="w-20 h-10"
                  />
                  <Input
                    type="text"
                    value={selectedColor}
                    onChange={(e) => setSelectedColor(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={() => createColorAsset.mutate(selectedColor)}>
                    Hinzufügen
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Vordefinierte Farben</Label>
                <div className="grid grid-cols-8 gap-2">
                  {PRESET_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => createColorAsset.mutate(color)}
                      className="w-12 h-12 rounded-lg border-2 hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meine Farben</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {assets.filter((a) => a.type === 'color').map(renderAssetCard)}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Gradients Tab */}
          <TabsContent value="gradients" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Eigener Gradient</Label>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Farbe 1</Label>
                    <Input
                      type="color"
                      value={gradientColors[0]}
                      onChange={(e) => setGradientColors([e.target.value, gradientColors[1]])}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Farbe 2</Label>
                    <Input
                      type="color"
                      value={gradientColors[1]}
                      onChange={(e) => setGradientColors([gradientColors[0], e.target.value])}
                    />
                  </div>
                </div>
                <Select value={gradientDirection} onValueChange={setGradientDirection}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="horizontal">Horizontal</SelectItem>
                    <SelectItem value="vertical">Vertikal</SelectItem>
                    <SelectItem value="diagonal">Diagonal</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  className="w-full"
                  onClick={() =>
                    createGradientAsset.mutate({ colors: gradientColors, direction: gradientDirection })
                  }
                >
                  Gradient hinzufügen
                </Button>
              </div>

              <div className="space-y-2">
                <Label>Vordefinierte Gradients</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {PRESET_GRADIENTS.map((preset, idx) => (
                    <button
                      key={idx}
                      onClick={() =>
                        createGradientAsset.mutate({
                          colors: preset.colors as [string, string],
                          direction: 'diagonal',
                        })
                      }
                      className="h-20 rounded-lg border-2 hover:scale-105 transition-transform"
                      style={{
                        background: `linear-gradient(135deg, ${preset.colors[0]}, ${preset.colors[1]})`,
                      }}
                      title={preset.name}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Meine Gradients</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {assets.filter((a) => a.type === 'gradient').map(renderAssetCard)}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Videos Tab */}
          <TabsContent value="videos" className="space-y-4">
            <div className="space-y-4">
              <Card className="p-6 border-dashed">
                <Label htmlFor="video-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm font-medium">Video hochladen</p>
                    <p className="text-xs text-muted-foreground">MP4, MOV, max 100MB</p>
                  </div>
                </Label>
                <Input
                  id="video-upload"
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file, 'video');
                  }}
                  disabled={uploading}
                />
              </Card>

              <div className="space-y-2">
                <Label>Meine Videos</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {assets.filter((a) => a.type === 'video').map(renderAssetCard)}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Images Tab */}
          <TabsContent value="images" className="space-y-4">
            <div className="space-y-4">
              <Card className="p-6 border-dashed">
                <Label htmlFor="image-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2 py-8">
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm font-medium">Bild(er) hochladen</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, max 10MB pro Bild, bis zu 10 Bilder</p>
                  </div>
                </Label>
                <Input
                  id="image-upload"
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      handleMultipleImageUpload(files);
                    }
                  }}
                  disabled={uploading}
                />
              </Card>

              <div className="space-y-2">
                <Label>Meine Bilder</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {assets.filter((a) => a.type === 'image').map(renderAssetCard)}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Stock Videos Tab */}
          <TabsContent value="stock" className="space-y-4">
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Nach Stock-Videos suchen... (z.B. 'ocean waves', 'city night')"
                  value={stockSearchQuery}
                  onChange={(e) => setStockSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && stockSearchQuery) {
                      setSearchTriggered(true);
                    }
                  }}
                  className="flex-1"
                />
                <Button
                  onClick={() => setSearchTriggered(true)}
                  disabled={!stockSearchQuery || isSearching}
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {searchTriggered && stockSearchQuery && (
                <div className="text-sm text-muted-foreground">
                  {isSearching ? (
                    'Suche nach Videos...'
                  ) : stockVideos?.videos?.length > 0 ? (
                    `${stockVideos.videos.length} Videos gefunden • Powered by Pexels`
                  ) : (
                    'Keine Videos gefunden. Versuche andere Suchbegriffe.'
                  )}
                </div>
              )}

              {!searchTriggered && (
                <div className="text-center py-12 text-muted-foreground">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm font-medium mb-2">
                    Suche nach professionellen Stock-Videos
                  </p>
                  <p className="text-xs">
                    Kostenlos • 4K verfügbar • Kommerzielle Nutzung erlaubt
                  </p>
                </div>
              )}

              {searchTriggered && stockVideos?.videos && stockVideos.videos.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {stockVideos.videos.map((video: any) => (
                    <Card 
                      key={video.id}
                      className="overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all group"
                      onClick={async () => {
                        try {
                          const { data: asset, error } = await supabase
                            .from('universal_background_assets')
                            .insert({
                              user_id: user!.id,
                              type: 'video',
                              url: video.url,
                              thumbnail_url: video.thumbnail_url,
                              duration_sec: video.duration_sec,
                              source: 'pexels',
                              title: `Pexels Video ${video.id}`,
                            })
                            .select()
                            .single();

                          if (error) throw error;

                          queryClient.invalidateQueries({ queryKey: ['background-assets'] });
                          onSelectAsset(asset as BackgroundAsset);
                          toast.success('Stock-Video zur Bibliothek hinzugefügt');
                        } catch (error: any) {
                          console.error('Error saving stock video:', error);
                          toast.error('Fehler beim Hinzufügen des Videos');
                        }
                      }}
                    >
                      <div className="relative aspect-video">
                        <img
                          src={video.thumbnail_url}
                          alt="Stock video"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <Play className="h-12 w-12 text-white" />
                        </div>
                        <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                          {Math.floor(video.duration_sec)}s
                        </div>
                      </div>
                      <div className="p-3">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1 truncate">
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            {video.user.name}
                          </span>
                          <span className="flex-shrink-0">{video.width}×{video.height}</span>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
