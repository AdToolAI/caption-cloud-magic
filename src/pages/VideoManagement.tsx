import { Card } from '@/components/ui/card';
import { Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function VideoManagement() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Video Manager</h1>
        <p className="text-muted-foreground">Verwalte deine erstellten Videos</p>
      </div>

      <Card className="p-12 text-center space-y-4">
        <Video className="h-16 w-16 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Videos erstellen</h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Nutze den Universal Content Creator um professionelle Videos zu erstellen.
        </p>
        <Button onClick={() => navigate('/universal-creator')} size="lg">
          Zum Universal Creator
        </Button>
      </Card>
    </div>
  );
}
