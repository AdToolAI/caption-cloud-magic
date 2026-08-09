import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Upload, Search, Image as ImageIcon, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTx } from '@/lib/i18nText';
import ReactCrop, { Crop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

interface MediaEditorProps {
  currentImageUrl?: string;
  onImageChange: (imageUrl: string) => void;
  // Filter props (lifted to parent)
  brightness: number;
  onBrightnessChange: (value: number) => void;
  contrast: number;
  onContrastChange: (value: number) => void;
  saturation: number;
  onSaturationChange: (value: number) => void;
  grayscale: number;
  onGrayscaleChange: (value: number) => void;
  sepia: number;
  onSepiaChange: (value: number) => void;
  hueRotate: number;
  onHueRotateChange: (value: number) => void;
}

export const MediaEditor = ({ 
  currentImageUrl, 
  onImageChange,
  brightness,
  onBrightnessChange,
  contrast,
  onContrastChange,
  saturation,
  onSaturationChange,
  grayscale,
  onGrayscaleChange,
  sepia,
  onSepiaChange,
  hueRotate,
  onHueRotateChange
}: MediaEditorProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({ unit: '%', width: 100, height: 100, x: 0, y: 0 });
  const [selectedPreset, setSelectedPreset] = useState('Original');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const tx = useTx();

  const filterPresets = [
    {
      name: 'Original',
      icon: '🎨',
      filters: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, sepia: 0, hueRotate: 0 }
    },
    {
      name: 'Schwarz/Weiß',
      icon: '⚫',
      filters: { brightness: 100, contrast: 100, saturation: 0, grayscale: 100, sepia: 0, hueRotate: 0 }
    },
    {
      name: 'Sepia',
      icon: '🟤',
      filters: { brightness: 110, contrast: 90, saturation: 80, grayscale: 0, sepia: 60, hueRotate: 0 }
    },
    {
      name: 'Vintage',
      icon: '📷',
      filters: { brightness: 105, contrast: 85, saturation: 70, grayscale: 20, sepia: 30, hueRotate: 0 }
    },
    {
      name: 'Vibrant',
      icon: '✨',
      filters: { brightness: 105, contrast: 110, saturation: 130, grayscale: 0, sepia: 0, hueRotate: 0 }
    },
    {
      name: 'Cool',
      icon: '❄️',
      filters: { brightness: 100, contrast: 100, saturation: 90, grayscale: 0, sepia: 0, hueRotate: 180 }
    },
    {
      name: 'Warm',
      icon: '☀️',
      filters: { brightness: 105, contrast: 95, saturation: 110, grayscale: 0, sepia: 0, hueRotate: 30 }
    },
    {
      name: 'High Contrast',
      icon: '⚡',
      filters: { brightness: 100, contrast: 140, saturation: 100, grayscale: 0, sepia: 0, hueRotate: 0 }
    }
  ];

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: tx({ de: "Ungültiger Dateityp", en: "Invalid file type", es: "Tipo de archivo no válido" }),
        description: tx({ de: "Bitte wähle eine Bilddatei aus.", en: "Please select an image file.", es: "Selecciona un archivo de imagen." }),
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
        title: tx({ de: "Suchbegriff fehlt", en: "Search term missing", es: "Falta el término de búsqueda" }),
        description: tx({ de: "Bitte gib einen Suchbegriff ein.", en: "Please enter a search term.", es: "Introduce un término de búsqueda." }),
        variant: "destructive",
      });
      return;
    }

    setIsSearching(true);
    try {
      // Note: In production, you'd use Unsplash API with proper API key
      // For now, this is a placeholder
      toast({
        title: tx({ de: "Suche", en: "Search", es: "Búsqueda" }),
        description: tx({ de: "Unsplash-Integration kommt bald!", en: "Unsplash integration coming soon!", es: "¡Integración con Unsplash próximamente!" }),
      });
      setSearchResults([]);
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: tx({ de: "Fehler", en: "Error", es: "Error" }),
        description: tx({ de: "Suche fehlgeschlagen.", en: "Search failed.", es: "Error en la búsqueda." }),
        variant: "destructive",
      });
    } finally {
      setIsSearching(false);
    }
  };

  const applyFilters = () => {
    const filterStyle = `
      brightness(${brightness}%)
      contrast(${contrast}%)
      saturate(${saturation}%)
      grayscale(${grayscale}%)
      sepia(${sepia}%)
      hue-rotate(${hueRotate}deg)
    `.trim();
    return filterStyle;
  };

  const applyPreset = (preset: typeof filterPresets[0]) => {
    onBrightnessChange(preset.filters.brightness);
    onContrastChange(preset.filters.contrast);
    onSaturationChange(preset.filters.saturation);
    onGrayscaleChange(preset.filters.grayscale);
    onSepiaChange(preset.filters.sepia);
    onHueRotateChange(preset.filters.hueRotate);
    setSelectedPreset(preset.name);
    
    toast({
      title: tx({ de: "Filter angewendet", en: "Filter applied", es: "Filtro aplicado" }),
      description: `${preset.name} ${tx({ de: "wurde angewendet", en: "was applied", es: "fue aplicado" })}`,
    });
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="upload">
            <Upload className="h-4 w-4 mr-2" />
            {tx({ de: "Upload", en: "Upload", es: "Subir" })}
          </TabsTrigger>
          <TabsTrigger value="search">
            <Search className="h-4 w-4 mr-2" />
            {tx({ de: "Suchen", en: "Search", es: "Buscar" })}
          </TabsTrigger>
          <TabsTrigger value="filters">
            <Wand2 className="h-4 w-4 mr-2" />
            {tx({ de: "Filter", en: "Filter", es: "Filtro" })}
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
               onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              {tx({ de: "Klicke hier oder ziehe ein Bild hierher", en: "Click here or drag an image here", es: "Haz clic aquí o arrastra una imagen aquí" })}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx({ de: "PNG, JPG oder WEBP (max. 10MB)", en: "PNG, JPG or WEBP (max. 10MB)", es: "PNG, JPG o WEBP (máx. 10MB)" })}
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
              <Label>{tx({ de: "Bildausschnitt anpassen", en: "Adjust crop", es: "Ajustar recorte" })}</Label>
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
              placeholder={tx({ de: "Nach Bildern suchen...", en: "Search for images...", es: "Buscar imágenes..." })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleUnsplashSearch()}
            />
            <Button onClick={handleUnsplashSearch} disabled={isSearching}>
              {isSearching ? tx({ de: 'Suche...', en: 'Searching...', es: 'Buscando...' }) : tx({ de: 'Suchen', en: 'Search', es: 'Buscar' })}
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
                <p>{tx({ de: "Gib einen Suchbegriff ein, um Bilder zu finden", en: "Enter a search term to find images", es: "Introduce un término de búsqueda para encontrar imágenes" })}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Filters Tab */}
        <TabsContent value="filters" className="space-y-6">
          {/* Filter Presets */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">{tx({ de: "Filter-Presets", en: "Filter presets", es: "Preajustes de filtro" })}</Label>
            <div className="grid grid-cols-4 gap-2">
              {filterPresets.map((preset) => (
                <Button
                  key={preset.name}
                  variant={selectedPreset === preset.name ? "default" : "outline"}
                  className="h-auto flex-col gap-1 p-3"
                  onClick={() => applyPreset(preset)}
                >
                  <span className="text-2xl">{preset.icon}</span>
                  <span className="text-xs">{preset.name}</span>
                </Button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Feineinstellung */}
          <div className="space-y-4">
            <Label className="text-base font-semibold">{tx({ de: "Feineinstellung", en: "Fine-tuning", es: "Ajuste fino" })}</Label>
            
            {/* Brightness Slider */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>{tx({ de: "Helligkeit", en: "Brightness", es: "Brillo" })}</Label>
                <span className="text-sm text-muted-foreground">{brightness}%</span>
              </div>
              <Slider
                value={[brightness]}
                onValueChange={([value]) => {
                  onBrightnessChange(value);
                  setSelectedPreset('Custom');
                }}
                min={0}
                max={200}
                step={1}
              />
            </div>

            {/* Contrast Slider */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>{tx({ de: "Kontrast", en: "Contrast", es: "Contraste" })}</Label>
                <span className="text-sm text-muted-foreground">{contrast}%</span>
              </div>
              <Slider
                value={[contrast]}
                onValueChange={([value]) => {
                  onContrastChange(value);
                  setSelectedPreset('Custom');
                }}
                min={0}
                max={200}
                step={1}
              />
            </div>

            {/* Saturation Slider */}
            <div className="space-y-2">
              <div className="flex justify-between">
                <Label>{tx({ de: "Sättigung", en: "Saturation", es: "Saturación" })}</Label>
                <span className="text-sm text-muted-foreground">{saturation}%</span>
              </div>
              <Slider
                value={[saturation]}
                onValueChange={([value]) => {
                  onSaturationChange(value);
                  setSelectedPreset('Custom');
                }}
                min={0}
                max={200}
                step={1}
              />
            </div>
          </div>

          {/* Live Preview */}
          {(selectedImage || currentImageUrl) && (
            <div className="space-y-2">
              <Label>{tx({ de: "Vorschau", en: "Preview", es: "Vista previa" })}</Label>
              <div className="relative w-full h-48 border rounded-lg overflow-hidden bg-muted">
                <img
                  src={selectedImage || currentImageUrl}
                  alt="Preview"
                  className="w-full h-full object-contain"
                  style={{ filter: applyFilters() }}
                />
              </div>
            </div>
          )}

          {!selectedImage && !currentImageUrl && (
            <div className="text-center py-8 text-muted-foreground">
              <p>{tx({ de: "Lade zuerst ein Bild hoch, um Filter anzuwenden", en: "Upload an image first to apply filters", es: "Sube primero una imagen para aplicar filtros" })}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};
