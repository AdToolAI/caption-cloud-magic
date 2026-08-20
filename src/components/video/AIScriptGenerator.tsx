import { tx } from "@/lib/i18nText";
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
  ad: tx({ de: 'Werbung', en: 'Ad', es: 'Anuncio' }),
  story: 'Story',
  reel: 'Reel',
  tutorial: 'Tutorial',
  testimonial: 'Testimonial',
  news: 'News'
};

const CONTENT_TYPE_PLACEHOLDERS: Record<string, string> = {
  ad: tx({ de: 'Beschreibe dein Produkt und Zielgruppe... z.B. "Innovative Fitness-App für vielbeschäftigte Berufstätige"', en: 'Describe your product and target audience... e.g. "Innovative fitness app for busy professionals"', es: 'Describe tu producto y público objetivo... p. ej. "Aplicación de fitness innovadora para profesionales ocupados"' }),
  story: tx({ de: 'Welche Story möchtest du erzählen? z.B. "Meine Morgenroutine als Entrepreneur"', en: 'What story do you want to tell? e.g. “My morning routine as an entrepreneur”', es: '¿Qué historia quieres contar? p.ej. “Mi rutina matutina como emprendedora”' }),
  reel: tx({ de: 'Was ist deine Hook-Idee? z.B. "3 Fehler, die jeder beim Kochen macht"', en: 'What\'s your hook idea? e.g. "3 mistakes everyone makes when cooking"', es: '¿Cuál es tu idea de gancho? p. ej. "3 errores que todo el mundo comete al cocinar"' }),
  tutorial: tx({ de: 'Was soll das Tutorial zeigen? z.B. "Wie man in 5 Minuten professionelle Fotos macht"', en: 'What is the tutorial supposed to show? e.g. "How to take professional photos in 5 minutes"', es: '¿Qué se supone que debe mostrar el tutorial? p.ej. "Cómo hacer fotografías profesionales en 5 minutos"' }),
  testimonial: tx({ de: 'Beschreibe die Erfolgsgeschichte... z.B. "Wie ich 10kg in 3 Monaten abgenommen habe"', en: 'Describe the success story... e.g. "How I lost 10kg in 3 months"', es: 'Describe la historia de éxito... p. ej. "Cómo perdí 10kg en 3 meses"' }),
  news: tx({ de: 'Was ist die Breaking News? z.B. "Neue KI-Technologie revolutioniert Marketing"', en: 'What\'s the breaking news? e.g. "New AI technology revolutionizes marketing"', es: '¿Cuál es la noticia de última hora? p. ej. "Nueva tecnología de IA revoluciona el marketing"' })
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
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: tx({ de: 'Bitte beschreibe, worum es in deinem Video gehen soll', en: 'Please describe what your video should be about', es: 'Por favor describe de qué debería tratar tu vídeo.' }),
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
        title: tx({ de: 'Script generiert!', en: 'Script generated!', es: '¡Guion generado!' }),
        description: tx({ de: 'Du kannst das Script jetzt bearbeiten oder direkt verwenden', en: 'You can now edit the script or use it directly', es: 'Ahora puedes editar el guion o usarlo directamente' })
      });
    } catch (error) {
      console.error('Script generation error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Script konnte nicht generiert werden', en: 'Script could not be generated', es: 'No se pudo generar el guion' }),
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
    : tx({ de: 'z.B. "Produktvorstellung für neue App mit Fokus auf Benutzerfreundlichkeit"', en: 'e.g. "Product presentation for new app with focus on user-friendliness"', es: 'p. ej. "Presentación de producto para nueva aplicación con enfoque en la facilidad de uso"' });
  
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
          <h3 className="font-semibold text-foreground">{tx({ de: "AI Script Generator", en: "AI Script Generator", es: "Generador de guiones IA" })}</h3>
        </div>
        {contentType && (
          <Badge variant="secondary" className="text-xs">
            {CONTENT_TYPE_LABELS[contentType]}
          </Badge>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>{tx({ de: "Was soll das Video zeigen?", en: "What should the video show?", es: "¿Qué debería mostrar el vídeo?" })}</Label>
          <Input
            placeholder={placeholder}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>{tx({ de: "Ton", en: "Tone", es: "Tono" })}</Label>
            <Select value={tone} onValueChange={setTone} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tonePresets.map(t => (
                  <SelectItem key={t} value={t}>
                    {t === 'professional' ? tx({ de: 'Professionell', en: 'Professional', es: 'Profesional' }) :
                     t === 'casual' ? tx({ de: 'Locker', en: 'Casual', es: 'Informal' }) :
                     t === 'enthusiastic' ? tx({ de: 'Begeistert', en: 'Enthusiastic', es: 'Entusiasta' }) :
                     t === 'informative' ? tx({ de: 'Informativ', en: 'Informative', es: 'Informativo' }) :
                     t === 'personal' ? tx({ de: tx({ de: "Persönlich", en: "Personal", es: "Personal" }), en: 'Personal', es: 'Personal' }) :
                     t === 'authentic' ? tx({ de: 'Authentisch', en: 'Authentic', es: 'Auténtico' }) :
                     t === 'energetic' ? tx({ de: 'Energetisch', en: 'Energetic', es: 'Energético' }) :
                     t === 'funny' ? tx({ de: 'Lustig', en: 'Funny', es: 'Divertido' }) :
                     t === 'viral' ? 'Viral' :
                     t === 'friendly' ? tx({ de: 'Freundlich', en: 'Friendly', es: 'Amistoso' }) :
                     t === 'emotional' ? 'Emotional' :
                     t === 'inspiring' ? tx({ de: 'Inspirierend', en: 'Inspiring', es: 'Inspirador' }) :
                     t === 'urgent' ? tx({ de: 'Dringend', en: 'Urgent', es: 'Urgente' }) :
                     t === 'neutral' ? 'Neutral' : t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{tx({ de: "Dauer (Sekunden)", en: "Duration (seconds)", es: "Duración (segundos)" })}</Label>
            <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {durationOptions.map(d => (
                  <SelectItem key={d} value={String(d)}>
                    {d} {tx({ de: "Sekunden", en: "seconds", es: "segundos" })}
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
              {tx({ de: "Generiere Script...", en: "Generating script...", es: "Generando guion..." })}
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" />
              {tx({ de: "Script generieren (5 Credits)", en: "Generate script (5 credits)", es: "Generar guion (5 créditos)" })}
            </>
          )}
        </Button>

        {generatedScript && (
          <div className="space-y-2">
            <Label>{tx({ de: "Generiertes Script", en: "Generated script", es: "Guion generado" })}</Label>
            <Textarea
              value={generatedScript}
              onChange={(e) => setGeneratedScript(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <Button onClick={handleUseScript} className="w-full" variant="secondary">
              {tx({ de: "Dieses Script verwenden", en: "Use this script", es: "Usar este guion" })}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
