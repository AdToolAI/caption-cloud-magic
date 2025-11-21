import { Helmet } from 'react-helmet-async';
import { Card } from '@/components/ui/card';
import { Film, Scissors, Palette, Music } from 'lucide-react';

const UniversalDirectorsCut = () => {
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
              Professionelle Video-Nachbearbeitung kommt bald
            </p>
          </div>

          <Card className="p-8">
            <div className="space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Film className="w-10 h-10 text-primary" />
              </div>
              
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold">Coming Soon</h2>
                <p className="text-muted-foreground">
                  Wir arbeiten hart daran, dir die besten Tools zur Video-Nachbearbeitung zu bieten
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Scissors className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Szenen bearbeiten</h3>
                  <p className="text-sm text-muted-foreground">
                    Schneide, ordne neu an und füge Transitions hinzu
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Palette className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Color Grading</h3>
                  <p className="text-sm text-muted-foreground">
                    Passe Farben und Stimmung deiner Videos an
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mx-auto">
                    <Music className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-semibold">Audio nachbearbeiten</h3>
                  <p className="text-sm text-muted-foreground">
                    Optimiere Sound, füge Musik hinzu und mixe Audio
                  </p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
};

export default UniversalDirectorsCut;
