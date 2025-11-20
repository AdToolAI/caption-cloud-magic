import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AIScriptGeneratorProps {
  onGenerate: (script: string) => void;
  fieldLabel?: string;
  contentType?: 'ad' | 'story' | 'reel' | 'tutorial' | 'testimonial' | 'news';
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  ad: 'Werbung',
  story: 'Story',
  reel: 'Reel',
  tutorial: 'Tutorial',
  testimonial: 'Testimonial',
  news: 'News'
};

const CONTENT_TYPE_PLACEHOLDERS: Record<string, string> = {
  ad: 'Beschreibe dein Produkt und Zielgruppe... z.B. "Innovative Fitness-App für vielbeschäftigte Berufstätige"',
  story: 'Welche Story möchtest du erzählen? z.B. "Meine Morgenroutine als Entrepreneur"',
  reel: 'Was ist deine Hook-Idee? z.B. "3 Fehler, die jeder beim Kochen macht"',
  tutorial: 'Was soll das Tutorial zeigen? z.B. "Wie man in 5 Minuten professionelle Fotos macht"',
  testimonial: 'Beschreibe die Erfolgsgeschichte... z.B. "Wie ich 10kg in 3 Monaten abgenommen habe"',
  news: 'Was ist die Breaking News? z.B. "Neue KI-Technologie revolutioniert Marketing"'
};

const CONTENT_TYPE_TONE_PRESETS: Record<string, string[]> = {
  ad: ['professional', 'enthusiastic', 'urgent'],
  story: ['casual', 'personal', 'authentic'],
  reel: ['energetic', 'funny', 'viral'],
  tutorial: ['informative', 'professional', 'friendly'],
  testimonial: ['emotional', 'authentic', 'inspiring'],
  news: ['professional', 'informative', 'neutral']
};

const CONTENT_TYPE_DURATIONS: Record<string, number[]> = {
  ad: [15, 30, 60],
  story: [10, 15],
  reel: [15, 30, 60],
  tutorial: [60, 90, 120],
  testimonial: [30, 60],
  news: [30, 60, 90]
};

export const AIScriptGenerator = ({ onGenerate, fieldLabel = 'Text', contentType }: AIScriptGeneratorProps) => {
  const [prompt, setPrompt] = useState('');
  const [tone, setTone] = useState('professional');
  const [duration, setDuration] = useState(30);
  const [loading, setLoading] = useState(false);
  const [generatedScript, setGeneratedScript] = useState('');
  const { toast } = useToast();

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Fehler',
        description: 'Bitte beschreibe, worum es in deinem Video gehen soll',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-video-script', {
        body: { topic: prompt, duration, tone, content_type: contentType }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      const script = data.script;
      // Format script WITHOUT structural elements - only speakable text
      const formattedScript = `${script.hook}

${script.main_content}

${script.cta}`;
      
      setGeneratedScript(formattedScript);
      toast({
        title: 'Script generiert!',
        description: 'Du kannst das Script jetzt bearbeiten oder direkt verwenden'
      });
    } catch (error) {
      console.error('Script generation error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Script konnte nicht generiert werden',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUseScript = () => {
    onGenerate(generatedScript);
    setGeneratedScript('');
    setPrompt('');
  };

  // Get content-type specific options
  const placeholder = contentType 
    ? CONTENT_TYPE_PLACEHOLDERS[contentType] 
    : 'z.B. "Produktvorstellung für neue App mit Fokus auf Benutzerfreundlichkeit"';
  
  const tonePresets = contentType 
    ? CONTENT_TYPE_TONE_PRESETS[contentType] 
    : ['professional', 'casual', 'enthusiastic', 'informative'];
  
  const durationOptions = contentType 
    ? CONTENT_TYPE_DURATIONS[contentType] 
    : [15, 30, 60];

  return (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold text-foreground">AI Script Generator</h3>
        </div>
        {contentType && (
          <Badge variant="secondary" className="text-xs">
            {CONTENT_TYPE_LABELS[contentType]}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Was soll das Video zeigen?</Label>
          <Input
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Ton</Label>
            <Select value={tone} onValueChange={setTone} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tonePresets.map(t => (
                  <SelectItem key={t} value={t}>
                    {t === 'professional' ? 'Professionell' :
                     t === 'casual' ? 'Locker' :
                     t === 'enthusiastic' ? 'Begeistert' :
                     t === 'informative' ? 'Informativ' :
                     t === 'personal' ? 'Persönlich' :
                     t === 'authentic' ? 'Authentisch' :
                     t === 'energetic' ? 'Energetisch' :
                     t === 'funny' ? 'Lustig' :
                     t === 'viral' ? 'Viral' :
                     t === 'friendly' ? 'Freundlich' :
                     t === 'emotional' ? 'Emotional' :
                     t === 'inspiring' ? 'Inspirierend' :
                     t === 'urgent' ? 'Dringend' :
                     t === 'neutral' ? 'Neutral' : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Dauer (Sekunden)</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map(d => (
                  <SelectItem key={d} value={String(d)}>
                    {d} Sekunden
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button 
          onClick={handleGenerate} 
          disabled={loading || !prompt.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generiere Script...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              Script generieren (5 Credits)
            </>
          )}
        </Button>

        {generatedScript && (
          <div className="space-y-2">
            <Label>Generiertes Script</Label>
            <Textarea
              value={generatedScript}
              onChange={(e) => setGeneratedScript(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <Button onClick={handleUseScript} className="w-full" variant="secondary">
              Dieses Script verwenden
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
