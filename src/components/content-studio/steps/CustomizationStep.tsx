import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CustomizationForm } from '../CustomizationForm';
import { AIScriptGenerator } from '@/components/video/AIScriptGenerator';
import { RemotionPreviewPlayer } from '../RemotionPreviewPlayer';
import { supabase } from '@/integrations/supabase/client';
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
  const [previewKey, setPreviewKey] = useState(0);
  const [debouncedCustomizations, setDebouncedCustomizations] = useState(customizations);
  const [fieldMappings, setFieldMappings] = useState<Array<{
    field_key: string;
    remotion_prop_name: string;
    transformation_function?: string | null;
  }>>([]);

  // Load field mappings when template changes
  useEffect(() => {
    const loadFieldMappings = async () => {
      if (!selectedTemplate?.id) {
        setFieldMappings([]);
        return;
      }

      const { data, error } = await supabase
        .from('template_field_mappings')
        .select('field_key, remotion_prop_name, transformation_function')
        .eq('template_id', selectedTemplate.id);

      if (error) {
        console.error('Error loading field mappings:', error);
        setFieldMappings([]);
      } else {
        setFieldMappings(data || []);
      }
    };

    loadFieldMappings();
  }, [selectedTemplate?.id]);

  // Debounce customizations for preview updates (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCustomizations(customizations);
      setPreviewKey(prev => prev + 1);
    }, 300);

    return () => clearTimeout(timer);
  }, [customizations]);

  // Memoize preview props for performance
  const previewProps = useMemo(() => {
    const aspectRatio = selectedTemplate?.aspect_ratio || '9:16';
    const [arWidth, arHeight] = aspectRatio.split(':').map(Number);
    
    // Calculate dimensions based on aspect ratio
    let width = 1080;
    let height = 1920;
    
    if (aspectRatio === '16:9') {
      width = 1920;
      height = 1080;
    } else if (aspectRatio === '1:1') {
      width = 1080;
      height = 1080;
    } else if (aspectRatio === '4:5') {
      width = 1080;
      height = 1350;
    } else if (aspectRatio === '4:3') {
      width = 1440;
      height = 1080;
    }
    
    const componentName = selectedTemplate?.template_config?.component_name || 'UniversalVideo';
    const durationInFrames = Math.ceil((selectedTemplate?.duration_max || 15) * 30); // fps = 30
    
    return {
      componentName,
      customizations: debouncedCustomizations,
      width,
      height,
      durationInFrames,
      remotionComponentId: selectedTemplate?.remotion_component_id as any,
      fieldMappings,
    };
  }, [selectedTemplate, debouncedCustomizations, fieldMappings]);

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

      {/* Mobile: Tabs zwischen Form und Preview */}
      <div className="lg:hidden">
        <Tabs defaultValue="form" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="form">Anpassungen</TabsTrigger>
            <TabsTrigger value="preview">Vorschau</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="space-y-6 mt-6">
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

            <AIScriptGenerator
              contentType={selectedTemplate?.content_type as any}
              onGenerate={handleScriptGenerate}
            />

            <CustomizationForm
              template={selectedTemplate}
              customizations={customizations}
              onChange={onCustomizationsChange}
            />
          </TabsContent>
          <TabsContent value="preview" className="mt-6">
            <RemotionPreviewPlayer key={previewKey} {...previewProps} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop: Split-Screen Layout */}
      <div className="hidden lg:grid lg:grid-cols-2 lg:gap-8">
        {/* Left: Form */}
        <div className="space-y-6">
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

        {/* Right: Live Preview */}
        <div className="sticky top-6 h-fit">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-semibold">Live-Vorschau</Label>
              <span className="text-xs text-muted-foreground">
                Änderungen werden automatisch angezeigt
              </span>
            </div>
            <RemotionPreviewPlayer key={previewKey} {...previewProps} />
          </div>
        </div>
      </div>
    </div>
  );
};
