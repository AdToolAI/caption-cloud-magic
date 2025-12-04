import { FeatureCard } from './FeatureCard';
import { Calendar, LineChart, BadgeCheck, Bot, Share2, Target } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { motion } from 'framer-motion';

export function FeatureGrid() {
  const { t } = useTranslation();
  
  const features = [
    { 
      icon: <Calendar className="h-5 w-5" />, 
      title: t('featureCards.automation.title'),
      description: t('featureCards.automation.description'),
      href: "/calendar",
      featureId: "automation"
    },
    { 
      icon: <LineChart className="h-5 w-5" />, 
      title: t('featureCards.analytics.title'),
      description: t('featureCards.analytics.description'),
      href: "/analytics",
      featureId: "analytics"
    },
    { 
      icon: <BadgeCheck className="h-5 w-5" />, 
      title: t('featureCards.brandKit.title'),
      description: t('featureCards.brandKit.description'),
      href: "/brand-kit",
      featureId: "brandKit"
    },
    { 
      icon: <Bot className="h-5 w-5" />, 
      title: t('featureCards.coach.title'),
      description: t('featureCards.coach.description'),
      href: "/coach",
      featureId: "coach"
    },
    { 
      icon: <Share2 className="h-5 w-5" />, 
      title: t('featureCards.publishing.title'),
      description: t('featureCards.publishing.description'),
      href: "/composer",
      featureId: "publishing"
    },
    { 
      icon: <Target className="h-5 w-5" />, 
      title: t('featureCards.goals.title'),
      description: t('featureCards.goals.description'),
      href: "/goals-dashboard",
      featureId: "goals"
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <section className="space-y-4">
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h2 className="text-xl font-semibold text-foreground">
          {t('featureCards.sectionTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('featureCards.sectionSubtitle')}
        </p>
      </motion.div>
      <motion.div 
        className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        {features.map((feature, i) => (
          <motion.div key={i} variants={itemVariants}>
            <FeatureCard {...feature} />
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
