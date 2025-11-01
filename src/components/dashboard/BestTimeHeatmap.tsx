import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight } from "lucide-react";
import { HeatmapEmptyState } from "@/features/analytics/EmptyStates";

interface BestTimeHeatmapProps {
  heatmap: Record<string, number[][]>;
  loading?: boolean;
  onViewDetails?: () => void;
}

export function BestTimeHeatmap({ heatmap, loading, onViewDetails }: BestTimeHeatmapProps) {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getColorClass = (score: number) => {
    if (score >= 80) return "bg-success/80 text-white";
    if (score >= 70) return "bg-success/60 text-white";
    if (score >= 60) return "bg-warning/70 text-foreground";
    if (score >= 50) return "bg-warning/50 text-foreground";
    return "bg-muted/40 text-muted-foreground";
  };

  const platforms = Object.keys(heatmap);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Best-Time Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted animate-pulse rounded-lg"></div>
        </CardContent>
      </Card>
    );
  }

  if (platforms.length === 0) {
    return <HeatmapEmptyState />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Best-Time Heatmap (Plattform × Stunde)
          </div>
          {onViewDetails && (
            <Button variant="outline" size="sm" onClick={onViewDetails}>
              Details anzeigen
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={platforms[0]}>
          <TabsList className="mb-4">
            {platforms.map((platform) => (
              <TabsTrigger key={platform} value={platform} className="capitalize">
                {platform}
              </TabsTrigger>
            ))}
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
                          {heatmap[platform][dayIdx]?.map((score, hourIdx) => (
                            <Tooltip key={hourIdx}>
                              <TooltipTrigger asChild>
                                <div
                                  className={`flex-1 h-8 rounded flex items-center justify-center text-xs font-medium cursor-pointer transition-transform hover:scale-110 ${getColorClass(score)}`}
                                  style={{ minWidth: '32px' }}
                                >
                                  {score >= 30 ? score : ""}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{day} {hourIdx}:00 Uhr</p>
                                <p className="text-sm">Score: {score}</p>
                                <p className="text-xs text-muted-foreground">
                                  {score >= 70 ? "Beste Zeit" : score >= 50 ? "Gute Zeit" : "Heuristik"}
                                </p>
                              </TooltipContent>
                            </Tooltip>
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
                  <span>Beste Zeit (≥70)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-warning/60"></div>
                  <span>Gute Zeit (50-70)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-4 h-4 rounded bg-muted/40"></div>
                  <span>Heuristik (&lt;50)</span>
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
