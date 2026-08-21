import { ReactNode, useState } from 'react';
import { useCreditReservation } from '@/hooks/useCreditReservation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Coins } from 'lucide-react';
import { trackEvent, ANALYTICS_EVENTS } from '@/lib/analytics';
import { tx } from '@/lib/i18nText';

interface CreditGuardProps {
  children: (checkAndExecute: (feature_code: string, action: () => Promise<void>) => Promise<void>) => ReactNode;
  feature_code: string;
  estimated_cost?: number;
}

export const CreditGuard = ({ children, feature_code, estimated_cost }: CreditGuardProps) => {
  const { checkPreflight, reserve, commit, refund } = useCreditReservation();
  const [showInsufficientDialog, setShowInsufficientDialog] = useState(false);
  const [insufficientData, setInsufficientData] = useState<{ required: number; available: number } | null>(null);

  const checkAndExecute = async (featureCode: string, action: () => Promise<void>) => {
    try {
      // Preflight check
      const preflightResult = await checkPreflight(featureCode, estimated_cost);
      
      if (!preflightResult.allowed) {
        setInsufficientData({
          required: preflightResult.required_credits,
          available: preflightResult.available_balance
        });
        setShowInsufficientDialog(true);
        trackEvent(ANALYTICS_EVENTS.CREDIT_INSUFFICIENT, {
          feature: featureCode,
          required: preflightResult.required_credits,
          available: preflightResult.available_balance,
          shortfall: Math.max(0, preflightResult.required_credits - preflightResult.available_balance),
        });
        return;
      }

      // Reserve credits
      const reservation = await reserve(featureCode, estimated_cost);
      
      try {
        // Execute the action
        await action();
        
        // Commit the credits
        await commit(reservation.reservation_id);
      } catch (error) {
        // Refund on failure
        await refund(reservation.reservation_id, 'Action failed');
        throw error;
      }
    } catch (error) {
      console.error('Credit guard error:', error);
      throw error;
    }
  };

  return (
    <>
      {children(checkAndExecute)}
      
      <AlertDialog open={showInsufficientDialog} onOpenChange={setShowInsufficientDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-amber-500" />
              <AlertDialogTitle>{tx({ de: 'Nicht genügend KI-Guthaben', en: 'Not enough AI credits', es: 'Saldo de IA insuficiente' })}</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-2">
              <p>
                {tx({ de: 'Diese Aktion benötigt', en: 'This action requires', es: 'Esta acción requiere' })} <strong>{insufficientData?.required || 0} Credits</strong>,
                {tx({ de: 'aber Sie haben nur', en: 'but you only have', es: 'pero solo tienes' })} <strong>{insufficientData?.available || 0} Credits</strong> {tx({ de: tx({ de: "verfügbar.", en: "available.", es: "disponible." }), en: 'available.', es: 'disponibles.' })}
              </p>
              <p className="text-sm">
                {tx({ de: 'KI-Guthaben gilt nur für KI-Modelle (Video, Musik, Bild, Stimme). Bitte lade dein Guthaben auf.', en: 'AI credits apply only to AI models (video, music, image, voice). Please top up your balance.', es: 'Los créditos de IA solo se aplican a modelos de IA (vídeo, música, imagen, voz). Recarga tu saldo.' })}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx({ de: 'Abbrechen', en: 'Cancel', es: 'Cancelar' })}</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.href = '/credits'}>
              {tx({ de: 'KI-Guthaben aufladen', en: 'Top up AI credits', es: 'Recargar saldo de IA' })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
