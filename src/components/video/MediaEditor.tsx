import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Upload, Search, Image as ImageIcon, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface MediaEditorProps {
  currentImageUrl?: string;
  onImageChange: (imageUrl: string) => void;
}

export const MediaEditor = ({ currentImageUrl, onImageChange }: MediaEditorProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Ungültiger Dateityp",
        description: "Bitte wähle eine Bilddatei aus.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      setSelectedImage(imageUrl);
      onImageChange(imageUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleUnsplashSearch = async () => {
    if (!searchQuery.trim()) {
      toast({
        title: "Suchbegriff fehlt",
        description: "Bitte gib einen Suchbegriff ein.",
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      // Note: In production, you'd use Unsplash API with proper API key
      // For now, this is a placeholder
      toast({
        title: "Suche",
        description: "Unsplash-Integration kommt bald!",
      });
      setSearchResults([]);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Fehler",
        description: "Suche fehlgeschlagen.",
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const applyFilters = () => {
    // Apply CSS filters to the image
    const filterStyle = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;
    return filterStyle;
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            Suchen
          </TabsTrigger>
          <TabsTrigger value="filters">
            <Wand2 className="h-4 w-4 mr-2" />
            Filter
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
               onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Klicke hier oder ziehe ein Bild hierher
            </p>
            <p className="text-xs text-muted-foreground">
              PNG, JPG oder WEBP (max. 10MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          {selectedImage && (
            <div className="space-y-4">
              <Label>Bildausschnitt anpassen</Label>
              <div className="max-h-[400px] overflow-auto border rounded">
                <ReactCrop
                  crop={crop}
                  onChange={(c) => setCrop(c)}
                  aspect={16 / 9}
                >
                  <img src={selectedImage} alt="Selected" className="max-w-full" />
                </ReactCrop>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Search Tab */}
        <TabsContent value="search" className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Nach Bildern suchen..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUnsplashSearch()}
            />
            <Button onClick={handleUnsplashSearch} disabled={isSearching}>
              {isSearching ? 'Suche...' : 'Suchen'}
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {searchResults.length > 0 ? (
              searchResults.map((result, idx) => (
                <div
                  key={idx}
                  className="aspect-video bg-muted rounded cursor-pointer hover:ring-2 ring-primary"
                  onClick={() => {
                    setSelectedImage(result.url);
                    onImageChange(result.url);
                  }}
                >
                  <img src={result.url} alt={result.description} className="w-full h-full object-cover rounded" />
                </div>
              ))
            ) : (
              <div className="col-span-3 text-center py-8 text-muted-foreground">
                <p>Gib einen Suchbegriff ein, um Bilder zu finden</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Filters Tab */}
        <TabsContent value="filters" className="space-y-6">
          {(selectedImage || currentImageUrl) && (
            <>
              <div className="space-y-2">
                <Label>Vorschau</Label>
                <div className="border rounded overflow-hidden">
                  <img
                    src={selectedImage || currentImageUrl}
                    alt="Preview"
                    style={{ filter: applyFilters() }}
                    className="w-full h-auto"
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Helligkeit</Label>
                    <span className="text-sm text-muted-foreground">{brightness}%</span>
                  </div>
                  <Slider
                    value={[brightness]}
                    onValueChange={([value]) => setBrightness(value)}
                    min={0}
                    max={200}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Kontrast</Label>
                    <span className="text-sm text-muted-foreground">{contrast}%</span>
                  </div>
                  <Slider
                    value={[contrast]}
                    onValueChange={([value]) => setContrast(value)}
                    min={0}
                    max={200}
                    step={1}
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label>Sättigung</Label>
                    <span className="text-sm text-muted-foreground">{saturation}%</span>
                  </div>
                  <Slider
                    value={[saturation]}
                    onValueChange={([value]) => setSaturation(value)}
                    min={0}
                    max={200}
                    step={1}
                  />
                </div>

                <Button
                  variant="outline"
                  onClick={() => {
                    setBrightness(100);
                    setContrast(100);
                    setSaturation(100);
                  }}
                  className="w-full"
                >
                  Filter zurücksetzen
                </Button>
              </div>
            </>
          )}

          {!selectedImage && !currentImageUrl && (
            <div className="text-center py-8 text-muted-foreground">
              <p>Lade zuerst ein Bild hoch, um Filter anzuwenden</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
