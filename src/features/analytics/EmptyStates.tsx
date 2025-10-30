import { Clock, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const HeatmapEmptyState = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-4 rounded-full bg-primary/10">
          <Clock className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">{t('heatmap.empty.title')}</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {t('heatmap.empty.body')}
          </p>
        </div>
        <Button onClick={() => navigate('/instagram-publishing')}>
          {t('heatmap.empty.cta')}
        </Button>
      </CardContent>
    </Card>
  );
};

export const AnalyticsEmptyState = ({ onSync }: { onSync?: () => void }) => {
  const { t } = useTranslation();

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
        <div className="p-4 rounded-full bg-primary/10">
          <TrendingUp className="h-8 w-8 text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h3 className="font-semibold text-lg">{t('analytics.empty.title')}</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            {t('analytics.empty.body')}
          </p>
        </div>
        {onSync && (
          <Button onClick={onSync}>
            {t('analytics.empty.cta')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};
