import { Card } from '@/components/ui/card';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { tx } from '@/lib/i18nText';

export default function VideoManagement() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Video Manager</h1>
        <p className="text-muted-foreground">{tx({ de: "Verwalte deine erstellten Videos", en: "Manage your created videos", es: "Gestiona tus videos creados" })}</p>
      </div>

      <Card className="p-12 text-center space-y-4">
        <Video className="h-16 w-16 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">{tx({ de: "Videos erstellen", en: "Create Videos", es: "Crear Videos" })}</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          {tx({ de: "{tx({ de: \"Nutze den Universal Content Creator um professionelle Videos zu erstellen.\", en: \"Use the Universal Content Creator to create professional videos.\", es: \"Usa el Creador de Contenido Universal para crear videos profesionales.\" })}", en: "Use the Universal Content Creator to create professional videos.", es: "Usa el Creador de Contenido Universal para crear videos profesionales." })}
        </p>
        <Button onClick={() => navigate('/universal-creator')} size="lg">
          Zum Universal Creator
        </Button>
      </Card>
    </div>
  );
}
