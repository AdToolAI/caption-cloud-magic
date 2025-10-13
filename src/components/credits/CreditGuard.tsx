import { ReactNode, useState } from 'react';
import { useCreditReservation } from '@/hooks/useCreditReservation';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Coins } from 'lucide-react';

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
              <AlertDialogTitle>Nicht genügend Credits</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="space-y-2">
              <p>
                Diese Aktion benötigt <strong>{insufficientData?.required || 0} Credits</strong>,
                aber Sie haben nur <strong>{insufficientData?.available || 0} Credits</strong> verfügbar.
              </p>
              <p className="text-sm">
                Bitte kaufen Sie Credits nach, um diese Funktion zu nutzen.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={() => window.location.href = '/credits'}>
              Credits kaufen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
