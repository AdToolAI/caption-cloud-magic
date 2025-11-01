import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Instagram, Music, Linkedin, Facebook, Twitter, Youtube } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";

interface BestTimeHeatmapProps {
  heatmap: Record<string, number[][]>;
  loading?: boolean;
  dataSource?: 'real' | 'heuristic';
  postCount?: number;
}

export function BestTimeHeatmap({ heatmap, loading, dataSource = 'heuristic', postCount = 0 }: BestTimeHeatmapProps) {
  const { t, language } = useTranslation();
  const days = language === 'de' ? ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  const platformConfig = {
    instagram: { icon: Instagram, color: 'text-pink-500', name: 'Instagram' },
    tiktok: { icon: Music, color: 'text-foreground', name: 'TikTok' },
    linkedin: { icon: Linkedin, color: 'text-blue-700 dark:text-blue-500', name: 'LinkedIn' },
    youtube: { icon: Youtube, color: 'text-red-600 dark:text-red-500', name: 'YouTube' },
    facebook: { icon: Facebook, color: 'text-blue-600 dark:text-blue-500', name: 'Facebook' },
    x: { icon: Twitter, color: 'text-foreground', name: 'X' }
  };

  const getColorClass = (score: number) => {
    if (score >= 80) return "bg-success/80 text-white";
    if (score >= 70) return "bg-success/60 text-white";
    if (score >= 50) return "bg-warning/60 text-foreground";
    if (score >= 30) return "bg-warning/40 text-foreground";
    return "bg-muted/40 text-muted-foreground";
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('heatmap.title')}</CardTitle>
          <CardDescription>{t('heatmap.loading')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[400px] w-full" />
        </CardContent>
      </Card>
    );
  }

  const platforms = Object.keys(heatmap);
  if (platforms.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('heatmap.title')}</CardTitle>
          <CardDescription>{t('heatmap.noData')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            {t('heatmap.empty.body')}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('heatmap.title')}</CardTitle>
            <CardDescription>{t('heatmap.subtitle')}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={dataSource === 'real' ? 'default' : 'secondary'}>
              {t(`heatmap.dataSource.${dataSource}`)}
            </Badge>
            {postCount > 0 && (
              <Badge variant="outline">
                {postCount} {t('heatmap.postCount')}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={platforms[0]} className="w-full">
          <TabsList className="grid w-full grid-cols-6 mb-6">
            {platforms.map(platform => {
              const config = platformConfig[platform as keyof typeof platformConfig];
              const Icon = config?.icon;
              return (
                <TabsTrigger key={platform} value={platform} className="capitalize">
                  {Icon && <Icon className={`h-4 w-4 mr-2 ${config.color}`} />}
                  {config?.name || platform}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {platforms.map((platform) => (
            <TabsContent key={platform} value={platform}>
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Hours header */}
                  <div className="flex mb-2">
                    <div className="w-12"></div>
                    <div className="flex-1 flex">
                      {hours.map((hour) => (
                        <div 
                          key={hour} 
                          className="flex-1 text-center text-xs text-muted-foreground"
                          style={{ minWidth: '32px' }}
                        >
                          {hour}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Heatmap grid */}
                  <TooltipProvider>
                    {days.map((day, dayIdx) => (
                      <div key={day} className="flex mb-1">
                        <div className="w-12 flex items-center text-xs font-medium text-muted-foreground">
                          {day}
                        </div>
                        <div className="flex-1 flex gap-1">
                          {heatmap[platform]?.[dayIdx]?.map((score, hourIdx) => (
                            <Tooltip key={hourIdx}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`flex-1 h-8 rounded flex items-center justify-center text-xs font-medium cursor-pointer transition-transform hover:scale-110 ${getColorClass(score)}`}
                                  style={{ minWidth: '32px' }}
                                >
                                  {score >= 70 ? score : ""}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{day} {hourIdx}:00</p>
                                <p className="text-sm">Score: {score}</p>
                                <p className="text-xs text-muted-foreground">
                                  {score >= 70 ? (language === 'de' ? "Beste Zeit" : "Best Time") : score >= 50 ? (language === 'de' ? "Gute Zeit" : "Good Time") : (language === 'de' ? "Heuristik" : "Heuristic")}
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          )) || Array(24).fill(30).map((score, hourIdx) => (
                            <div
                              key={hourIdx}
                              className={`flex-1 h-8 rounded flex items-center justify-center text-xs font-medium ${getColorClass(score)}`}
                              style={{ minWidth: '32px' }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </TooltipProvider>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center justify-center gap-4 mt-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-success/80"></div>
                  <span>{language === 'de' ? 'Beste Zeit (≥70)' : 'Best Time (≥70)'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-warning/60"></div>
                  <span>{language === 'de' ? 'Gute Zeit (50-70)' : 'Good Time (50-70)'}</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-muted/40"></div>
                  <span>{language === 'de' ? 'Heuristik (<50)' : 'Heuristic (<50)'}</span>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
