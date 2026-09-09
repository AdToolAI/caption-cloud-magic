import { ReactNode, useState } from 'react';
import { Lock, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { tx } from '@/lib/i18nText';
import { upgradeCtaLabel } from '@/lib/pricingDisplay';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { UpgradeAccessDialog } from '@/components/access/UpgradeAccessDialog';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';

export const motionStudioLockTitle = () =>
  tx({
    de: 'Motion Studio freischalten',
    en: 'Unlock Motion Studio',
    es: 'Desbloquea Motion Studio',
  });

export const motionStudioLockDescription = () =>
  tx({
    de: 'Erstelle szenenbasierte KI-Videos mit erweitertem Schnitt, Clip-Montage, Uploads und Render-Workflows. Enthalten in Beta Basic und in Creator-Konten.',
    en: 'Create scene-based AI videos with advanced editing, clip assembly, uploads and rendering workflows. Included with Beta Basic and Creator accounts.',
    es: 'Crea vídeos con IA basados en escenas con edición avanzada, montaje de clips, subidas y flujos de renderizado. Incluido en Beta Basic y en las cuentas Creator.',
  });

/** Reusable upgrade dialog with the Motion Studio copy. */
export function MotionStudioUpgradeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <UpgradeAccessDialog
      open={open}
      onOpenChange={onOpenChange}
      title={motionStudioLockTitle()}
      description={motionStudioLockDescription()}
    />
  );
}

/**
 * Display-only gate. The server (`_shared/motion-studio-premium.ts`) decides
 * authoritatively; this only keeps non-entitled users from starting work.
 * Existing projects, assets and history stay stored and visible elsewhere.
 */
export function MotionStudioGate({ children }: { children: ReactNode }) {
  const { canUseMotionStudio, isLoading } = useSubscriptionAccess();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  if (isLoading || canUseMotionStudio) return <>{children}</>;

  return (
    <div className="container mx-auto max-w-3xl px-4 py-16">
      <Card className="p-8 text-center space-y-5">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-5 w-5 text-primary" />
        </div>
        <h1 className="text-2xl font-semibold">{motionStudioLockTitle()}</h1>
        <p className="text-muted-foreground">{motionStudioLockDescription()}</p>
        <p className="text-sm text-muted-foreground">
          {tx({
            de: 'Deine bestehenden Projekte, Uploads und Renders bleiben gespeichert — sie sind nur schreibgeschützt, bis du wieder Zugriff hast.',
            en: 'Your existing projects, uploads and renders stay saved — they are read-only until access is restored.',
            es: 'Tus proyectos, subidas y renders existentes se conservan: quedan en solo lectura hasta que recuperes el acceso.',
          })}
        </p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          <Button onClick={() => setOpen(true)}>
            <Sparkles className="h-4 w-4 mr-2" />
            {upgradeCtaLabel()}
          </Button>

          <Button variant="outline" onClick={() => navigate('/library')}>
            {tx({
              de: 'Meine Bibliothek ansehen',
              en: 'View my library',
              es: 'Ver mi biblioteca',
            })}
          </Button>
        </div>
      </Card>
      <MotionStudioUpgradeDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

export default MotionStudioGate;
