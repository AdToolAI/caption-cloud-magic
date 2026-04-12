import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Film, Scissors, Palette, Music, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '@/hooks/useTranslation';

const UniversalDirectorsCut = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  return (
    <>
      <Helmet>
        <title>Universal Director's Cut | Video Post-Production</title>
        <meta name="description" content="Professional AI video post-production" />
      </Helmet>

      <div className="container mx-auto py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold">{t('dc.landingTitle')}</h1>
            <p className="text-xl text-muted-foreground">
              {t('dc.landingSubtitle')}
            </p>
          </div>

          <Card className="p-8">
            <div className="space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Film className="w-10 h-10 text-primary" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">{t('dc.workflowTitle')}</h2>
                <p className="text-muted-foreground">
                  {t('dc.workflowDesc')}
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{t('dc.aiAnalysis')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('dc.aiAnalysisDesc')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Scissors className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{t('dc.sceneCut')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('dc.sceneCutDesc')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Palette className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{t('dc.styleColor')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('dc.styleColorDesc')}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">{t('dc.audioVoice')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('dc.audioVoiceDesc')}
                  </p>
                </div>
              </div>

              <Button 
                size="lg" 
                className="mt-6"
                onClick={() => navigate('/directors-cut')}
              >
                <Play className="w-4 h-4 mr-2" />
                {t('dc.startDirectorsCut')}
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default UniversalDirectorsCut;
