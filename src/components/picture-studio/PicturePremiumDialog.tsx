import { tx } from '@/lib/i18nText';
import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { upgradeCtaLabel } from '@/lib/pricingDisplay';
import {
  Dialog,

  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface PicturePremiumDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Label of the free fallback ("GPT Image", "Clarity Pro"). */
  fallbackLabel?: string;
  /** Switch to the free fallback and keep prompt / image / settings. */
  onFallback?: () => void;
}

/** Shared upgrade dialog for specialist models and professional enhance. */
export function PicturePremiumDialog({
  open,
  onOpenChange,
  fallbackLabel,
  onFallback,
}: PicturePremiumDialogProps) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            {tx({
              de: 'Specialist-Modelle freischalten',
              en: 'Unlock specialist models',
              es: 'Desbloquea los modelos especializados',
            })}
          </DialogTitle>
          <DialogDescription>
            {tx({
              de: 'Zugang zu Premium-Bildmodellen und professioneller Topaz-Verbesserung mit AdTool AI Beta Basic. Die Nutzung wird weiterhin normal über AI Credits abgerechnet.',
              en: 'Get access to premium image models and professional Topaz enhancement with AdTool AI Beta Basic. Usage is still billed with AI credits as usual.',
              es: 'Accede a modelos de imagen premium y a la mejora profesional Topaz con AdTool AI Beta Basic. El uso se sigue cobrando con créditos de IA.',
            })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={() => navigate('/pricing')}>
            <Sparkles className="h-4 w-4 mr-2" />
            {upgradeCtaLabel()}
          </Button>
          {onFallback && (
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                onOpenChange(false);
                onFallback();
              }}
            >
              {tx({
                de: `Weiter mit ${fallbackLabel}`,
                en: `Continue with ${fallbackLabel}`,
                es: `Continuar con ${fallbackLabel}`,
              })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
