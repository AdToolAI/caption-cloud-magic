import { motion } from 'framer-motion';
import { Sparkles, Hand, ArrowRight, Clock, Zap, Palette, Video, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { VideoCategory } from '@/types/universal-video-creator';
import { ALL_CATEGORY_INTERVIEWS } from '@/config/universal-video-interviews';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocalizedVideoCategories } from '@/hooks/useLocalizedVideoCategories';

export type UniversalGenerationMode = 'full-service' | 'manual';

interface UniversalModeSelectorProps {
  selectedCategory: VideoCategory;
  onSelectMode: (mode: UniversalGenerationMode) => void;
  onBack: () => void;
}

export function UniversalModeSelector({ selectedCategory, onSelectMode, onBack }: UniversalModeSelectorProps) {
  const { t } = useTranslation();
  const localizedCategories = useLocalizedVideoCategories();
  const category = localizedCategories.find(c => c.category === selectedCategory);
  const interview = ALL_CATEGORY_INTERVIEWS[selectedCategory];
  const questionCount = interview?.phases?.length || 20;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Category Badge */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <button 
          onClick={onBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4 hover:bg-[#F5C76A]/20 transition-colors cursor-pointer"
        >
          <Video className="h-4 w-4 text-[#F5C76A]" />
          <span className="text-sm font-medium text-[#F5C76A]">{category?.name}</span>
          <span className="text-xs text-muted-foreground">• {t('uvc.changeCategory')}</span>
        </button>
        
        <h2 className="text-3xl font-bold mb-4">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            {t('uvc.modeHeading', { name: category?.name || '' })}
          </span>
        </h2>
        <p className="text-muted-foreground text-lg">
          {t('uvc.modeSubheading')}
        </p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Full-Service Mode */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02 }}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-300",
            "bg-gradient-to-br from-[#F5C76A]/10 via-purple-500/5 to-cyan-500/10",
            "border-[#F5C76A]/30 hover:border-[#F5C76A]/60",
            "hover:shadow-[0_0_40px_rgba(245,199,106,0.2)]"
          )}
          onClick={() => onSelectMode('full-service')}
        >
          {/* Recommended Badge */}
          <div className="absolute top-4 right-4">
            <div className="px-3 py-1 rounded-full bg-[#F5C76A]/20 border border-[#F5C76A]/40 text-xs font-medium text-[#F5C76A]">
              {t('uvc.recommended')}
            </div>
          </div>

          <div className="p-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#F5C76A]/30 to-purple-500/30 flex items-center justify-center mb-6">
              <Sparkles className="h-8 w-8 text-[#F5C76A]" />
            </div>

            <h3 className="text-2xl font-bold mb-2">{t('uvc.fullServiceTitle')}</h3>
            <p className="text-muted-foreground mb-6">
              {t('uvc.fullServiceDesc', { name: category?.name || '' })}
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-[#F5C76A]/20 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-[#F5C76A]" />
                </div>
                <span>{t('uvc.deepQuestions', { count: questionCount })}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-green-400" />
                </div>
                <span>{t('uvc.readyIn')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <Zap className="h-4 w-4 text-cyan-400" />
                </div>
                <span>{t('uvc.noManualWork')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-purple-400" />
                </div>
                <span>{t('uvc.premiumVisuals')}</span>
              </div>
            </div>

            <div className="bg-muted/20 rounded-xl p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-2">{t('uvc.youGet')}:</p>
              <p className="text-sm">
                {t('uvc.youGetList')}
              </p>
            </div>

            <Button 
              size="lg" 
              className={cn(
                "w-full bg-gradient-to-r from-[#F5C76A] via-[#F5C76A] to-amber-500",
                "hover:shadow-[0_0_30px_rgba(245,199,106,0.4)] text-black font-semibold"
              )}
            >
              {t('uvc.startFullService')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>

        {/* Manual Mode */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02 }}
          className={cn(
            "relative overflow-hidden rounded-2xl border-2 cursor-pointer transition-all duration-300",
            "bg-card/60 backdrop-blur-xl",
            "border-white/10 hover:border-white/30",
            "hover:shadow-[0_0_30px_rgba(255,255,255,0.1)]"
          )}
          onClick={() => onSelectMode('manual')}
        >
          <div className="p-8">
            <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-6">
              <Hand className="h-8 w-8 text-foreground" />
            </div>

            <h3 className="text-2xl font-bold mb-2">{t('uvc.manualTitle')}</h3>
            <p className="text-muted-foreground mb-6">
              {t('uvc.manualDesc')}
            </p>

            <div className="space-y-3 mb-8">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Palette className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>{t('uvc.manualF1')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>{t('uvc.manualF2')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Hand className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>{t('uvc.manualF3')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-muted/30 flex items-center justify-center">
                  <Video className="h-4 w-4 text-muted-foreground" />
                </div>
                <span>{t('uvc.manualF4')}</span>
              </div>
            </div>

            <div className="bg-muted/20 rounded-xl p-4 mb-6">
              <p className="text-xs text-muted-foreground mb-2">{t('uvc.manualSteps')}</p>
              <p className="text-sm">
                {t('uvc.manualStepsList')}
              </p>
            </div>

            <Button 
              variant="outline" 
              size="lg" 
              className="w-full"
            >
              {t('uvc.startManual')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      </div>

      {/* Compare note */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-center text-sm text-muted-foreground mt-8"
      >
        {t('uvc.modeSwitchNote')}
      </motion.p>
    </div>
  );
}
