import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Film, Scissors, Palette, Music, Play, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const UniversalDirectorsCut = () => {
  const navigate = useNavigate();
  
  return (
    <>
      <Helmet>
        <title>Universal Director's Cut | Video nachbearbeiten</title>
        <meta name="description" content="Bearbeite und verfeinere deine fertigen Videos mit professionellen Tools" />
      </Helmet>

      <div className="container mx-auto py-16 px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold">Universal Director's Cut</h1>
            <p className="text-xl text-muted-foreground">
              Professionelle Video-Nachbearbeitung mit KI
            </p>
          </div>

          <Card className="p-8">
            <div className="space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Film className="w-10 h-10 text-primary" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">11-Step Workflow</h2>
                <p className="text-muted-foreground">
                  Von Import bis Export - alles in einem Tool
                </p>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-6">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Sparkles className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">KI-Analyse</h3>
                  <p className="text-xs text-muted-foreground">
                    Auto-Cut & Transitions
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Scissors className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">Szenen-Schnitt</h3>
                  <p className="text-xs text-muted-foreground">
                    Manuelle Bearbeitung
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Palette className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">Style & Farbe</h3>
                  <p className="text-xs text-muted-foreground">
                    Color Grading & VFX
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold text-sm">Audio & Voice</h3>
                  <p className="text-xs text-muted-foreground">
                    Sound Design & Voice-Over
                  </p>
                </div>
              </div>

              <Button 
                size="lg" 
                className="mt-6"
                onClick={() => navigate('/directors-cut')}
              >
                <Play className="w-4 h-4 mr-2" />
                Director's Cut starten
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default UniversalDirectorsCut;
