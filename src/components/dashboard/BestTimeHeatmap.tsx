import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { TrendingUp, ArrowRight, Zap } from "lucide-react";
import { HeatmapEmptyState } from "@/features/analytics/EmptyStates";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";

interface BestTimeHeatmapProps {
  heatmap: Record<string, number[][]>;
  loading?: boolean;
  onViewDetails?: () => void;
}

// Pulse cell component with animation
function PulseCell({ score, day, hour, isNearOptimal }: { score: number; day: string; hour: number; isNearOptimal: boolean }) {
  const [isHovered, setIsHovered] = useState(false);
  
  const getColorClass = (score: number) => {
    if (score >= 80) return "bg-success/80 text-white shadow-success/30";
    if (score >= 70) return "bg-success/60 text-white shadow-success/20";
    if (score >= 60) return "bg-warning/70 text-foreground shadow-warning/20";
    if (score >= 50) return "bg-warning/50 text-foreground";
    return "bg-white/5 text-muted-foreground";
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          onHoverStart={() => setIsHovered(true)}
          onHoverEnd={() => setIsHovered(false)}
          whileHover={{ scale: 1.2, zIndex: 10 }}
          animate={isNearOptimal && score >= 70 ? { 
            boxShadow: ["0 0 0px hsla(160, 84%, 39%, 0)", "0 0 15px hsla(160, 84%, 39%, 0.5)", "0 0 0px hsla(160, 84%, 39%, 0)"]
          } : {}}
          transition={isNearOptimal && score >= 70 ? { duration: 2, repeat: Infinity } : { duration: 0.2 }}
          className={`flex-1 h-8 rounded-md flex items-center justify-center text-xs font-medium cursor-pointer transition-colors ${getColorClass(score)} ${
            isHovered ? 'shadow-lg ring-2 ring-primary/30' : ''
          }`}
          style={{ minWidth: '32px' }}
        >
          {score >= 30 ? score : ""}
          {isNearOptimal && score >= 70 && (
            <motion.div
              className="absolute inset-0 rounded-md bg-success/30"
              animate={{ opacity: [0.3, 0, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </motion.div>
      </TooltipTrigger>
      <TooltipContent className="backdrop-blur-xl bg-card/90 border-white/10">
        <div className="p-1">
          <p className="font-medium flex items-center gap-1">
            {score >= 70 && <Zap className="h-3 w-3 text-success" />}
            {day} {hour}:00 Uhr
          </p>
          <p className="text-sm">Score: <span className="font-bold">{score}</span></p>
          <p className="text-xs text-muted-foreground">
            {score >= 70 ? "🎯 Beste Zeit zum Posten!" : score >= 50 ? "✓ Gute Zeit" : "Weniger optimal"}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function BestTimeHeatmap({ heatmap, loading, onViewDetails }: BestTimeHeatmapProps) {
  const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const hours = Array.from({ length: 24 }, (_, i) => i);
  
  // Check if current hour is near optimal time
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();

  const platforms = Object.keys(heatmap);

  if (loading) {
    return (
      <Card className="backdrop-blur-xl bg-card/50 border-white/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Best-Time Heatmap
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-96 bg-muted/20 animate-pulse rounded-lg"></div>
        </CardContent>
      </Card>
    );
  }

  if (platforms.length === 0) {
    return <HeatmapEmptyState />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="backdrop-blur-xl bg-card/50 border-white/10 overflow-hidden">
        {/* Background glow */}
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-success/10 rounded-full blur-3xl pointer-events-none" />
        
        <CardHeader className="relative">
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <motion.div
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
                className="p-2 rounded-lg bg-primary/10"
              >
                <TrendingUp className="h-5 w-5 text-primary" />
              </motion.div>
              <span>Best-Time Heatmap</span>
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent font-medium"
              >
                Live
              </motion.span>
            </div>
            {onViewDetails && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onViewDetails}
                className="border-primary/30 hover:bg-primary/10 hover:border-primary"
              >
                Details anzeigen
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <Tabs defaultValue={platforms[0]}>
            <TabsList className="mb-4 bg-white/5 border border-white/10">
              {platforms.map((platform) => (
                <TabsTrigger 
                  key={platform} 
                  value={platform} 
                  className="capitalize data-[state=active]:bg-primary/20 data-[state=active]:text-primary"
                >
                  {platform}
                </TabsTrigger>
              ))}
            </TabsList>
            
            <AnimatePresence mode="wait">
              {platforms.map((platform) => (
                <TabsContent key={platform} value={platform}>
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="overflow-x-auto"
                  >
                    <div className="inline-block min-w-full">
                      {/* Hours header */}
                      <div className="flex mb-2">
                        <div className="w-12"></div>
                        <div className="flex-1 flex gap-1">
                          {hours.map((hour) => (
                            <motion.div 
                              key={hour} 
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: hour * 0.02 }}
                              className={`flex-1 text-center text-xs ${
                                hour === currentHour ? 'text-accent font-bold' : 'text-muted-foreground'
                              }`}
                              style={{ minWidth: '32px' }}
                            >
                              {hour}
                            </motion.div>
                          ))}
                        </div>
                      </div>

                      {/* Heatmap grid */}
                      <TooltipProvider>
                        {days.map((day, dayIdx) => (
                          <motion.div 
                            key={day} 
                            className="flex mb-1"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: dayIdx * 0.05 }}
                          >
                            <div className={`w-12 flex items-center text-xs font-medium ${
                              dayIdx === currentDay ? 'text-accent' : 'text-muted-foreground'
                            }`}>
                              {day}
                              {dayIdx === currentDay && (
                                <motion.span
                                  animate={{ scale: [1, 1.2, 1] }}
                                  transition={{ duration: 1, repeat: Infinity }}
                                  className="ml-1 w-1.5 h-1.5 rounded-full bg-accent"
                                />
                              )}
                            </div>
                            <div className="flex-1 flex gap-1">
                              {heatmap[platform][dayIdx]?.map((score, hourIdx) => (
                                <PulseCell 
                                  key={hourIdx}
                                  score={score}
                                  day={day}
                                  hour={hourIdx}
                                  isNearOptimal={dayIdx === currentDay && Math.abs(hourIdx - currentHour) <= 1}
                                />
                              ))}
                            </div>
                          </motion.div>
                        ))}
                      </TooltipProvider>
                    </div>
                  </motion.div>

                  {/* Legend */}
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="flex items-center justify-center gap-6 mt-6 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <motion.div 
                        animate={{ boxShadow: ["0 0 0px hsla(160, 84%, 39%, 0)", "0 0 10px hsla(160, 84%, 39%, 0.5)", "0 0 0px hsla(160, 84%, 39%, 0)"] }}
                        transition={{ duration: 2, repeat: Infinity }}
                        className="w-5 h-5 rounded bg-success/80"
                      />
                      <span>Beste Zeit (≥70)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-warning/60"></div>
                      <span>Gute Zeit (50-70)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded bg-white/5 border border-white/10"></div>
                      <span>Heuristik (&lt;50)</span>
                    </div>
                  </motion.div>
                </TabsContent>
              ))}
            </AnimatePresence>
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}
