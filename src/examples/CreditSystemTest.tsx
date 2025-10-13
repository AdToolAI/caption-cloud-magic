/**
 * Credit System Test Example
 * 
 * Zeigt wie das Credit-System verwendet wird
 */

import { CreditGuard } from "@/components/credits/CreditGuard";
import { Button } from "@/components/ui/button";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { toast } from "@/hooks/use-toast";

export const CreditSystemTestExample = () => {
  const handleGenerateCaption = async () => {
    // Simuliere Caption-Generierung
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: "Caption erstellt",
      description: "Ihre Caption wurde erfolgreich generiert!"
    });
  };

  return (
    <CreditGuard 
      feature_code={FEATURE_COSTS.CAPTION_GENERATE}
      estimated_cost={10}
    >
      {(checkAndExecute) => (
        <Button
          onClick={() => checkAndExecute(
            FEATURE_COSTS.CAPTION_GENERATE,
            handleGenerateCaption
          )}
        >
          Caption generieren (10 Credits)
        </Button>
      )}
    </CreditGuard>
  );
};
