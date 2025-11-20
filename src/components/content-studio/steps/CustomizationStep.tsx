import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CustomizationForm } from '../CustomizationForm';
import { AIScriptGenerator } from '@/components/video/AIScriptGenerator';
import type { ContentTemplate } from '@/types/content-studio';

interface CustomizationStepProps {
  selectedTemplate: ContentTemplate | null;
  customizations: Record<string, any>;
  onCustomizationsChange: (customizations: Record<string, any>) => void;
  brief?: string;
  onBriefChange?: (brief: string) => void;
}

export const CustomizationStep = ({ 
  selectedTemplate, 
  customizations, 
  onCustomizationsChange,
  brief = '',
  onBriefChange
}: CustomizationStepProps) => {
  if (!selectedTemplate) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Bitte wähle zuerst ein Template</p>
      </Card>
    );
  }

  const handleScriptGenerate = (script: string) => {
    // Split script into parts and fill text fields
    const lines = script.split('\n\n');
    const newCustomizations = { ...customizations };
    
    // Try to fill text fields by key
    const textFields = selectedTemplate?.customizable_fields?.filter(f => 
      f.type === 'text' && f.key.includes('TEXT')
    ) || [];

    if (textFields.length >= 1 && lines[0]) {
      newCustomizations[textFields[0].key] = lines[0];
    }
    if (textFields.length >= 2 && lines[1]) {
      newCustomizations[textFields[1].key] = lines[1];
    }
    if (textFields.length >= 3 && lines[2]) {
      newCustomizations[textFields[2].key] = lines[2];
    }

    onCustomizationsChange(newCustomizations);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Passe dein Video an</h2>
        <p className="text-muted-foreground">
          Fülle die Felder aus um dein {selectedTemplate.name} zu personalisieren
        </p>
      </div>

      {/* Brief Field */}
      {onBriefChange && (
        <div className="space-y-2">
          <Label>Was möchtest du erstellen?</Label>
          <Textarea
            placeholder="Beschreibe dein Video-Projekt in 1-2 Sätzen..."
            value={brief}
            onChange={(e) => onBriefChange(e.target.value)}
            rows={3}
            className="resize-none"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            {brief.length}/500 Zeichen
            {brief.length >= 20 && ' - AI Empfehlungen verfügbar ✨'}
          </p>
        </div>
      )}

      {/* AI Script Generator */}
      <AIScriptGenerator
        contentType={selectedTemplate?.content_type as any}
        onGenerate={handleScriptGenerate}
      />

      <CustomizationForm
        template={selectedTemplate}
        customizations={customizations}
        onChange={onCustomizationsChange}
      />
    </div>
  );
};
