import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles } from "lucide-react";
import { FacebookPostPreview } from "@/components/post-generator/FacebookPostPreview";
import { InstagramPostPreview } from "@/components/post-generator/InstagramPostPreview";
import { LinkedInPostPreview } from "@/components/post-generator/LinkedInPostPreview";
import { XPostPreview } from "@/components/post-generator/XPostPreview";
import { TikTokPostPreview } from "@/components/post-generator/TikTokPostPreview";
import { useState, useMemo } from "react";
import { Provider } from "@/types/publish";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks/useTranslation";

interface ComposerPreviewProps {
  textContent: string;
  selectedMedia: File[];
  selectedChannels: Provider[];
  profileName?: string;
  profileImage?: string;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  additionalDescription?: string;
}

const platformStyles: Record<Provider, { active: string; hover: string }> = {
  instagram: { active: "bg-gradient-to-r from-pink-500 to-purple-500 shadow-[0_0_15px_hsla(330,80%,60%,0.4)]", hover: "hover:border-pink-500/50" },
  facebook: { active: "bg-[#1877F2] shadow-[0_0_15px_hsla(220,80%,50%,0.4)]", hover: "hover:border-blue-500/50" },
  x: { active: "bg-zinc-800 border-cyan-400/50 shadow-[0_0_15px_hsla(180,80%,50%,0.4)]", hover: "hover:border-cyan-400/50" },
  linkedin: { active: "bg-emerald-600 shadow-[0_0_15px_hsla(150,80%,40%,0.4)]", hover: "hover:border-emerald-500/50" },
  tiktok: { active: "bg-black border-cyan-400/50 shadow-[0_0_15px_hsla(180,80%,50%,0.4)]", hover: "hover:border-cyan-400/50" },
  youtube: { active: "bg-red-600 shadow-[0_0_15px_hsla(0,80%,50%,0.4)]", hover: "hover:border-red-500/50" },
};

export function ComposerPreview({
  textContent, selectedMedia, selectedChannels, profileName, profileImage, hook, caption, hashtags, additionalDescription,
}: ComposerPreviewProps) {
  const { t } = useTranslation();
  const resolvedProfileName = profileName || t('composer.yourProfile');
  const [selectedPlatform, setSelectedPlatform] = useState<Provider | null>(null);

  const mediaPreviewUrl = useMemo(() => {
    if (selectedMedia.length === 0) return null;
    const file = selectedMedia[0] as File & { url?: string };
    if (file.url) return file.url;
    return URL.createObjectURL(file);
  }, [selectedMedia]);

  const activePlatform = selectedPlatform || selectedChannels[0] || null;

  if (selectedChannels.length === 0) {
    return (
      <div className="text-center text-muted-foreground p-12 rounded-xl bg-muted/20 backdrop-blur-sm border border-white/10">
        <motion.div animate={{ rotate: [0, 10, -10, 0] }} transition={{ duration: 2, repeat: Infinity }}>
          <Sparkles className="h-16 w-16 mx-auto mb-4 text-primary/50" />
        </motion.div>
        <p className="text-sm">{t('composer.selectChannelPreview')}</p>
      </div>
    );
  }

  if (!textContent && !mediaPreviewUrl) {
    return (
      <div className="text-center text-muted-foreground p-12 rounded-xl bg-muted/20 backdrop-blur-sm border border-white/10">
        <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }}>
          <Sparkles className="h-16 w-16 mx-auto mb-4 text-primary/50" />
        </motion.div>
        <p className="text-sm">{t('composer.previewAfterInput')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {selectedChannels.length > 1 && (
        <div className="flex gap-2 flex-wrap justify-center">
          {selectedChannels.map((channel) => {
            const isActive = activePlatform === channel;
            const styles = platformStyles[channel];
            return (
              <motion.div key={channel} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Button variant="outline" size="sm" onClick={() => setSelectedPlatform(channel)} className={cn("capitalize transition-all duration-300 border-white/10", isActive ? cn("text-white border-transparent", styles.active) : cn("bg-muted/30 backdrop-blur-sm", styles.hover))}>
                  {channel === 'x' ? 'X' : channel}
                </Button>
              </motion.div>
            );
          })}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={activePlatform} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} className="rounded-xl p-4 bg-muted/20 backdrop-blur-sm border border-white/10">
          {activePlatform === 'facebook' && (
            <FacebookPostPreview mediaUrl={mediaPreviewUrl || ''} mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'} caption={caption || textContent} hook={hook || ""} hashtags={hashtags || []} profileName={resolvedProfileName} profileImage={profileImage} additionalDescription={additionalDescription} />
          )}
          {activePlatform === 'instagram' && (
            <InstagramPostPreview mediaUrl={mediaPreviewUrl || ''} mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'} caption={caption || textContent} hook={hook || ""} hashtags={hashtags || []} username={resolvedProfileName.toLowerCase().replace(/\s+/g, '_')} profileImage={profileImage} />
          )}
          {activePlatform === 'linkedin' && (
            <LinkedInPostPreview mediaUrl={mediaPreviewUrl || ''} mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'} caption={caption || textContent} hook={hook || ""} hashtags={hashtags || []} profileName={resolvedProfileName} jobTitle="Marketing Manager" profileImage={profileImage} />
          )}
          {activePlatform === 'x' && (
            <XPostPreview mediaUrl={mediaPreviewUrl || ''} mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'} caption={(caption || textContent).slice(0, 280)} hashtags={hashtags || []} displayName={resolvedProfileName} handle={`@${resolvedProfileName.toLowerCase().replace(/\s+/g, '_')}`} profileImage={profileImage} verified={false} />
          )}
          {activePlatform === 'tiktok' && (
            <TikTokPostPreview mediaUrl={mediaPreviewUrl || ''} mediaType={selectedMedia[0]?.type.startsWith('video/') ? 'video' : 'image'} caption={(caption || textContent).slice(0, 2200)} hashtags={hashtags || []} profileName={resolvedProfileName} profileImage={profileImage} />
          )}
          {activePlatform === 'youtube' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">{t('composer.ytVideoPreview')}</p>
              {mediaPreviewUrl && selectedMedia[0]?.type.startsWith('video/') ? (
                <video src={mediaPreviewUrl} controls className="w-full rounded-lg" style={{ maxHeight: '500px' }}>
                  {t('composer.browserNoVideo')}
                </video>
              ) : (
                <Alert className="bg-muted/30 border-white/10">
                  <AlertDescription>{t('composer.uploadVideoForYt')}</AlertDescription>
                </Alert>
              )}
              <p className="text-xs text-muted-foreground">{t('composer.ytSettingsHint')}</p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
