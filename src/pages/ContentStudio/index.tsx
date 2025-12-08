import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, MessageSquare, Play, Wand2, ArrowRight } from 'lucide-react';
import { useUserBehavior } from '@/hooks/useUserBehavior';
import { motion } from 'framer-motion';
import ContentStudioHeroHeader from '@/components/content-studio/ContentStudioHeroHeader';

const CONTENT_TYPES = [
  {
    id: 'ads',
    icon: Video,
    title: 'Werbevideos',
    description: 'Produkt-Showcases, Angebote, Sales',
    route: '/content-studio/ads',
    gradient: 'from-blue-500 to-cyan-500',
    glowColor: 'hsla(200, 90%, 50%, 0.3)',
    templates: 12
  },
  {
    id: 'stories',
    icon: MessageSquare,
    title: 'Stories',
    description: 'Instagram & TikTok Stories',
    route: '/content-studio/stories',
    gradient: 'from-pink-500 to-rose-500',
    glowColor: 'hsla(340, 90%, 50%, 0.3)',
    templates: 8
  },
  {
    id: 'reels',
    icon: Play,
    title: 'Reels & Shorts',
    description: 'Virale Kurzvideos',
    route: '/content-studio/reels',
    gradient: 'from-purple-500 to-indigo-500',
    glowColor: 'hsla(270, 90%, 50%, 0.3)',
    templates: 15
  },
  {
    id: 'custom',
    icon: Wand2,
    title: 'Eigenes Template',
    description: 'Erstelle dein eigenes Template',
    route: '/content-studio/editor',
    gradient: 'from-emerald-500 to-green-500',
    glowColor: 'hsla(150, 90%, 40%, 0.3)',
    templates: '∞'
  }
];

export default function ContentStudioHub() {
  const navigate = useNavigate();
  const { trackEvent } = useUserBehavior();

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Premium Hero Header */}
      <ContentStudioHeroHeader />

      {/* Content Type Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {CONTENT_TYPES.map((type, index) => (
          <motion.div
            key={type.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
          >
            <Card
              className="group cursor-pointer overflow-hidden border-white/10 bg-card/60 backdrop-blur-xl hover:border-white/20 transition-all duration-300"
              style={{
                boxShadow: 'none',
              }}
              onClick={() => {
                trackEvent('template_view', { template_name: type.title, content_type: type.id });
                navigate(type.route);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 40px ${type.glowColor}`;
                e.currentTarget.style.transform = 'scale(1.02) translateY(-4px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'scale(1) translateY(0)';
              }}
            >
              {/* Gradient Header */}
              <div className={`relative h-40 bg-gradient-to-br ${type.gradient} flex items-center justify-center overflow-hidden`}>
                {/* Background Glow */}
                <div className="absolute inset-0 bg-black/10" />
                
                {/* Icon with Animation */}
                <motion.div
                  className="relative z-10"
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <type.icon className="h-20 w-20 text-white drop-shadow-lg" />
                </motion.div>

                {/* Template Count Badge */}
                <div className="absolute top-3 right-3">
                  <Badge 
                    variant="secondary" 
                    className="bg-white/20 text-white backdrop-blur-md border border-white/10 shadow-lg"
                  >
                    {type.templates} Templates
                  </Badge>
                </div>

                {/* Bottom Gradient Fade */}
                <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-card/80 to-transparent" />
              </div>

              {/* Card Content */}
              <CardContent className="p-6 relative">
                <h3 className="text-xl font-semibold mb-2 group-hover:bg-gradient-to-r group-hover:from-primary group-hover:to-amber-400 group-hover:bg-clip-text group-hover:text-transparent transition-all duration-300">
                  {type.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  {type.description}
                </p>
                
                {/* Action Link */}
                <div className="flex items-center text-primary font-medium group-hover:gap-3 transition-all duration-300">
                  <span>Jetzt erstellen</span>
                  <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform duration-300" />
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
