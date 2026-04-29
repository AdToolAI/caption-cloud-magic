import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Sparkles, Upload, ImageIcon, Loader2, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAvatarPortrait } from '@/hooks/useAvatarPortrait';
import { useBrandCharacters, type BrandCharacter } from '@/hooks/useBrandCharacters';

type PortraitMode = 'original' | 'auto_generated' | 'manual_upload';

interface AvatarPortraitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatar: BrandCharacter;
}

export const AvatarPortraitDialog = ({ open, onOpenChange, avatar }: AvatarPortraitDialogProps) => {
  const { toast } = useToast();
  const { generate, loading: generating } = useAvatarPortrait();
  const { updateAvatar } = useBrandCharacters();
  const [uploading, setUploading] = useState(false);

  const currentMode: PortraitMode = (avatar.portrait_mode ?? 'original') as PortraitMode;
  const previewUrl =
    currentMode === 'original' || !avatar.portrait_url
      ? avatar.reference_image_url
      : avatar.portrait_url;

  const handleSetMode = async (mode: PortraitMode) => {
    if (mode === 'original') {
      await updateAvatar.mutateAsync({
        id: avatar.id,
        portrait_mode: 'original',
      });
      toast({ title: 'Using original reference image for Talking Head' });
      return;
    }
    if (mode === 'auto_generated') {
      const result = await generate(avatar.id);
      if (result) {
        toast({
          title: 'Hedra portrait ready',
          description: 'Frontal portrait optimized for lipsync.',
        });
      }
      return;
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/portraits/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('brand-characters')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('brand-characters')
        .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      if (!signed?.signedUrl) throw new Error('Could not create signed URL');

      await updateAvatar.mutateAsync({
        id: avatar.id,
        portrait_url: signed.signedUrl,
        portrait_mode: 'manual_upload',
      });
      toast({ title: 'Portrait uploaded' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Talking-Head Portrait</DialogTitle>
          <DialogDescription>
            Choose which image is sent to Hedra for lipsync. A frontal centered portrait gives the best results.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* Preview */}
          <div className="aspect-square rounded-lg overflow-hidden bg-background/40 border border-primary/10">
            {previewUrl ? (
              <img src={previewUrl} alt={avatar.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">
                No portrait set
              </div>
            )}
          </div>

          {/* Mode Options */}
          <div className="space-y-2">
            <ModeCard
              icon={<ImageIcon className="h-4 w-4" />}
              title="Use original image"
              subtitle="Fast, free. Quality depends on your reference."
              active={currentMode === 'original'}
              onClick={() => handleSetMode('original')}
              loading={false}
            />
            <ModeCard
              icon={<Sparkles className="h-4 w-4" />}
              title="Auto-generate Hedra portrait"
              subtitle="AI restyles to a centered frontal portrait. ~1 credit."
              active={currentMode === 'auto_generated'}
              onClick={() => handleSetMode('auto_generated')}
              loading={generating}
            />
            <Card
              className={`p-3 border transition cursor-pointer ${
                currentMode === 'manual_upload'
                  ? 'border-primary/60 bg-primary/5'
                  : 'border-primary/15 hover:border-primary/40 bg-card/40'
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <div className="mt-0.5 text-primary">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium flex items-center gap-2">
                    Upload your own portrait
                    {currentMode === 'manual_upload' && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    JPG/PNG, square frontal portrait recommended.
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </Card>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function ModeCard({
  icon, title, subtitle, active, onClick, loading,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <Card
      onClick={loading ? undefined : onClick}
      className={`p-3 border transition cursor-pointer ${
        active ? 'border-primary/60 bg-primary/5' : 'border-primary/15 hover:border-primary/40 bg-card/40'
      } ${loading ? 'opacity-60 cursor-wait' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 text-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium flex items-center gap-2">
            {title}
            {active && !loading && <Check className="h-3.5 w-3.5 text-primary" />}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>
        </div>
      </div>
    </Card>
  );
}
