import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AvatarPoseSheet } from '@/components/brand-characters/AvatarPoseSheet';
import { AvatarWardrobeSheet } from '@/components/brand-characters/AvatarWardrobeSheet';

const AvatarDetail = () => {
  const { id } = useParams<{ id: string }>();
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
            <div className="grid lg:grid-cols-[300px_1fr] gap-6">
              <Card className="p-4 bg-card/60 border-primary/15 h-fit">
                <div className="aspect-[4/5] rounded-lg overflow-hidden bg-muted/20 mb-3">
                  <img src={previewUrl} alt={avatar.name} className="w-full h-full object-cover" />
                </div>
                <h1 className="font-serif text-2xl">{avatar.name}</h1>
                {avatar.description && (
                  <p className="text-sm text-muted-foreground mt-1.5">{avatar.description}</p>
                )}
                {avatar.default_voice_name && (
                  <p className="text-xs text-primary mt-3">🎙 {avatar.default_voice_name}</p>
                )}
              </Card>

              <div className="space-y-6">
                <AvatarPoseSheet avatarId={avatar.id} />
                <AvatarWardrobeSheet avatarId={avatar.id} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AvatarDetail;
