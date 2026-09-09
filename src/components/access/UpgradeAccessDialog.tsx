import { tx } from '@/lib/i18nText';
import { upgradeCtaLabel } from '@/lib/pricingDisplay';

import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface UpgradeAccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
}

/** Shared upgrade dialog for subscription-gated areas (Command Center, Connections). */
export function UpgradeAccessDialog({
  open,
  onOpenChange,
  title,
  description,
}: UpgradeAccessDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            {title ??
              tx({
                de: 'Content Command Center freischalten',
                en: 'Unlock Content Command Center',
                es: 'Desbloquea el Content Command Center',
              })}
          </DialogTitle>
          <DialogDescription>
            {description ??
              tx({
                de: 'Verbinde deine Social-Accounts, plane Kampagnen, terminiere Inhalte und veröffentliche direkt aus AdTool AI. Enthalten in Beta Basic und in Creator-Konten.',
                en: 'Connect your social accounts, plan campaigns, schedule content and publish directly from AdTool AI. Included with Beta Basic and Creator accounts.',
                es: 'Conecta tus cuentas sociales, planifica campañas, programa contenido y publica directamente desde AdTool AI. Incluido en Beta Basic y en las cuentas Creator.',
              })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button className="w-full" onClick={() => navigate('/pricing')}>
            <Sparkles className="h-4 w-4 mr-2" />
            {upgradeCtaLabel()}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default UpgradeAccessDialog;
