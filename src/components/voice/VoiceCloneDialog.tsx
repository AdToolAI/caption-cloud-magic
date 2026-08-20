import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, X } from 'lucide-react';
import { useCustomVoices } from '@/hooks/useCustomVoices';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { tx } from '@/lib/i18nText';

interface VoiceCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoiceCloneDialog({ open, onOpenChange }: VoiceCloneDialogProps) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState('en');
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const { cloneVoice, loading } = useCustomVoices();
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAudioFiles(prev => [...prev, ...files].slice(0, 5)); // Max 5 samples
  };

  const handleRemoveFile = (index: number) => {
    setAudioFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!name || audioFiles.length < 1) {
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: tx({ de: 'Mindestens 1 Audio-Sample erforderlich', en: 'At least 1 audio sample required', es: 'Se requiere al menos 1 muestra de audio' }),
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      // Upload audio files to Supabase Storage
      const uploadPromises = audioFiles.map(async (file) => {
        const fileName = `voice-samples/${Date.now()}_${file.name}`;
        const { data, error } = await supabase.storage
          .from('voiceover-audio')
          .upload(fileName, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabase.storage
          .from('voiceover-audio')
          .getPublicUrl(fileName);

        return publicUrl;
      });

      const sampleUrls = await Promise.all(uploadPromises);

      // Clone voice with ElevenLabs
      await cloneVoice(name, sampleUrls, language);

      // Reset and close
      setName('');
      setLanguage('en');
      setAudioFiles([]);
      onOpenChange(false);
    } catch (error) {
      console.error('Error uploading samples:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Error', es: 'Error' }),
        description: tx({ de: 'Upload fehlgeschlagen', en: 'Upload failed', es: 'Carga fallida' }),
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tx({ de: "Voice klonen", en: "Clone voice", es: "Clonar voz" })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="voice-name">{tx({ de: "Voice Name", en: "Voice name", es: "Nombre de la voz" })}</Label>
            <Input
              id="voice-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={tx({ de: "z.B. Meine Stimme", en: "e.g. My voice", es: "p. ej. Mi voz" })}
            />
          </div>

          <div>
            <Label htmlFor="language">{tx({ de: "Sprache", en: "Language", es: "Idioma" })}</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>{tx({ de: "Audio-Samples (min. 3)", en: "Audio samples (min. 3)", es: "Muestras de audio (mín. 3)" })}</Label>
            <div className="mt-2 space-y-2">
              {audioFiles.map((file, index) => (
                <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                  <span className="text-sm truncate flex-1">{file.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveFile(index)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {audioFiles.length < 5 && (
                <label className="flex items-center justify-center gap-2 p-4 border-2 border-dashed border-muted rounded cursor-pointer hover:border-primary transition-colors">
                  <Upload className="h-4 w-4" />
                  <span className="text-sm">{tx({ de: "Audio hochladen (.mp3, .wav)", en: "Upload audio (.mp3, .wav)", es: "Subir audio (.mp3, .wav)" })}</span>
                  <input
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {audioFiles.length}/5 Samples ({audioFiles.length < 1 ? tx({ de: tx({ de: "mindestens 1 erforderlich", en: "at least 1 required", es: "se requiere al menos 1" }), en: 'at least 1 required', es: 'se requiere al menos 1' }) : tx({ de: 'bereit zum Klonen', en: 'ready to clone', es: 'listo para clonar' })})
            </p>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={loading || uploading || audioFiles.length < 1}
            className="w-full"
          >
            {uploading ? tx({ de: tx({ de: "Lädt hoch...", en: "Uploading...", es: "Subiendo..." }), en: 'Uploading...', es: 'Subiendo...' }) : loading ? tx({ de: 'Klont Voice...', en: 'Cloning voice...', es: 'Clonando voz...' }) : tx({ de: 'Voice klonen', en: 'Clone voice', es: 'Clonar voz' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
