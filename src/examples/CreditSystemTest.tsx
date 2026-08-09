/**
 * Credit System Test Example
 * 
 * Zeigt wie das Credit-System verwendet wird
 */

import { CreditGuard } from "@/components/credits/CreditGuard";
import { Button } from "@/components/ui/button";
import { FEATURE_COSTS } from "@/lib/featureCosts";
import { toast } from "@/hooks/use-toast";
import { tx } from "@/lib/i18nText";

export const CreditSystemTestExample = () => {
  const handleGenerateCaption = async () => {
    // Simuliere Caption-Generierung
    await new Promise(resolve => setTimeout(resolve, 1000));
    toast({
      title: tx({ de: "Caption erstellt", en: "Caption created", es: "Caption creada" }),
      description: tx({ de: "Ihre Caption wurde erfolgreich generiert!", en: "Your caption was successfully generated!", es: "¡Tu caption se generó con éxito!" })
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
          {tx({ de: "Caption generieren (10 Credits)", en: "Generate caption (10 credits)", es: "Generar caption (10 créditos)" })}
        </Button>
      )}
    </CreditGuard>
  );
};
