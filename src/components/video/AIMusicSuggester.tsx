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
        title: 'Musik-Vorschläge generiert!',
        description: `${data.recommendations.length} passende Tracks gefunden`
      });
    } catch (error) {
      console.error('Music suggestion error:', error);
      toast({
        title: 'Fehler',
        description: error instanceof Error ? error.message : 'Musik-Vorschläge konnten nicht generiert werden',
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
        <h3 className="font-semibold text-foreground">AI Musik-Vorschläge</h3>
      </div>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Stimmung</Label>
          <Select value={mood} onValueChange={setMood} disabled={loading}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="upbeat">Upbeat / Energetisch</SelectItem>
              <SelectItem value="calm">Ruhig / Entspannt</SelectItem>
              <SelectItem value="dramatic">Dramatisch</SelectItem>
              <SelectItem value="corporate">Corporate / Business</SelectItem>
              <SelectItem value="inspirational">Inspirierend</SelectItem>
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
              <SelectItem value="any">Alle Genres</SelectItem>
              <SelectItem value="electronic">Elektronisch</SelectItem>
              <SelectItem value="acoustic">Akustisch</SelectItem>
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
              Suche passende Musik...
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
