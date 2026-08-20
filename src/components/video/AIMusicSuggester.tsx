import { tx } from "@/lib/i18nText";
import { useState } from 'react';
import { Music, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';

interface MusicRecommendation {
  name: string;
  artist: string;
  mood: string;
  shotstack_id: string;
  description: string;
}

interface AIMusicSuggesterProps {
  onSelect: (music: MusicRecommendation) => void;
}

export const AIMusicSuggester = ({ onSelect }: AIMusicSuggesterProps) => {
  const [mood, setMood] = useState('upbeat');
  const [genre, setGenre] = useState('any');
  const [loading, setLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<MusicRecommendation[]>([]);
  const { toast } = useToast();

  const handleSuggest = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-video-music', {
        body: { mood, genre, duration: 30 }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error);

      setRecommendations(data.recommendations);
      toast({
        title: tx({ de: "Musik-Vorschläge generiert!", en: "Music suggestions generated!", es: "¡Sugerencias de música generadas!" }),
        description: tx({
          de: `${data.recommendations.length} passende Tracks gefunden`,
          en: `${data.recommendations.length} matching tracks found`,
          es: `${data.recommendations.length} pistas coincidentes encontradas`,
        })
      });
    } catch (error) {
      console.error('Music suggestion error:', error);
      toast({
        title: tx({ de: 'Fehler', en: 'Mistake', es: 'Error' }),
        description: error instanceof Error ? error.message : tx({ de: 'Musik-Vorschläge konnten nicht generiert werden', en: 'Music suggestions could not be generated', es: 'No se pudieron generar sugerencias musicales' }),
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <Music className="h-5 w-5 text-primary" />
        <h3 className="font-semibold text-foreground">{tx({ de: "AI Musik-Vorschläge", en: "AI Music Suggestions", es: "Sugerencias de música con IA" })}</h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>{tx({ de: "Stimmung", en: "Mood", es: "Ambiente" })}</Label>
          <Select value={mood} onValueChange={setMood} disabled={loading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upbeat">{tx({ de: "Upbeat / Energetisch", en: "Upbeat / Energetic", es: "Animado / Enérgico" })}</SelectItem>
              <SelectItem value="calm">{tx({ de: "Ruhig / Entspannt", en: "Calm / Relaxed", es: "Tranquilo / Relajado" })}</SelectItem>
              <SelectItem value="dramatic">{tx({ de: "Dramatisch", en: "Dramatic", es: "Dramático" })}</SelectItem>
              <SelectItem value="corporate">{tx({ de: "Corporate / Business", en: "Corporate / Business", es: "Corporativo / Negocios" })}</SelectItem>
              <SelectItem value="inspirational">{tx({ de: "Inspirierend", en: "Inspirational", es: "Inspirador" })}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Genre</Label>
          <Select value={genre} onValueChange={setGenre} disabled={loading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{tx({ de: "Alle Genres", en: "All genres", es: "Todos los géneros" })}</SelectItem>
              <SelectItem value="electronic">{tx({ de: "Elektronisch", en: "Electronic", es: "Electrónica" })}</SelectItem>
              <SelectItem value="acoustic">{tx({ de: "Akustisch", en: "Acoustic", es: "Acústica" })}</SelectItem>
              <SelectItem value="cinematic">Cinematic</SelectItem>
              <SelectItem value="pop">Pop</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleSuggest} 
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {tx({ de: 'Suche passende Musik...', en: 'Searching for matching music...', es: 'Buscando música adecuada...' })}
            </>
          ) : (
            <>
              <Music className="mr-2 h-4 w-4" />
              Musik vorschlagen (5 Credits)
            </>
          )}
        </Button>

        {recommendations.length > 0 && (
          <div className="space-y-2">
            <Label>Empfohlene Tracks</Label>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <Card 
                  key={idx} 
                  className="p-3 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => onSelect(rec)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{rec.name}</div>
                      <div className="text-sm text-muted-foreground">{rec.artist}</div>
                      <div className="text-xs text-muted-foreground mt-1">{rec.description}</div>
                    </div>
                    <div className="text-xs px-2 py-1 bg-secondary rounded-full">
                      {rec.mood}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
