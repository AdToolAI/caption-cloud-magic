import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Button } from '@/components/ui/button';
import { Plus, Sparkles, Lock, Users, Wrench, Loader2 } from 'lucide-react';
import { useBrandCharacters } from '@/hooks/useBrandCharacters';
import { BrandCharacterCard } from '@/components/brand-characters/BrandCharacterCard';
import { AddBrandCharacterDialog } from '@/components/brand-characters/AddBrandCharacterDialog';
import { Card } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { useTrackPageFeature } from "@/hooks/useTrackPageFeature";

const BrandCharacters = () => {
  useTrackPageFeature("brand_characters");
  const { characters, isLoading } = useBrandCharacters();
  const [addOpen, setAddOpen] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const queryClient = useQueryClient();

  const handleRepair = async () => {
    setRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('repair-brand-character-urls');
      if (error) throw error;
      toast.success(`Repaired ${data?.repaired ?? 0} of ${data?.total ?? 0} avatar images`);
      queryClient.invalidateQueries({ queryKey: ['brand-characters'] });
    } catch (e: any) {
      toast.error(e.message || 'Repair failed');
    } finally {
      setRepairing(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Avatar Library — Recurring talent with one-click voice | useadtool</title>
        <meta name="description" content="Save your recurring on-screen talent once. Pick a voice, optionally generate a Hedra-optimized portrait, then make any avatar speak in one click." />
      </Helmet>

      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-10">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
            <div>
              <div className="flex items-center gap-2 text-primary text-sm mb-2">
                <Lock className="h-4 w-4" />
                <span className="tracking-widest uppercase">Avatar Library Lock</span>
              </div>
              <h1 className="font-serif text-4xl md:text-5xl">Your Avatar Library</h1>
              <p className="text-muted-foreground mt-2 max-w-2xl">
                Recurring on-screen talent — one click to make them speak. Upload once, pick a voice, and reuse the same avatar across Kling, Veo, Hailuo, Picture Studio and Talking Head renders.
              </p>
            </div>
            <Button
              onClick={() => setAddOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              size="lg"
            >
              <Plus className="h-4 w-4 mr-2" /> New Avatar
            </Button>
          </div>

          {/* How it works */}
          <div className="grid md:grid-cols-3 gap-4 mb-10">
            <Card className="p-4 bg-card/40 border-primary/15">
              <Sparkles className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-medium mb-1">1. Upload Reference</h3>
              <p className="text-sm text-muted-foreground">A single high-quality image of your character or mascot.</p>
            </Card>
            <Card className="p-4 bg-card/40 border-primary/15">
              <Lock className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-medium mb-1">2. AI Identity Card</h3>
              <p className="text-sm text-muted-foreground">Gemini Vision extracts hair, outfit, features and a prompt-ready descriptor.</p>
            </Card>
            <Card className="p-4 bg-card/40 border-primary/15">
              <Users className="h-5 w-5 text-primary mb-2" />
              <h3 className="font-medium mb-1">3. Lock & Generate</h3>
              <p className="text-sm text-muted-foreground">Pick the character in any studio — image and prompt are auto-injected.</p>
            </Card>
          </div>

          {/* Grid */}
          {isLoading ? (
            <div className="text-center py-20 text-muted-foreground">Loading…</div>
          ) : characters.length === 0 ? (
            <div className="text-center py-20">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="font-serif text-2xl mb-2">No characters yet</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Add your first brand character to lock visual consistency across every video and image you create.
              </p>
              <Button onClick={() => setAddOpen(true)} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Create First Character
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {characters.map((c) => (
                <BrandCharacterCard key={c.id} character={c} />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddBrandCharacterDialog open={addOpen} onOpenChange={setAddOpen} />
    </>
  );
};

export default BrandCharacters;
