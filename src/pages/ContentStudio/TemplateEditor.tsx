import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export default function TemplateEditor() {
  const navigate = useNavigate();
  const { templateId } = useParams();
  const mode = templateId ? 'edit' : 'create';

  const [template, setTemplate] = useState({
    name: '',
    description: '',
    content_type: 'ad',
    category: 'product',
    platforms: ['instagram'],
    aspect_ratios: ['9:16'],
    duration_range: { min: 15, max: 30 },
    scenes: [],
    customizable_fields: [],
    ai_script_enabled: true,
    ai_voiceover_enabled: true,
  });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!template.name.trim()) {
      toast.error('Bitte gib einen Template-Namen ein');
      return;
    }

    setIsSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-custom-template', {
        body: { template, mode }
      });

      if (error) throw error;

      toast.success('Template gespeichert!');
      navigate('/content-studio');
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(error.message || 'Fehler beim Speichern');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Template-Editor</h1>
        <p className="text-muted-foreground">Erstelle dein eigenes Video-Template</p>
      </div>

      {/* Basic Settings */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Basis-Einstellungen</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Template-Name</Label>
            <Input
              value={template.name}
              onChange={(e) => setTemplate(prev => ({ ...prev, name: e.target.value }))}
              placeholder="z.B. Produkt-Showcase Modern"
            />
          </div>
          
          <div>
            <Label>Content-Typ</Label>
            <Select value={template.content_type} onValueChange={(val) => setTemplate(prev => ({ ...prev, content_type: val }))}>
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
            <Select value={template.category} onValueChange={(val) => setTemplate(prev => ({ ...prev, category: val }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Produkt</SelectItem>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="event">Event</SelectItem>
                <SelectItem value="personal">Personal Branding</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Dauer (Sekunden)</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={template.duration_range.min}
                onChange={(e) => setTemplate(prev => ({
                  ...prev,
                  duration_range: { ...prev.duration_range, min: parseInt(e.target.value) }
                }))}
                placeholder="Min"
              />
              <Input
                type="number"
                value={template.duration_range.max}
                onChange={(e) => setTemplate(prev => ({
                  ...prev,
                  duration_range: { ...prev.duration_range, max: parseInt(e.target.value) }
                }))}
                placeholder="Max"
              />
            </div>
          </div>
        </div>

        <div className="mt-4">
          <Label>Beschreibung</Label>
          <Textarea
            value={template.description}
            onChange={(e) => setTemplate(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Beschreibe dein Template..."
            rows={3}
          />
        </div>
      </Card>

      {/* AI Features */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">KI-Funktionen</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={template.ai_script_enabled}
              onCheckedChange={(val) => setTemplate(prev => ({ ...prev, ai_script_enabled: val }))}
            />
            <Label>AI-Script-Generator aktivieren</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={template.ai_voiceover_enabled}
              onCheckedChange={(val) => setTemplate(prev => ({ ...prev, ai_voiceover_enabled: val }))}
            />
            <Label>AI-Voiceover aktivieren</Label>
          </div>
        </div>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => navigate(-1)}>
          Abbrechen
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Speichere...' : mode === 'create' ? 'Template erstellen' : 'Änderungen speichern'}
        </Button>
      </div>
    </div>
  );
}
