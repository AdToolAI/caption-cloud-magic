import { motion } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, ArrowRight } from 'lucide-react';
import { VIDEO_CATEGORIES, type VideoCategory } from '@/types/universal-video-creator';

interface CategorySelectorProps {
  selectedCategory: VideoCategory | null;
  onSelectCategory: (category: VideoCategory) => void;
}

export function CategorySelector({ selectedCategory, onSelectCategory }: CategorySelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
          Welche Art von Video möchtest du erstellen?
        </h2>
        <p className="text-muted-foreground">
          Wähle eine Kategorie, um ein maßgeschneidertes Interview zu starten
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {VIDEO_CATEGORIES.map((category, index) => (
          <motion.div
            key={category.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card
              className={`
                relative cursor-pointer p-5 transition-all duration-300 group overflow-hidden
                ${selectedCategory === category.id 
                  ? 'ring-2 ring-primary shadow-lg shadow-primary/20' 
                  : 'hover:shadow-md hover:border-primary/50'
                }
              `}
              onClick={() => onSelectCategory(category.id)}
            >
              {/* Gradient background on hover */}
              <div 
                className={`
                  absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity
                  bg-gradient-to-br ${category.color}
                `}
              />
              
              {/* Selected indicator */}
              {selectedCategory === category.id && (
                <div className="absolute top-3 right-3">
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
                </div>
              )}

              <div className="relative space-y-3">
                {/* Icon & Title */}
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{category.icon}</span>
                  <div>
                    <h3 className="font-semibold text-lg">{category.name}</h3>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{category.typicalDuration}</span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {category.description}
                </p>

                {/* Interview phases badge */}
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {category.interviewPhases} Interview-Phasen
                  </Badge>
                  
                  <ArrowRight className={`
                    w-4 h-4 transition-all
                    ${selectedCategory === category.id 
                      ? 'text-primary translate-x-1' 
                      : 'text-muted-foreground group-hover:translate-x-1'
                    }
                  `} />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Selected category info */}
      {selectedCategory && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <Badge className="bg-primary/10 text-primary border-primary/20 px-4 py-2">
            {VIDEO_CATEGORIES.find(c => c.id === selectedCategory)?.icon}{' '}
            {VIDEO_CATEGORIES.find(c => c.id === selectedCategory)?.name} ausgewählt
          </Badge>
        </motion.div>
      )}
    </div>
  );
}
