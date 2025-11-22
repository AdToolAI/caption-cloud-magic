import { useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ContentTemplate } from '@/types/content-studio';

interface CustomizationFormProps {
  template: ContentTemplate;
  customizations: Record<string, any>;
  onChange: (customizations: Record<string, any>) => void;
}

export const CustomizationForm = ({ template, customizations, onChange }: CustomizationFormProps) => {
  const handleFieldChange = useCallback((key: string, value: any) => {
    onChange({
      ...customizations,
      [key]: value
    });
  }, [customizations, onChange]);

  return (
    <Card className="p-6 space-y-6">
      {template.customizable_fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>

          {field.type === 'text' && (
            <Input
              id={field.key}
              value={customizations[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
            />
          )}

          {field.type === 'textarea' && (
            <Textarea
              id={field.key}
              value={customizations[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              rows={4}
            />
          )}

          {field.type === 'number' && (
            <Input
              id={field.key}
              type="number"
              value={customizations[field.key] || ''}
              onChange={(e) => handleFieldChange(field.key, parseFloat(e.target.value))}
              placeholder={field.placeholder}
              required={field.required}
              min={field.validation?.min}
              max={field.validation?.max}
            />
          )}

          {field.type === 'select' && field.options && (
            <Select
              value={customizations[field.key] || ''}
              onValueChange={(value) => handleFieldChange(field.key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {field.type === 'color' && (
            <div className="flex gap-2">
              <Input
                id={field.key}
                type="color"
                value={customizations[field.key] || '#000000'}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                className="w-20 h-10"
              />
              <Input
                type="text"
                value={customizations[field.key] || '#000000'}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder="#000000"
                className="flex-1"
              />
            </div>
          )}
        </div>
      ))}

      {template.customizable_fields.length === 0 && (
        <p className="text-center text-muted-foreground py-8">
          Dieses Template benötigt keine Anpassungen
        </p>
      )}
    </Card>
  );
};
