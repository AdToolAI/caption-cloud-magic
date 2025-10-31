import { FeatureCard } from './FeatureCard';
import { Calendar, LineChart, BadgeCheck, Bot, Share2, Target } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

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
      href: "/performance",
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

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          {t('featureCards.sectionTitle')}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('featureCards.sectionSubtitle')}
        </p>
      </div>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
        {features.map((feature, i) => (
          <FeatureCard key={i} {...feature} />
        ))}
      </div>
    </section>
  );
}
