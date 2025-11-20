import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Sparkles, ArrowRight } from 'lucide-react';

export const ContentStudioUpgradeBanner = () => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('content-studio-banner-dismissed');
    if (isDismissed === 'true') {
      setDismissed(true);
    }
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('content-studio-banner-dismissed', 'true');
  };

  if (dismissed) return null;

  return (
    <Card className="relative overflow-hidden bg-gradient-to-r from-primary/10 via-secondary/10 to-accent/10 border-primary/20">
      <CardContent className="p-6">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Banner schließen"
        >
          <X className="h-4 w-4" />
        </button>
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold flex items-center gap-2 flex-wrap">
                🎬 Neu: Content Studio
                <Badge variant="secondary" className="text-xs">Beta</Badge>
              </h3>
              <p className="text-sm text-muted-foreground">
                Erstelle jetzt auch Stories, Reels & mehr mit unseren neuen Templates!
              </p>
            </div>
          </div>
          
          <Button 
            onClick={() => navigate('/content-studio')} 
            size="lg"
            className="shrink-0 w-full sm:w-auto"
          >
            Jetzt ausprobieren
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
