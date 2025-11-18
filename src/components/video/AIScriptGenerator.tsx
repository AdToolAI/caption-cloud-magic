import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AIScriptGeneratorProps {
  onGenerate: (script: string) => void;
  fieldLabel?: string;
}

export const AIScriptGenerator = ({ onGenerate, fieldLabel = 'Text' }: AIScriptGeneratorProps) => {
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
        body: { topic: prompt, duration, tone }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      const script = data.script;
      const formattedScript = `HOOK (${script.estimated_duration}s gesamt):
${script.hook}

HAUPTTEIL:
${script.main_content}

CALL-TO-ACTION:
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

  return (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">AI Script Generator</h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Was soll das Video zeigen?</Label>
          <Input
            placeholder="z.B. 'Produktvorstellung für neue App mit Fokus auf Benutzerfreundlichkeit'"
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
                <SelectItem value="professional">Professionell</SelectItem>
                <SelectItem value="casual">Locker</SelectItem>
                <SelectItem value="enthusiastic">Begeistert</SelectItem>
                <SelectItem value="informative">Informativ</SelectItem>
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
                <SelectItem value="15">15 Sekunden</SelectItem>
                <SelectItem value="30">30 Sekunden</SelectItem>
                <SelectItem value="60">60 Sekunden</SelectItem>
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
