import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Award, Flame, Target, TrendingUp } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface Achievement {
  consistencyStreak: number;
  monthlyPosts: number;
  engagementHero: boolean;
  goalCompleter: number;
}

interface AchievementBadgesProps {
  achievements: Achievement;
}

export function AchievementBadges({ achievements }: AchievementBadgesProps) {
  const { t } = useTranslation();

  const badges = [
    {
      icon: Flame,
      title: t('goals.achievements.consistencyStreak'),
      value: `${achievements.consistencyStreak} ${t('goals.achievements.days')}`,
      color: 'text-orange-600',
      bgColor: 'bg-orange-500/10',
      unlocked: achievements.consistencyStreak >= 3,
    },
    {
      icon: Award,
      title: t('goals.achievements.monthlyPosts'),
      value: `${achievements.monthlyPosts} ${t('goals.achievements.posts')}`,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500/10',
      unlocked: achievements.monthlyPosts >= 10,
    },
    {
      icon: TrendingUp,
      title: t('goals.achievements.engagementHero'),
      value: achievements.engagementHero ? t('goals.achievements.unlocked') : t('goals.achievements.locked'),
      color: 'text-green-600',
      bgColor: 'bg-green-500/10',
      unlocked: achievements.engagementHero,
    },
    {
      icon: Target,
      title: t('goals.achievements.goalCompleter'),
      value: `${achievements.goalCompleter} ${t('goals.achievements.completed')}`,
      color: 'text-purple-600',
      bgColor: 'bg-purple-500/10',
      unlocked: achievements.goalCompleter >= 1,
    },
  ];

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4 text-foreground flex items-center gap-2">
        🏆 {t('goals.achievements.title')}
      </h3>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {badges.map((badge, index) => {
          const Icon = badge.icon;
          return (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                badge.unlocked
                  ? `${badge.bgColor} border-current`
                  : 'bg-muted/30 border-border opacity-50'
              } transition-all hover:scale-105`}
            >
              <div className={`${badge.color} mb-2`}>
                <Icon className="h-8 w-8" />
              </div>
              <h4 className="text-sm font-semibold text-foreground mb-1">
                {badge.title}
              </h4>
              <p className={`text-xs ${badge.unlocked ? badge.color : 'text-muted-foreground'}`}>
                {badge.value}
              </p>
              {badge.unlocked && (
                <Badge className="mt-2 text-xs" variant="secondary">
                  ✓ {t('goals.achievements.earned')}
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20">
        <p className="text-xs text-muted-foreground text-center">
          💡 {t('goals.achievements.motivationText')}
        </p>
      </div>
    </Card>
  );
}
