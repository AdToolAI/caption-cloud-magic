import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useQualityPresets } from '@/hooks/useQualityPresets';
import { Sparkles } from 'lucide-react';

interface QualityPresetSelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export const QualityPresetSelector = ({ value, onChange }: QualityPresetSelectorProps) => {
  const { presets } = useQualityPresets();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Quality Preset
        </CardTitle>
      </CardHeader>
      <CardContent>
        <RadioGroup value={value} onValueChange={onChange}>
          {presets.filter(p => p.is_global).map((preset) => (
            <div key={preset.id} className="flex items-center space-x-2 p-3 rounded-lg hover:bg-accent/50">
              <RadioGroupItem value={preset.id} id={preset.id} />
              <Label htmlFor={preset.id} className="flex-1 cursor-pointer">
                <div className="font-medium">{preset.name}</div>
                <div className="text-xs text-muted-foreground">{preset.description}</div>
              </Label>
              <Badge variant="outline">{preset.config.resolution}</Badge>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
};
