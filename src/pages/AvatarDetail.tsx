import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { AvatarPoseSheet } from '@/components/brand-characters/AvatarPoseSheet';
import { AvatarWardrobeSheet } from '@/components/brand-characters/AvatarWardrobeSheet';
import { WardrobePerspectiveCard } from '@/components/brand-characters/WardrobePerspectiveCard';
import { SavedOutfitsSection } from '@/components/brand-characters/SavedOutfitsSection';
import { SavedOutfitViewerCard } from '@/components/brand-characters/SavedOutfitViewerCard';
import { VoiceProfileCard } from '@/components/avatars/VoiceProfileCard';
import { AvatarDefaultPerformanceCard } from '@/components/avatars/AvatarDefaultPerformanceCard';

import type { OutfitLook } from '@/hooks/useSavedOutfits';

interface SelectedOutfit {
  outfitId: string;
  label: string;
  imageUrl: string;
  themePack: string;
}

type Gender = 'female' | 'male' | 'neutral';

const AvatarDetail = () => {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [selectedOutfit, setSelectedOutfit] = useState<SelectedOutfit | null>(null);
  const [openedLook, setOpenedLook] = useState<OutfitLook | null>(null);
  const [savingGender, setSavingGender] = useState(false);

  const { data: avatar, isLoading } = useQuery({
    queryKey: ['avatar-detail', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('brand_characters').select('*').eq('id', id!).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const previewUrl = avatar?.portrait_url || avatar?.reference_image_url;

  const saveGender = async (g: Gender) => {
    if (!id || savingGender) return;
    setSavingGender(true);
    try {
      const { error } = await supabase
        .from('brand_characters')
        .update({ gender: g } as any)
        .eq('id', id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ['avatar-detail', id] });
      toast.success(`Gender set to ${g}`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save gender');
    } finally {
      setSavingGender(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{avatar?.name ? `${avatar.name} — Avatar Studio` : 'Avatar Studio'}</title>
      </Helmet>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Button asChild variant="ghost" size="sm" className="mb-6">
            <Link to="/avatars"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Library</Link>
          </Button>

          {isLoading ? (
            <div className="flex items-center justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : !avatar ? (
            <Card className="p-12 text-center">Avatar not found.</Card>
          ) : (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-[380px_1fr] gap-6">
                {openedLook ? (
                  <SavedOutfitViewerCard
                    look={openedLook}
                    onBack={() => setOpenedLook(null)}
                  />
                ) : selectedOutfit ? (
                  <WardrobePerspectiveCard
                    avatarId={avatar.id}
                    themePack={selectedOutfit.themePack}
                    outfitId={selectedOutfit.outfitId}
                    outfitLabel={selectedOutfit.label}
                    fallbackImageUrl={selectedOutfit.imageUrl}
                    onBack={() => setSelectedOutfit(null)}
                  />
                ) : (
                  <Card className="p-4 bg-card/60 border-primary/15 h-fit">
                    <div className="aspect-[4/5] rounded-lg overflow-hidden bg-muted/20 mb-3">
                      {previewUrl && (
                        <img src={previewUrl} alt={avatar.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <h1 className="font-serif text-2xl">{avatar.name}</h1>
                    <div className="mt-1.5">
                      <EntityIdBadge id={avatar.id} label="Character-ID" />
                    </div>
                    {avatar.description && (
                      <p className="text-sm text-muted-foreground mt-2">{avatar.description}</p>
                    )}
                    {avatar.default_voice_name && (
                      <p className="text-xs text-primary mt-3">🎙 {avatar.default_voice_name}</p>
                    )}

                    {/* Gender backfill — only shown for legacy avatars without a saved gender */}
                    {!avatar.gender && (
                      <div className="mt-4 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Lock className="h-3 w-3 text-primary" />
                          <p className="text-[11px] font-semibold text-primary">Set gender to lock outfit previews</p>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">
                          Choose once — the wardrobe sheet will only show matching outfits afterwards.
                        </p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {(['female', 'male', 'neutral'] as const).map((g) => (
                            <button
                              key={g}
                              type="button"
                              disabled={savingGender}
                              onClick={() => saveGender(g)}
                              className={cn(
                                'rounded-md border border-border/40 bg-card/30 px-2 py-1.5 text-[10px] font-semibold capitalize transition-all',
                                'hover:border-primary/60 hover:text-primary disabled:opacity-50',
                              )}
                            >
                              {g === 'female' ? '♀ ' : g === 'male' ? '♂ ' : '⚪ '}
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {avatar.gender && (
                      <p className="text-[10px] text-muted-foreground mt-3 inline-flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" /> Wardrobe locked to <span className="capitalize text-primary">{avatar.gender}</span>
                      </p>
                    )}
                  </Card>
                )}

                <div className="space-y-6">
                  <AvatarPoseSheet avatarId={avatar.id} />
                  <AvatarWardrobeSheet
                    avatarId={avatar.id}
                    avatarGender={avatar.gender ?? null}
                    onSelect={(v) => {
                      setOpenedLook(null);
                      setSelectedOutfit({
                        outfitId: v.outfitId,
                        label: v.label,
                        imageUrl: v.imageUrl,
                        themePack: v.themePack,
                      });
                    }}
                  />
                  <VoiceProfileCard avatarId={avatar.id} avatar={avatar} />
                  <AvatarDefaultPerformanceCard
                    avatarId={avatar.id}
                    initial={avatar.default_performance ?? null}
                  />
                </div>

              </div>

              <SavedOutfitsSection
                avatarId={avatar.id}
                onOpen={(look) => {
                  setSelectedOutfit(null);
                  setOpenedLook(look);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AvatarDetail;
