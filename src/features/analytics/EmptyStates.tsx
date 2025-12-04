import { Clock, TrendingUp, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export const HeatmapEmptyState = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="backdrop-blur-xl bg-card/50 border-white/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 space-y-3">
          <motion.div 
            className="p-3 rounded-xl bg-primary/10"
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 3, repeat: Infinity, repeatDelay: 2 }}
          >
            <Clock className="h-6 w-6 text-primary" />
          </motion.div>
          <div className="text-center space-y-1">
            <h3 className="font-semibold text-base text-foreground">{t('heatmap.empty.title')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t('heatmap.empty.body')}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export const AnalyticsEmptyState = ({ onSync }: { onSync?: () => void }) => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="backdrop-blur-xl bg-card/50 border-white/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 space-y-3">
          <motion.div 
            className="p-3 rounded-xl bg-primary/10"
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <TrendingUp className="h-6 w-6 text-primary" />
          </motion.div>
          <div className="text-center space-y-1">
            <h3 className="font-semibold text-base text-foreground">{t('analytics.empty.title')}</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t('analytics.empty.body')}
            </p>
          </div>
          {onSync && (
            <Button onClick={onSync} size="sm" variant="outline" className="mt-2">
              {t('analytics.empty.cta')}
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export const RecommendationsEmptyState = () => {
  const { t } = useTranslation();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="backdrop-blur-xl bg-card/50 border-white/10 border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-10 space-y-3">
          <motion.div 
            className="p-3 rounded-xl bg-primary/10"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <Sparkles className="h-6 w-6 text-primary" />
          </motion.div>
          <div className="text-center space-y-1">
            <h3 className="font-semibold text-base text-foreground">Noch keine Empfehlungen</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Sobald du mehr Content erstellst, generiert die KI personalisierte Tipps für dich.
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};
