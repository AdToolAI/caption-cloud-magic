import { motion } from 'framer-motion';
import { 
  Building2, ShoppingBag, BookOpen, Wand2,
  ArrowRight, Check, MessageSquare, ImageIcon, Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { type VideoCategory } from '@/types/universal-video-creator';
import { ALL_CATEGORY_INTERVIEWS } from '@/config/universal-video-interviews';
import { useTranslation } from '@/hooks/useTranslation';
import { useLocalizedVideoCategories } from '@/hooks/useLocalizedVideoCategories';

interface CategorySelectorProps {
  selectedCategory: VideoCategory | null;
  onSelectCategory: (category: VideoCategory) => void;
}

const CATEGORY_ICONS: Record<VideoCategory, React.ComponentType<{ className?: string }>> = {
  'corporate-ad': Building2,
  'product-ad': ShoppingBag,
  storytelling: BookOpen,
  custom: Wand2,
};

const CATEGORY_COLORS: Record<VideoCategory, string> = {
  'corporate-ad': 'from-blue-500/20 to-indigo-500/20 border-blue-500/30',
  'product-ad': 'from-green-500/20 to-emerald-500/20 border-green-500/30',
  storytelling: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
  custom: 'from-violet-500/20 to-purple-600/20 border-violet-500/30',
};

const CATEGORY_BADGES: Record<VideoCategory, { icon: React.ComponentType<{ className?: string }>; label: string } | null> = {
  'corporate-ad': null,
  'product-ad': { icon: ImageIcon, label: 'Min. 4 Bilder' },
  storytelling: { icon: Sparkles, label: 'KI-Story' },
  custom: null,
};

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  const { t } = useTranslation();
  const localizedCategories = useLocalizedVideoCategories();

  return (
    <div className="max-w-4xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div 
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/30 mb-4"
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#F5C76A] opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#F5C76A]" />
          </span>
          <span className="text-sm font-medium text-[#F5C76A]">{t('uvc.categoriesAvailable')}</span>
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-3">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            {t('uvc.chooseCategoryHeading')}
          </span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          {t('uvc.chooseCategoryDesc')}
        </p>
      </motion.div>

      {/* Category Grid — 4 large cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {localizedCategories.map((categoryInfo, index) => {
          const Icon = CATEGORY_ICONS[categoryInfo.category];
          const colorClass = CATEGORY_COLORS[categoryInfo.category];
          const isSelected = selectedCategory === categoryInfo.category;
          const interviewConfig = ALL_CATEGORY_INTERVIEWS[categoryInfo.category];
          const questionCount = interviewConfig?.phases?.length || 20;
          const badge = CATEGORY_BADGES[categoryInfo.category];

          return (
            <motion.div
              key={categoryInfo.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectCategory(categoryInfo.category)}
              className={cn(
                "relative p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300",
                "bg-gradient-to-br backdrop-blur-xl overflow-hidden group",
                colorClass,
                isSelected && "ring-2 ring-[#F5C76A] shadow-[0_0_30px_rgba(245,199,106,0.3)]"
              )}
            >
              {/* Selected indicator */}
              {isSelected && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#F5C76A] flex items-center justify-center"
                >
                  <Check className="h-4 w-4 text-black" />
                </motion.div>
              )}

              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={cn(
                  "w-14 h-14 rounded-xl flex items-center justify-center shrink-0",
                  "bg-white/10 border border-white/20 group-hover:border-[#F5C76A]/50",
                  "transition-all duration-300"
                )}>
                  <Icon className={cn(
                    "h-7 w-7 transition-colors",
                    isSelected ? "text-[#F5C76A]" : "text-foreground"
                  )} />
                </div>

                <div className="flex-1 min-w-0">
                  {/* Title */}
                  <h3 className={cn(
                    "text-xl font-bold mb-1 transition-colors",
                    isSelected && "text-[#F5C76A]"
                  )}>
                    {categoryInfo.name}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground mb-3">
                    {categoryInfo.description}
                  </p>

                  {/* Features */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {categoryInfo.features.map((feature, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                        {feature}
                      </span>
                    ))}
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {questionCount} {t('uvc.questionsLabel')}
                      </span>
                      {badge && (
                        <span className="text-xs text-[#F5C76A] flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#F5C76A]/10 border border-[#F5C76A]/20">
                          <badge.icon className="h-3 w-3" />
                          {badge.label}
                        </span>
                      )}
                    </div>
                    <ArrowRight className={cn(
                      "h-4 w-4 transition-all",
                      isSelected ? "text-[#F5C76A] translate-x-1" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                    )} />
                  </div>
                </div>
              </div>

              {/* Hover glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent" />
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Selected Category Preview */}
      {selectedCategory && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 p-6 bg-card/40 backdrop-blur-xl border border-[#F5C76A]/30 rounded-2xl"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {(() => {
                const Icon = CATEGORY_ICONS[selectedCategory];
                const category = localizedCategories.find(c => c.category === selectedCategory);
                return (
                  <>
                    <div className="w-14 h-14 rounded-xl bg-[#F5C76A]/20 border border-[#F5C76A]/30 flex items-center justify-center">
                      <Icon className="h-7 w-7 text-[#F5C76A]" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-[#F5C76A]">{category?.name}</h3>
                      <p className="text-sm text-muted-foreground">{category?.description}</p>
                    </div>
                  </>
                );
              })()}
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-[#F5C76A]">
                {ALL_CATEGORY_INTERVIEWS[selectedCategory]?.phases?.length || 20}
              </div>
              <div className="text-xs text-muted-foreground">{t('uvc.interviewPhases')}</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
