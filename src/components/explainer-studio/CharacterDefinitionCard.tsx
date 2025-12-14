import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Sparkles, Loader2, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { CharacterDefinition, ExplainerStyle } from '@/types/explainer-studio';

interface CharacterDefinitionCardProps {
  character: CharacterDefinition;
  style: ExplainerStyle;
  onChange: (character: CharacterDefinition) => void;
}

const GENDER_OPTIONS = [
  { value: 'female' as const, label: 'Weiblich', emoji: '👩' },
  { value: 'male' as const, label: 'Männlich', emoji: '👨' },
  { value: 'neutral' as const, label: 'Neutral', emoji: '🧑' },
];

const AGE_OPTIONS = [
  { value: 'child' as const, label: 'Kind', range: '6-12' },
  { value: 'young-adult' as const, label: 'Jung', range: '18-30' },
  { value: 'adult' as const, label: 'Erwachsen', range: '30-50' },
  { value: 'senior' as const, label: 'Senior', range: '50+' },
];

export function CharacterDefinitionCard({ character, style, onChange }: CharacterDefinitionCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateCharacterSheet = async () => {
    if (!character.hasCharacter) return;
    
    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-character-sheet', {
        body: {
          gender: character.gender || 'neutral',
          ageRange: character.ageRange || 'adult',
          appearance: character.appearance || '',
          clothing: character.clothing || '',
          style: style
        }
      });

      if (error) throw error;

      if (data?.imageUrl) {
        onChange({
          ...character,
          characterSheetUrl: data.imageUrl,
          styleSeed: data.styleSeed || crypto.randomUUID()
        });
        toast.success('Charakter-Sheet generiert!');
      }
    } catch (err) {
      console.error('Character sheet generation error:', err);
      toast.error('Fehler bei der Charakter-Generierung');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card/60 backdrop-blur-xl border border-white/10 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center">
            <User className="h-5 w-5 text-pink-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Hauptcharakter</h3>
            <p className="text-sm text-muted-foreground">Optional: Definiere eine konsistente Figur</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Label htmlFor="has-character" className="text-sm text-muted-foreground">
            Charakter verwenden
          </Label>
          <Switch
            id="has-character"
            checked={character.hasCharacter}
            onCheckedChange={(checked) => onChange({ ...character, hasCharacter: checked })}
          />
        </div>
      </div>

      <AnimatePresence>
        {character.hasCharacter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4 overflow-hidden"
          >
            {/* Gender Selection */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Geschlecht</Label>
              <div className="flex gap-2">
                {GENDER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onChange({ ...character, gender: option.value })}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl border transition-all",
                      character.gender === option.value
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/20 border-white/10 hover:bg-muted/40"
                    )}
                  >
                    <span className="text-lg">{option.emoji}</span>
                    <span className="text-sm">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Age Selection */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">Altersgruppe</Label>
              <div className="flex gap-2 flex-wrap">
                {AGE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => onChange({ ...character, ageRange: option.value })}
                    className={cn(
                      "flex flex-col items-center px-4 py-2 rounded-xl border transition-all",
                      character.ageRange === option.value
                        ? "bg-primary/20 border-primary/50 text-primary"
                        : "bg-muted/20 border-white/10 hover:bg-muted/40"
                    )}
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <span className="text-xs text-muted-foreground">{option.range}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Appearance Description */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Aussehen (optional)
              </Label>
              <Textarea
                value={character.appearance || ''}
                onChange={(e) => onChange({ ...character, appearance: e.target.value })}
                placeholder="z.B. Kurze braune Haare, freundliches Gesicht, Brille..."
                className="bg-muted/20 border-white/10 min-h-[80px]"
              />
            </div>

            {/* Clothing Description */}
            <div>
              <Label className="text-sm text-muted-foreground mb-2 block">
                Kleidung (optional)
              </Label>
              <Textarea
                value={character.clothing || ''}
                onChange={(e) => onChange({ ...character, clothing: e.target.value })}
                placeholder="z.B. Business-Casual, blaues Hemd, dunkle Jeans..."
                className="bg-muted/20 border-white/10 min-h-[60px]"
              />
            </div>

            {/* Character Sheet Preview */}
            <div className="border-t border-white/5 pt-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm font-medium">Charakter-Sheet</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generateCharacterSheet}
                  disabled={isGenerating}
                  className="gap-2"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generiere...
                    </>
                  ) : character.characterSheetUrl ? (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Neu generieren
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generieren
                    </>
                  )}
                </Button>
              </div>

              <div className="aspect-video bg-muted/20 rounded-xl border border-white/10 overflow-hidden">
                {isGenerating ? (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <Sparkles className="h-8 w-8 text-primary animate-pulse mb-2" />
                    <p className="text-sm text-muted-foreground">Generiere Charakter-Sheet...</p>
                  </div>
                ) : character.characterSheetUrl ? (
                  <div className="relative w-full h-full">
                    <img
                      src={character.characterSheetUrl}
                      alt="Character Sheet"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 right-2">
                      <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded-lg text-xs flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Referenz gespeichert
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <User className="h-12 w-12 text-muted-foreground/30 mb-2" />
                    <p className="text-sm text-muted-foreground">
                      Generiere ein Charakter-Sheet für konsistente Darstellung
                    </p>
                  </div>
                )}
              </div>

              {character.styleSeed && (
                <p className="text-xs text-muted-foreground mt-2">
                  Style-Seed: <code className="bg-muted/30 px-1 rounded">{character.styleSeed.slice(0, 8)}...</code>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
