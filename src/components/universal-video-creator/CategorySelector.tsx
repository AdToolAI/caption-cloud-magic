import { motion } from 'framer-motion';
import { 
  Video, Film, BookOpen, ShoppingBag, Building2, Users, 
  MessageSquare, Star, Trophy, Newspaper, Heart, Megaphone,
  ArrowRight, Check
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { VIDEO_CATEGORIES, type VideoCategory } from '@/types/universal-video-creator';
import { ALL_CATEGORY_INTERVIEWS } from '@/config/universal-video-interviews';

interface CategorySelectorProps {
  selectedCategory: VideoCategory | null;
  onSelectCategory: (category: VideoCategory) => void;
}

const CATEGORY_ICONS: Record<VideoCategory, React.ComponentType<{ className?: string }>> = {
  advertisement: Megaphone,
  storytelling: BookOpen,
  tutorial: Video,
  explainer: Film,
  'product-video': ShoppingBag,
  corporate: Building2,
  testimonial: MessageSquare,
  'social-content': Heart,
  event: Trophy,
  promo: Star,
  presentation: Newspaper,
  custom: Users,
};

const CATEGORY_COLORS: Record<VideoCategory, string> = {
  advertisement: 'from-red-500/20 to-orange-500/20 border-red-500/30',
  storytelling: 'from-purple-500/20 to-pink-500/20 border-purple-500/30',
  tutorial: 'from-blue-500/20 to-cyan-500/20 border-blue-500/30',
  explainer: 'from-[#F5C76A]/20 to-amber-500/20 border-[#F5C76A]/30',
  'product-video': 'from-green-500/20 to-emerald-500/20 border-green-500/30',
  corporate: 'from-slate-500/20 to-gray-500/20 border-slate-500/30',
  testimonial: 'from-yellow-500/20 to-amber-500/20 border-yellow-500/30',
  'social-content': 'from-fuchsia-500/20 to-purple-500/20 border-fuchsia-500/30',
  event: 'from-pink-500/20 to-rose-500/20 border-pink-500/30',
  promo: 'from-indigo-500/20 to-violet-500/20 border-indigo-500/30',
  presentation: 'from-sky-500/20 to-blue-500/20 border-sky-500/30',
  custom: 'from-teal-500/20 to-cyan-500/20 border-teal-500/30',
};

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  return (
    <div className="max-w-6xl mx-auto">
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
          <span className="text-sm font-medium text-[#F5C76A]">12 Videokategorien verfügbar</span>
        </motion.div>
        
        <h2 className="text-3xl font-bold mb-3">
          <span className="bg-gradient-to-r from-[#F5C76A] via-amber-300 to-[#F5C76A] bg-clip-text text-transparent">
            Welche Art von Video möchtest du erstellen?
          </span>
        </h2>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Jede Kategorie hat ein speziell optimiertes Interview mit 20-24 tiefgehenden Fragen 
          für das bestmögliche Ergebnis
        </p>
      </motion.div>

      {/* Category Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {VIDEO_CATEGORIES.map((categoryInfo, index) => {
          const Icon = CATEGORY_ICONS[categoryInfo.category];
          const colorClass = CATEGORY_COLORS[categoryInfo.category];
          const isSelected = selectedCategory === categoryInfo.category;
          const interviewConfig = ALL_CATEGORY_INTERVIEWS[categoryInfo.category];
          const questionCount = interviewConfig?.phases?.length || 20;

          return (
            <motion.div
              key={categoryInfo.category}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              whileHover={{ scale: 1.02, y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectCategory(categoryInfo.category)}
              className={cn(
                "relative p-5 rounded-2xl border-2 cursor-pointer transition-all duration-300",
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
                  className="absolute top-3 right-3 w-6 h-6 rounded-full bg-[#F5C76A] flex items-center justify-center"
                >
                  <Check className="h-4 w-4 text-black" />
                </motion.div>
              )}

              {/* Icon */}
              <div className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center mb-3",
                "bg-white/10 border border-white/20 group-hover:border-[#F5C76A]/50",
                "transition-all duration-300"
              )}>
                <Icon className={cn(
                  "h-6 w-6 transition-colors",
                  isSelected ? "text-[#F5C76A]" : "text-foreground"
                )} />
              </div>

              {/* Title */}
              <h3 className={cn(
                "text-lg font-semibold mb-1 transition-colors",
                isSelected && "text-[#F5C76A]"
              )}>
                {categoryInfo.name}
              </h3>

              {/* Description */}
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {categoryInfo.description}
              </p>

              {/* Question count badge */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {questionCount} Fragen
                </span>
                <ArrowRight className={cn(
                  "h-4 w-4 transition-all",
                  isSelected ? "text-[#F5C76A] translate-x-1" : "text-muted-foreground opacity-0 group-hover:opacity-100"
                )} />
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
                const category = VIDEO_CATEGORIES.find(c => c.id === selectedCategory);
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
              <div className="text-xs text-muted-foreground">Interview-Phasen</div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
