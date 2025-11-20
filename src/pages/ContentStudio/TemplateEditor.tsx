import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CustomizableField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'image' | 'video' | 'color' | 'number' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export default function TemplateEditor() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const mode = templateId ? 'edit' : 'create';

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [contentType, setContentType] = useState('ad');
  const [category, setCategory] = useState('product');
  const [platform, setPlatform] = useState('instagram');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [durationMin, setDurationMin] = useState(15);
  const [durationMax, setDurationMax] = useState(30);
  const [customizableFields, setCustomizableFields] = useState<CustomizableField[]>([]);
  const [aiScriptEnabled, setAiScriptEnabled] = useState(true);
  const [aiVoiceoverEnabled, setAiVoiceoverEnabled] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const addField = () => {
    setCustomizableFields([
      ...customizableFields,
      {
        key: `field_${customizableFields.length + 1}`,
        label: '',
        type: 'text',
        required: false,
        placeholder: ''
      }
    ]);
  };

  const removeField = (index: number) => {
    setCustomizableFields(customizableFields.filter((_, i) => i !== index));
  };

  const updateField = (index: number, updates: Partial<CustomizableField>) => {
    setCustomizableFields(
      customizableFields.map((field, i) => 
        i === index ? { ...field, ...updates } : field
      )
    );
  };

  const handleSave = async () => {
    if (!name || !description) {
      toast.error('Bitte fülle alle Pflichtfelder aus');
      return;
    }

    setIsSaving(true);

    try {
      const { data, error } = await supabase.functions.invoke('save-custom-template', {
        body: {
          id: templateId,
          name,
          description,
          content_type: contentType,
          category,
          platform,
          aspect_ratio: aspectRatio,
          duration_min: durationMin,
          duration_max: durationMax,
          customizable_fields: customizableFields,
          ai_features: [
            ...(aiScriptEnabled ? ['ai_script'] : []),
            ...(aiVoiceoverEnabled ? ['ai_voiceover'] : [])
          ],
          is_public: isPublic
        }
      });

      if (error) throw error;

      toast.success(templateId ? 'Template aktualisiert' : 'Template erstellt');
      navigate('/content-studio');
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/content-studio')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">
              {templateId ? 'Template bearbeiten' : 'Neues Template erstellen'}
            </h1>
            <p className="text-muted-foreground mt-1">
              Erstelle ein wiederverwendbares Video-Template
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/content-studio')}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>Speichert...</>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Speichern
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="space-y-6">

        {/* Basis-Informationen */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Basis-Informationen</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Template-Name *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z.B. Produkt Showcase"
              />
            </div>

            <div>
              <Label htmlFor="description">Beschreibung *</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Beschreibe, wofür dieses Template geeignet ist..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Content-Typ</Label>
                <Select value={contentType} onValueChange={setContentType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ad">Werbevideo</SelectItem>
                    <SelectItem value="story">Story</SelectItem>
                    <SelectItem value="reel">Reel</SelectItem>
                    <SelectItem value="tutorial">Tutorial</SelectItem>
                    <SelectItem value="testimonial">Testimonial</SelectItem>
                    <SelectItem value="news">News</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Kategorie</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="product">Produkt</SelectItem>
                    <SelectItem value="service">Service</SelectItem>
                    <SelectItem value="event">Event</SelectItem>
                    <SelectItem value="personal">Personal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Plattform</Label>
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Format</Label>
                <Select value={aspectRatio} onValueChange={setAspectRatio}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 (Vertikal)</SelectItem>
                    <SelectItem value="16:9">16:9 (Horizontal)</SelectItem>
                    <SelectItem value="1:1">1:1 (Quadrat)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Dauer (Sek.)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    placeholder="Min"
                  />
                  <Input
                    type="number"
                    value={durationMax}
                    onChange={(e) => setDurationMax(Number(e.target.value))}
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Anpassbare Felder */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Anpassbare Felder</h2>
            <Button onClick={addField} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Feld hinzufügen
            </Button>
          </div>

          {customizableFields.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Noch keine Felder hinzugefügt. Klicke auf "Feld hinzufügen" um zu starten.
            </p>
          ) : (
            <div className="space-y-4">
              {customizableFields.map((field, index) => (
                <div key={index} className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary">Feld {index + 1}</Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(index)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Feld-Key</Label>
                      <Input
                        value={field.key}
                        onChange={(e) => updateField(index, { key: e.target.value })}
                        placeholder="z.B. product_name"
                      />
                    </div>

                    <div>
                      <Label>Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="z.B. Produktname"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Typ</Label>
                      <Select
                        value={field.type}
                        onValueChange={(v: any) => updateField(index, { type: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="textarea">Textarea</SelectItem>
                          <SelectItem value="image">Bild</SelectItem>
                          <SelectItem value="video">Video</SelectItem>
                          <SelectItem value="color">Farbe</SelectItem>
                          <SelectItem value="number">Nummer</SelectItem>
                          <SelectItem value="select">Auswahl</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Placeholder</Label>
                      <Input
                        value={field.placeholder}
                        onChange={(e) => updateField(index, { placeholder: e.target.value })}
                        placeholder="z.B. Gib deinen Produktnamen ein"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={field.required}
                      onCheckedChange={(checked) => updateField(index, { required: checked })}
                    />
                    <Label>Pflichtfeld</Label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* KI-Features */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">KI-Features</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>KI-Skript Generator</Label>
                <p className="text-sm text-muted-foreground">
                  Automatische Skript-Generierung basierend auf Eingaben
                </p>
              </div>
              <Switch checked={aiScriptEnabled} onCheckedChange={setAiScriptEnabled} />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>KI-Voiceover</Label>
                <p className="text-sm text-muted-foreground">
                  Text-to-Speech für automatische Sprachausgabe
                </p>
              </div>
              <Switch checked={aiVoiceoverEnabled} onCheckedChange={setAiVoiceoverEnabled} />
            </div>
          </div>
        </Card>

        {/* Sichtbarkeit */}
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <Label>Öffentlich verfügbar</Label>
              <p className="text-sm text-muted-foreground">
                Template für alle Nutzer sichtbar machen
              </p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>
        </Card>
      </div>
    </div>
  );
}
