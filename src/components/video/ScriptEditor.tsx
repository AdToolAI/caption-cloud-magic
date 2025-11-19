import { useState } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Sparkles, 
  Scissors, 
  Briefcase, 
  Target, 
  Heart,
  RotateCcw,
  Clock,
  Type
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ScriptEditorProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  showAIAssist?: boolean;
}

export const ScriptEditor = ({ 
  value, 
  onChange, 
  maxLength = 500,
  showAIAssist = true 
}: ScriptEditorProps) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const { toast } = useToast();

  const wordCount = value.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDuration = Math.ceil(wordCount / 2.5); // ~150 words per minute = 2.5 words per second

  const handleOptimize = async (action: string, label: string) => {
    if (!value.trim()) {
      toast({
        title: "Kein Text vorhanden",
        description: "Bitte gib zuerst einen Text ein.",
        variant: "destructive",
      });
      return;
    }

    setIsOptimizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-script', {
        body: { text: value, action }
      });

      if (error) throw error;

      if (data?.optimizedText) {
        onChange(data.optimizedText);
        toast({
          title: "✨ Optimiert!",
          description: `Skript wurde ${label}.`,
        });
      }
    } catch (error) {
      console.error('Optimization error:', error);
      toast({
        title: "Fehler",
        description: "Skript konnte nicht optimiert werden.",
        variant: "destructive",
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleReset = () => {
    onChange('');
  };

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <Type className="h-4 w-4" />
          <span>{wordCount} Wörter</span>
        </div>
        <div className="flex items-center gap-1">
          <Clock className="h-4 w-4" />
          <span>~{estimatedDuration}s Sprechdauer</span>
        </div>
        <div className="ml-auto">
          {value.length}/{maxLength}
        </div>
      </div>

      {/* Textarea */}
      <div className="space-y-2">
        <Label htmlFor="script">Skript-Text</Label>
        <Textarea
          id="script"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Gib hier deinen Video-Skript ein..."
          className="min-h-[200px] font-mono text-sm"
          maxLength={maxLength}
        />
      </div>

      {/* AI Assist Buttons */}
      {showAIAssist && (
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            AI-Assistent
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptimize('shorten', 'gekürzt')}
              disabled={isOptimizing || !value.trim()}
              className="justify-start"
            >
              <Scissors className="h-4 w-4 mr-2" />
              Kürzer machen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptimize('professional', 'professioneller formuliert')}
              disabled={isOptimizing || !value.trim()}
              className="justify-start"
            >
              <Briefcase className="h-4 w-4 mr-2" />
              Professioneller
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptimize('cta', 'mit CTA versehen')}
              disabled={isOptimizing || !value.trim()}
              className="justify-start"
            >
              <Target className="h-4 w-4 mr-2" />
              CTA hinzufügen
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleOptimize('emotional', 'emotionaler gestaltet')}
              disabled={isOptimizing || !value.trim()}
              className="justify-start"
            >
              <Heart className="h-4 w-4 mr-2" />
              Emotionaler
            </Button>
          </div>
        </div>
      )}

      {/* Reset Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleReset}
        disabled={!value.trim()}
        className="w-full"
      >
        <RotateCcw className="h-4 w-4 mr-2" />
        Zurücksetzen
      </Button>
    </div>
  );
};
