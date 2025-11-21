import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus } from 'lucide-react';

interface Props {
  testId: string;
  onCreateVariant: (testId: string, data: {
    variant_name: string;
    variant_type: 'control' | 'variant';
    customizations?: any;
    thumbnail_config?: any;
    text_config?: any;
    color_config?: any;
  }) => void;
}

export function CreateVariantDialog({ testId, onCreateVariant }: Props) {
  const [open, setOpen] = useState(false);
  const [variantName, setVariantName] = useState('');
  const [variantType, setVariantType] = useState<'control' | 'variant'>('variant');
  
  // Thumbnail configs
  const [thumbnailStyle, setThumbnailStyle] = useState('');
  const [thumbnailColor, setThumbnailColor] = useState('#000000');
  
  // Text configs
  const [textFont, setTextFont] = useState('');
  const [textSize, setTextSize] = useState('medium');
  const [textColor, setTextColor] = useState('#000000');
  
  // Color configs
  const [primaryColor, setPrimaryColor] = useState('#000000');
  const [secondaryColor, setSecondaryColor] = useState('#ffffff');

  const handleSubmit = () => {
    if (!variantName) return;

    onCreateVariant(testId, {
      variant_name: variantName,
      variant_type: variantType,
      thumbnail_config: thumbnailStyle || thumbnailColor !== '#000000' ? {
        style: thumbnailStyle,
        color: thumbnailColor
      } : undefined,
      text_config: textFont || textSize !== 'medium' || textColor !== '#000000' ? {
        font: textFont,
        size: textSize,
        color: textColor
      } : undefined,
      color_config: primaryColor !== '#000000' || secondaryColor !== '#ffffff' ? {
        primary: primaryColor,
        secondary: secondaryColor
      } : undefined
    });

    // Reset form
    setVariantName('');
    setVariantType('variant');
    setThumbnailStyle('');
    setThumbnailColor('#000000');
    setTextFont('');
    setTextSize('medium');
    setTextColor('#000000');
    setPrimaryColor('#000000');
    setSecondaryColor('#ffffff');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Variante hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Test-Variante erstellen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="variant-name">Varianten Name *</Label>
              <Input
                id="variant-name"
                placeholder="z.B. Rotes Thumbnail"
                value={variantName}
                onChange={(e) => setVariantName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-type">Typ</Label>
              <Select value={variantType} onValueChange={(v) => setVariantType(v as 'control' | 'variant')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="control">Control (Original)</SelectItem>
                  <SelectItem value="variant">Variant (Testversion)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs defaultValue="thumbnail" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="thumbnail">Thumbnail</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="colors">Farben</TabsTrigger>
            </TabsList>

            <TabsContent value="thumbnail" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="thumb-style">Style</Label>
                <Select value={thumbnailStyle} onValueChange={setThumbnailStyle}>
                  <SelectTrigger>
                    <SelectValue placeholder="Style auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="bold">Bold</SelectItem>
                    <SelectItem value="gradient">Gradient</SelectItem>
                    <SelectItem value="pattern">Pattern</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="thumb-color">Hintergrundfarbe</Label>
                <Input
                  id="thumb-color"
                  type="color"
                  value={thumbnailColor}
                  onChange={(e) => setThumbnailColor(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="text" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="text-font">Schriftart</Label>
                <Select value={textFont} onValueChange={setTextFont}>
                  <SelectTrigger>
                    <SelectValue placeholder="Schriftart auswählen" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roboto">Roboto</SelectItem>
                    <SelectItem value="opensans">Open Sans</SelectItem>
                    <SelectItem value="montserrat">Montserrat</SelectItem>
                    <SelectItem value="poppins">Poppins</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-size">Textgröße</Label>
                <Select value={textSize} onValueChange={setTextSize}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Klein</SelectItem>
                    <SelectItem value="medium">Mittel</SelectItem>
                    <SelectItem value="large">Groß</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="text-color">Textfarbe</Label>
                <Input
                  id="text-color"
                  type="color"
                  value={textColor}
                  onChange={(e) => setTextColor(e.target.value)}
                />
              </div>
            </TabsContent>

            <TabsContent value="colors" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primary-color">Primärfarbe</Label>
                <Input
                  id="primary-color"
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondary-color">Sekundärfarbe</Label>
                <Input
                  id="secondary-color"
                  type="color"
                  value={secondaryColor}
                  onChange={(e) => setSecondaryColor(e.target.value)}
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handleSubmit} disabled={!variantName}>
              Variante erstellen
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
