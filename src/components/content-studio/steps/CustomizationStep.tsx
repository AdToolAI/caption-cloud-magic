import { Card } from '@/components/ui/card';
import { CustomizationForm } from '../CustomizationForm';
import type { ContentTemplate } from '@/types/content-studio';

interface CustomizationStepProps {
  selectedTemplate: ContentTemplate | null;
  customizations: Record<string, any>;
  onCustomizationsChange: (customizations: Record<string, any>) => void;
}

export const CustomizationStep = ({ 
  selectedTemplate, 
  customizations, 
  onCustomizationsChange 
}: CustomizationStepProps) => {
  if (!selectedTemplate) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Bitte wähle zuerst ein Template</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Passe dein Video an</h2>
        <p className="text-muted-foreground">
          Fülle die Felder aus um dein {selectedTemplate.name} zu personalisieren
        </p>
      </div>

      <CustomizationForm
        template={selectedTemplate}
        customizations={customizations}
        onChange={onCustomizationsChange}
      />
    </div>
  );
};
