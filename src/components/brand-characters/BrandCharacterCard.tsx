import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, Trash2, TrendingUp, Image as ImageIcon, Mic2, Sparkles, Store, Coins, Clock, ShieldAlert } from 'lucide-react';
import { type BrandCharacter, useBrandCharacters } from '@/hooks/useBrandCharacters';
import { AvatarVoicePicker } from './AvatarVoicePicker';
import { AvatarPortraitDialog } from './AvatarPortraitDialog';
import TalkingHeadDialog from '@/components/video-composer/TalkingHeadDialog';
import { SubmitCharacterToMarketplaceDialog } from '@/components/marketplace/SubmitCharacterToMarketplaceDialog';

interface BrandCharacterCardProps {
  character: BrandCharacter;
}

export const BrandCharacterCard = ({ character }: BrandCharacterCardProps) => {
  const { toggleFavorite, archiveCharacter, updateAvatar } = useBrandCharacters();
  const id = character.visual_identity_json || {};
  const tags: string[] = Array.isArray(id.style_tags) ? id.style_tags.slice(0, 3) : [];

  const [portraitOpen, setPortraitOpen] = useState(false);
  const [speakOpen, setSpeakOpen] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);

  const previewUrl =
    character.portrait_mode && character.portrait_mode !== 'original' && character.portrait_url
      ? character.portrait_url
      : character.reference_image_url;

  const portraitBadge =
    character.portrait_mode === 'auto_generated'
      ? 'AI Portrait'
      : character.portrait_mode === 'manual_upload'
      ? 'Custom Portrait'
      : null;

  const canSpeak = Boolean(character.default_voice_id);

  const mpStatus = character.marketplace_status ?? 'private';
  const mpBadge = (() => {
    if (mpStatus === 'published')
      return { label: character.pricing_type === 'premium' ? `Live · ${character.price_credits ?? 0} cr` : 'Live · Free', icon: Store, className: 'bg-emerald-600 text-white border-0' };
    if (mpStatus === 'pending_review')
      return { label: 'In review', icon: Clock, className: 'bg-amber-500/90 text-white border-0' };
    if (mpStatus === 'under_investigation')
      return { label: 'Investigating', icon: ShieldAlert, className: 'bg-destructive text-destructive-foreground border-0' };
    if (mpStatus === 'rejected')
      return { label: 'Rejected', icon: ShieldAlert, className: 'bg-destructive/80 text-destructive-foreground border-0' };
    return null;
  })();

  return (
    <>
      <Card className="group relative overflow-hidden bg-card/60 backdrop-blur border-primary/15 hover:border-primary/40 transition">
        <div className="aspect-[4/5] relative bg-background/40">
          <img
            src={previewUrl}
            alt={character.name}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
          <button
            onClick={() => toggleFavorite.mutate({ id: character.id, is_favorite: !character.is_favorite })}
            className="absolute top-2 right-2 p-2 rounded-full bg-background/70 backdrop-blur hover:bg-background transition"
            aria-label="Toggle favorite"
          >
            <Star
              className={`h-4 w-4 ${
                character.is_favorite ? 'fill-primary text-primary' : 'text-muted-foreground'
              }`}
            />
          </button>
          {portraitBadge && (
            <Badge className="absolute top-2 left-2 bg-primary/90 text-primary-foreground border-0 text-[10px]">
              <Sparkles className="h-2.5 w-2.5 mr-1" />
              {portraitBadge}
            </Badge>
          )}
          {mpBadge && (
            <Badge className={`absolute bottom-2 left-2 text-[10px] gap-1 ${mpBadge.className}`}>
              <mpBadge.icon className="h-2.5 w-2.5" />
              {mpBadge.label}
            </Badge>
          )}
        </div>

        <div className="p-3 space-y-3">
          <div>
            <h3 className="font-serif text-lg leading-tight">{character.name}</h3>
            {character.description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{character.description}</p>
            )}
          </div>

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.map((t, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] border-primary/30 text-primary/80"
                >
                  {t}
                </Badge>
              ))}
            </div>
          )}

          {/* Voice Picker */}
          <AvatarVoicePicker
            value={character.default_voice_id}
            provider={character.default_voice_provider}
            onChange={(v) => {
              if (!v) {
                updateAvatar.mutate({
                  id: character.id,
                  default_voice_id: null,
                  default_voice_provider: null,
                  default_voice_name: null,
                });
              } else {
                updateAvatar.mutate({
                  id: character.id,
                  default_voice_id: v.voiceId,
                  default_voice_provider: v.provider,
                  default_voice_name: v.name,
                });
              }
            }}
          />

          {/* Portrait + Speak Actions */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-primary/25"
              onClick={() => setPortraitOpen(true)}
            >
              <ImageIcon className="h-3.5 w-3.5 mr-1.5" />
              Portrait
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={!canSpeak}
              onClick={() => setSpeakOpen(true)}
              title={canSpeak ? 'Generate Talking Head' : 'Pick a voice first'}
            >
              <Mic2 className="h-3.5 w-3.5 mr-1.5" />
              Speak
            </Button>
          </div>

          {/* Marketplace action */}
          {(mpStatus === 'private' || mpStatus === 'rejected') && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs border-primary/30 hover:bg-primary/10"
              onClick={() => setSubmitOpen(true)}
            >
              <Store className="h-3.5 w-3.5 mr-1.5" />
              {mpStatus === 'rejected' ? 'Resubmit to Marketplace' : 'Sell on Marketplace'}
            </Button>
          )}
          {mpStatus === 'published' && (
            <div className="flex items-center justify-between text-[11px] text-muted-foreground bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-1">
              <span className="flex items-center gap-1"><Coins className="h-3 w-3" /> {character.total_purchases ?? 0} sold</span>
              <span>★ {Number(character.average_rating ?? 0).toFixed(1)}</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-1 border-t border-primary/10">
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <TrendingUp className="h-3 w-3" />
              {character.usage_count} uses
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-muted-foreground hover:text-destructive"
              onClick={() => {
                if (confirm(`Archive "${character.name}"?`)) archiveCharacter.mutate(character.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      <AvatarPortraitDialog
        open={portraitOpen}
        onOpenChange={setPortraitOpen}
        avatar={character}
      />

      <TalkingHeadDialog
        open={speakOpen}
        onOpenChange={setSpeakOpen}
        presetAvatar={{
          imageUrl: previewUrl,
          voiceId: character.default_voice_id ?? undefined,
          aspectRatio: (character.default_aspect_ratio as '16:9' | '9:16' | '1:1' | undefined) ?? '9:16',
          avatarName: character.name,
        }}
      />

      <SubmitCharacterToMarketplaceDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        character={{ id: character.id, name: character.name }}
      />
    </>
  );
};
