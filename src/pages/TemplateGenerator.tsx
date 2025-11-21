import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles, Upload, Link as LinkIcon } from 'lucide-react';
import { useTemplateGenerator } from '@/hooks/useTemplateGenerator';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export default function TemplateGenerator() {
  const [templateName, setTemplateName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const { loading, generatedTemplate, generateFromPost } = useTemplateGenerator();
  const { toast } = useToast();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);

    // Upload to Supabase Storage
    const fileName = `template-sources/${Date.now()}_${file.name}`;
    const { data, error } = await supabase.storage
      .from('media-assets')
      .upload(fileName, file);

    if (error) {
      toast({
        title: 'Fehler',
        description: 'Upload fehlgeschlagen',
        variant: 'destructive',
      });
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('media-assets')
      .getPublicUrl(fileName);

    setSourceUrl(publicUrl);
  };

  const handleGenerate = async () => {
    if (!templateName) {
      toast({
        title: 'Fehler',
        description: 'Bitte gib einen Template-Namen ein',
        variant: 'destructive',
      });
      return;
    }

    if (!sourceUrl) {
      toast({
        title: 'Fehler',
        description: 'Bitte lade eine Datei hoch oder gib eine URL ein',
        variant: 'destructive',
      });
      return;
    }

    await generateFromPost({
      source_url: sourceUrl,
      template_name: templateName,
    });
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Template Generator</h1>
        <p className="text-muted-foreground">
          Erstelle wiederverwendbare Templates aus erfolgreichen Posts
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Quelle auswählen
          </h3>

          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="z.B. Produkt Showcase"
              />
            </div>

            <div>
              <Label>Option 1: Video/Bild hochladen</Label>
              <label className="flex items-center justify-center gap-2 p-8 border-2 border-dashed border-muted rounded cursor-pointer hover:border-primary transition-colors mt-2">
                <Upload className="h-5 w-5" />
                <span>{uploadedFile ? uploadedFile.name : 'Datei hochladen'}</span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Oder</span>
              </div>
            </div>

            <div>
              <Label>Option 2: URL eingeben</Label>
              <div className="flex gap-2 mt-2">
                <LinkIcon className="h-5 w-5 text-muted-foreground mt-2" />
                <Input
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://..."
                  disabled={!!uploadedFile}
                />
              </div>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={loading || !templateName || !sourceUrl}
              className="w-full gap-2"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? 'Generiere Template...' : 'Template generieren'}
            </Button>
          </div>
        </Card>

        {generatedTemplate && (
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">✅ Template erstellt</h3>
            <div className="space-y-3">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{generatedTemplate.template_name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Anpassbare Felder</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {generatedTemplate.customizable_fields?.map((field: any, idx: number) => (
                    <div key={idx} className="px-3 py-1 bg-primary/10 rounded text-sm">
                      {field.label}
                    </div>
                  ))}
                </div>
              </div>

              {generatedTemplate.extracted_style && (
                <div>
                  <p className="text-sm text-muted-foreground">Extrahierter Stil</p>
                  <div className="mt-2 p-3 bg-muted rounded">
                    <pre className="text-xs">
                      {JSON.stringify(generatedTemplate.extracted_style, null, 2)}
                    </pre>
                  </div>
                </div>
              )}

              <Button
                onClick={() => {
                  window.location.href = '/content-studio';
                }}
                className="w-full"
              >
                Template im Content Studio verwenden
              </Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
